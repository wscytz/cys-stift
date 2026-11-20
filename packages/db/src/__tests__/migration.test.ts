import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CardService } from '@cys-stift/domain'
import { createFileDb, migrateLegacyCardTimestamps } from '../index'
import { SqliteCardRepository } from '../repositories'

describe('SQLite schema migration', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cys-stift-db-migration-'))
    file = join(dir, 'legacy.sqlite')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T10:00:00.000Z'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(dir, { recursive: true, force: true })
  })

  it('requires explicit provenance, then migrates cards once without touching workspace/canvas seconds', () => {
    const first = createFileDb(file)
    const service = new CardService(new SqliteCardRepository(first))
    const card = service.create({ title: 'legacy timestamp', source: { kind: 'manual', deviceId: 'd1' } })
    service.softDelete(card.id)
    const before = service.get(card.id)!
    const seconds = (date: Date | undefined) => (date ? Math.floor(date.getTime() / 1000) : null)
    first.raw.prepare(
      'UPDATE cards SET captured_at = ?, created_at = ?, updated_at = ?, deleted_at = ? WHERE id = ?',
    ).run(
      seconds(before.capturedAt),
      seconds(before.createdAt),
      seconds(before.updatedAt),
      seconds(before.deletedAt),
      card.id,
    )
    // Workspace/canvas timestamps stay in seconds by schema contract.
    first.raw.prepare('INSERT INTO workspaces (id, name, default_canvas_id, created_at) VALUES (?, ?, ?, ?)').run('ws-1', 'WS', 'cv-1', 1_700_000_000)
    first.raw.prepare('INSERT INTO canvases (id, workspace_id, name, view_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('cv-1', 'ws-1', 'Canvas', '{}', 1_700_000_000, 1_700_000_001)
    first.raw.pragma('user_version = 0')
    first.raw.close()

    // Default open must not guess: 1_700_000_000 is also a valid 1970 ms value.
    const reopened = createFileDb(file)
    // A second connection opened while the file is still v0 must not scale twice.
    const secondConnection = createFileDb(file)
    expect(reopened.raw.pragma('user_version', { simple: true })).toBe(0)
    expect(reopened.raw.prepare('SELECT captured_at FROM cards WHERE id = ?').get(card.id)).toEqual({ captured_at: seconds(before.capturedAt) })
    migrateLegacyCardTimestamps(reopened)
    expect(() => migrateLegacyCardTimestamps(secondConnection)).not.toThrow()
    expect(secondConnection.raw.prepare('SELECT captured_at FROM cards WHERE id = ?').get(card.id)).toEqual({ captured_at: before.capturedAt.getTime() })
    secondConnection.raw.close()
    const after = new CardService(new SqliteCardRepository(reopened)).get(card.id)!
    expect(after.capturedAt.toISOString()).toBe(before.capturedAt.toISOString())
    expect(after.createdAt.toISOString()).toBe(before.createdAt.toISOString())
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString())
    expect(after.deletedAt?.toISOString()).toBe(before.deletedAt?.toISOString())
    expect(reopened.raw.pragma('user_version', { simple: true })).toBe(1)
    expect(reopened.raw.prepare('SELECT created_at FROM workspaces WHERE id = ?').get('ws-1')).toEqual({ created_at: 1_700_000_000 })
    expect(reopened.raw.prepare('SELECT created_at, updated_at FROM canvases WHERE id = ?').get('cv-1')).toEqual({ created_at: 1_700_000_000, updated_at: 1_700_000_001 })
    reopened.raw.close()

    // A second open must not multiply the already-millisecond values again.
    const reopenedAgain = createFileDb(file)
    const stable = new CardService(new SqliteCardRepository(reopenedAgain)).get(card.id)!
    expect(stable.capturedAt.toISOString()).toBe(before.capturedAt.toISOString())
    expect(stable.updatedAt.toISOString()).toBe(before.updatedAt.toISOString())
    reopenedAgain.raw.close()
  })

  it('does not rewrite ambiguous early-millisecond card values', () => {
    const first = createFileDb(file)
    const service = new CardService(new SqliteCardRepository(first))
    const card = service.create({ title: 'early ms', source: { kind: 'manual', deviceId: 'd1' } })
    first.raw.prepare('UPDATE cards SET captured_at = ?, created_at = ?, updated_at = ? WHERE id = ?').run(1_600_000_000, 1_600_000_000, 1_600_000_000, card.id)
    first.raw.pragma('user_version = 0')
    first.raw.close()

    const reopened = createFileDb(file)
    expect(reopened.raw.prepare('SELECT captured_at, created_at, updated_at FROM cards WHERE id = ?').get(card.id)).toEqual({
      captured_at: 1_600_000_000,
      created_at: 1_600_000_000,
      updated_at: 1_600_000_000,
    })
    expect(reopened.raw.pragma('user_version', { simple: true })).toBe(0)
    reopened.raw.close()
  })
})
