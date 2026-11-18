/**
 * Integration test: spin up an in-memory SQLite, wire SqliteCardRepository,
 * run the CardService end to end, verify everything round-trips.
 *
 * This is the closest thing we have to "the data layer works" before Phase 3
 * builds real Inbox UI on top.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CardService, type CaptureSource, toCanvasId, toCardId } from '@cys-stift/domain'
import { createMemoryDb, type DbHandle } from '../drizzle-client'
import { SqliteCardRepository } from '../repositories'

const source: CaptureSource = { kind: 'manual', deviceId: 'test-device-1' }

describe('SQLite repository', () => {
  let service: CardService
  let handle: DbHandle

  beforeEach(() => {
    handle = createMemoryDb()
    const repo = new SqliteCardRepository(handle)
    service = new CardService(repo)
  })

  afterEach(() => {
    handle.raw.close()
    vi.useRealTimers()
  })

  it('inserts and retrieves a card', () => {
    const created = service.create({ title: 'sql round-trip', source })
    const fetched = service.get(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.title).toBe('sql round-trip')
    expect(fetched?.source.kind).toBe('manual')
  })

  it('preserves JSON columns through round-trip (links, code, quote, source)', () => {
    const card = service.create({
      title: 'rich card',
      source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'd1' },
      links: [{ url: 'https://example.com', fetchedAt: new Date() }],
      codeSnippets: [{ language: 'ts', code: 'const x = 1' }],
      quotes: [{ text: 'less is more', attribution: 'Dieter Rams' }],
    })

    const fetched = service.get(card.id)!
    expect(fetched.links).toHaveLength(1)
    expect(fetched.links[0]?.url).toBe('https://example.com')
    expect(fetched.links[0]?.fetchedAt).toBeInstanceOf(Date)
    expect(fetched.codeSnippets).toHaveLength(1)
    expect(fetched.quotes[0]?.text).toBe('less is more')
    if (fetched.source.kind === 'shortcut') {
      expect(fetched.source.shortcutId).toBe('cmd-shift-space')
    }
  })

  it('preserves tags through SQLite round-trip (v0.37.0 — was silently dropped)', () => {
    // P4 (v0.32.0) added Card.tags, but the db codec/schema had no tagsJson
    // column until v0.37.0, so a tagged card round-tripped with tags: [].
    // This test is the regression guard.
    const card = service.create({
      title: 'tagged card',
      source,
      tags: [
        { value: 'urgent', color: 'var(--color-red)' },
        { value: 'idea', color: 'var(--color-blue)' },
      ],
    })
    const fetched = service.get(card.id)!
    expect(fetched.tags).toHaveLength(2)
    expect(fetched.tags[0]?.value).toBe('urgent')
    expect(fetched.tags[0]?.color).toBe('var(--color-red)')
    expect(fetched.tags[1]?.value).toBe('idea')

    // update() must also preserve tags across a write.
    service.update(card.id, { body: 'edited' })
    const refetched = service.get(card.id)!
    expect(refetched.tags).toHaveLength(2)
    expect(refetched.tags[0]?.value).toBe('urgent')
  })

  it('handles canvasPosition with optional rotation', () => {
    const card = service.create({
      title: 'placed',
      source,
      canvasPosition: {
        canvasId: toCanvasId('canvas-1'),
        x: 8,
        y: 16,
        w: 240,
        h: 120,
        z: 0,
      },
    })
    const fetched = service.get(card.id)!
    expect(fetched.canvasPosition?.canvasId).toBe('canvas-1')
    expect(fetched.canvasPosition?.x).toBe(8)
    expect(fetched.canvasPosition?.rotation).toBeUndefined()
  })

  it('archive + unarchive persists', () => {
    const c = service.create({ title: 'arch me', source })
    service.archive(c.id)
    expect(service.get(c.id)?.archived).toBe(true)
    expect(service.listInbox()).toHaveLength(0)
    service.unarchive(c.id)
    expect(service.get(c.id)?.archived).toBe(false)
    expect(service.listInbox()).toHaveLength(1)
  })

  it('soft delete sets deletedAt', () => {
    const c = service.create({ title: 'bye', source })
    service.softDelete(c.id)
    const fetched = service.get(c.id)
    expect(fetched?.deletedAt).toBeInstanceOf(Date)
  })

  it('applies expected/next card changes atomically', () => {
    const first = service.create({ title: 'first', source })
    const second = service.create({ title: 'second', source })
    const firstStored = service.get(first.id)!
    const secondStored = service.get(second.id)!
    const firstNext = { ...firstStored, title: 'first updated', updatedAt: new Date(firstStored.updatedAt.getTime() + 1_000) }
    expect(service.applyBatch([
      { id: first.id, expected: firstStored, next: firstNext },
      { id: second.id, expected: { ...secondStored, title: 'stale' }, next: null },
    ])).toBe(false)
    expect(service.get(first.id)?.title).toBe('first')
    expect(service.get(second.id)?.title).toBe('second')

    expect(service.applyBatch([
      { id: first.id, expected: firstStored, next: firstNext },
      { id: second.id, expected: secondStored, next: null },
    ])).toBe(true)
    expect(service.get(first.id)?.title).toBe('first updated')
    expect(service.get(second.id)).toBeNull()
  })

  it.each([false, true])('restore retains archived=%s and the original placement after SQLite round-trips', (archived) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T10:00:00.000Z'))
    const canvasPosition = {
      canvasId: toCanvasId('restore-canvas'),
      x: -24,
      y: 48,
      w: 320,
      h: 160,
      z: 4,
      rotation: 15,
    }
    const created = service.create({
      title: 'restore me',
      body: 'keep this content',
      source,
      archived,
      pinned: true,
      tags: [{ value: 'keep', color: 'var(--color-blue)' }],
      canvasPosition,
    })
    const before = service.get(created.id)!
    vi.setSystemTime(new Date('2026-06-24T10:00:00.000Z'))
    service.softDelete(created.id)
    const deleted = service.get(created.id)!
    expect(deleted.deletedAt).toBeInstanceOf(Date)
    expect(deleted).toMatchObject({ archived, canvasPosition })
    expect(service.listAll()).toEqual([])
    expect(service.listOnCanvas(canvasPosition.canvasId)).toEqual([])

    const reloaded = new CardService(new SqliteCardRepository(handle))
    vi.setSystemTime(new Date('2026-06-25T10:00:00.000Z'))
    expect(reloaded.restore(created.id)).toBe(true)
    const restored = new SqliteCardRepository(handle).getById(created.id)!
    expect(restored).toEqual({
      ...before,
      deletedAt: undefined,
      updatedAt: new Date('2026-06-25T10:00:00.000Z'),
    })
    expect(handle.raw.prepare('SELECT archived, deleted_at FROM cards WHERE id = ?').get(created.id))
      .toEqual({ archived: archived ? 1 : 0, deleted_at: null })
    expect(reloaded.listAll()).toEqual([restored])
    expect(reloaded.listOnCanvas(canvasPosition.canvasId)).toEqual([restored])
    expect(reloaded.listInbox()).toEqual([])
  })

  it('rolls back earlier inserts, updates and deletes on a mid-batch SQLite failure and propagates the error', () => {
    const first = service.create({ title: 'first', source })
    const second = service.create({ title: 'second', source })
    const rejected = service.create({ title: 'reject this update', source })
    const firstStored = service.get(first.id)!
    const secondStored = service.get(second.id)!
    const rejectedStored = service.get(rejected.id)!
    const insertedAt = new Date('2026-06-23T10:00:00.000Z')
    const inserted = {
      ...service.materializeWithId(toCardId('rollback-inserted'), {
        title: 'new', source, capturedAt: insertedAt, createdAt: insertedAt,
      }),
      updatedAt: insertedAt,
    }
    const changes = [
      { id: inserted.id, expected: null, next: inserted },
      { id: first.id, expected: firstStored, next: { ...firstStored, archived: true } },
      { id: second.id, expected: secondStored, next: null },
      { id: rejected.id, expected: rejectedStored, next: { ...rejectedStored, title: 'batch-failure' } },
    ]
    const rowsBefore = handle.raw.prepare('SELECT * FROM cards ORDER BY id').all()
    handle.raw.exec(`
      CREATE TRIGGER reject_batch_update
      BEFORE UPDATE OF title ON cards
      WHEN NEW.title = 'batch-failure'
      BEGIN
        SELECT RAISE(ABORT, 'maintenance batch failure');
      END;
    `)

    expect(() => service.applyBatch(changes)).toThrow('maintenance batch failure')
    expect(handle.raw.inTransaction).toBe(false)
    expect(handle.raw.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(rowsBefore)
    const reloaded = new CardService(new SqliteCardRepository(handle))
    expect(reloaded.get(inserted.id)).toBeNull()
    expect(reloaded.get(first.id)).toEqual(firstStored)
    expect(reloaded.get(second.id)).toEqual(secondStored)
    expect(reloaded.get(rejected.id)).toEqual(rejectedStored)

    handle.raw.exec('DROP TRIGGER reject_batch_update')
    expect(reloaded.applyBatch(changes)).toBe(true)
    expect(reloaded.get(inserted.id)).toEqual(inserted)
    expect(reloaded.get(first.id)?.archived).toBe(true)
    expect(reloaded.get(second.id)).toBeNull()
    expect(reloaded.get(rejected.id)?.title).toBe('batch-failure')
  })

  it('inserts with a null expectation and rejects an occupied id without committing earlier changes', () => {
    const existing = service.create({ title: 'existing', source })
    const existingStored = service.get(existing.id)!
    const insertedAt = new Date('2026-06-23T10:00:00.000Z')
    const inserted = {
      ...service.materializeWithId(toCardId('batch-created'), {
        title: 'inserted', source, capturedAt: insertedAt, createdAt: insertedAt,
      }),
      updatedAt: insertedAt,
    }
    const missingId = toCardId('batch-missing')

    expect(service.applyBatch([
      { id: existing.id, expected: existingStored, next: { ...existingStored, title: 'updated' } },
      { id: inserted.id, expected: null, next: inserted },
      { id: missingId, expected: null, next: null },
    ])).toBe(true)
    const reloaded = new CardService(new SqliteCardRepository(handle))
    const insertedStored = reloaded.get(inserted.id)!
    expect(insertedStored).toEqual(inserted)
    expect(reloaded.get(existing.id)?.title).toBe('updated')
    expect(reloaded.get(missingId)).toBeNull()
    const updatedExisting = reloaded.get(existing.id)!
    const rowsBefore = handle.raw.prepare('SELECT * FROM cards ORDER BY id').all()

    expect(reloaded.applyBatch([
      { id: existing.id, expected: updatedExisting, next: null },
      { id: inserted.id, expected: null, next: { ...insertedStored, title: 'overwritten' } },
    ])).toBe(false)
    expect(handle.raw.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(rowsBefore)
    expect(reloaded.get(existing.id)).toEqual(updatedExisting)
    expect(reloaded.get(inserted.id)).toEqual(insertedStored)
  })

  it('listInbox excludes archived and on-canvas cards', () => {
    service.create({ title: 'inbox A', source })
    service.create({ title: 'inbox B', source })
    const arch = service.create({ title: 'arch', source })
    service.archive(arch.id)
    const placed = service.create({
      title: 'on canvas',
      source,
      canvasPosition: { canvasId: toCanvasId('c1'), x: 0, y: 0, w: 240, h: 120, z: 0 },
    })

    expect(service.listInbox().map((c) => c.title).sort()).toEqual(['inbox A', 'inbox B'])
    expect(service.listInbox()).toHaveLength(2)
    // sanity: all 4 cards still exist
    expect(service.listAll()).toHaveLength(4)
    void placed
  })
})
