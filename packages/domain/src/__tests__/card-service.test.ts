import { describe, it, expect, beforeEach } from 'vitest'
import { CardService, type CardRepository } from '../services/card-service'
import type { Card, CardId, CanvasId, MediaAssetId, MediaRef, WorkspaceId, TagRef } from '../types'
import { TAG_COLORS, normalizeTagColor } from '../types'
import { toCardId } from '../codec'
import { StorageQuotaError } from '../errors'

class InMemoryCardRepository implements CardRepository {
  private store = new Map<CardId, Card>()

  insert(card: Card) {
    this.store.set(card.id, card)
  }
  update(card: Card) {
    this.store.set(card.id, card)
  }
  delete(id: CardId) {
    this.store.delete(id)
  }
  getById(id: CardId) {
    return this.store.get(id) ?? null
  }
  listInbox() {
    return [...this.store.values()]
      .filter((c) => !c.canvasPosition && !c.archived && !c.deletedAt)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
  }
  listOnCanvas(canvasId: CanvasId) {
    return [...this.store.values()]
      .filter((c) => c.canvasPosition?.canvasId === canvasId)
      .sort((a, b) => (a.canvasPosition?.z ?? 0) - (b.canvasPosition?.z ?? 0))
  }
  listAll() {
    return [...this.store.values()]
  }
  applyBatch(changes: Array<{ id: CardId; expected: Card | null; next: Card | null }>) {
    const next = new Map(this.store)
    for (const change of changes) if (JSON.stringify(this.store.get(change.id) ?? null) !== JSON.stringify(change.expected)) return false
    for (const change of changes) change.next ? next.set(change.id, change.next) : next.delete(change.id)
    this.store = next
    return true
  }
}

const dummySource = { kind: 'manual' as const, deviceId: 'test-device' }

describe('CardService', () => {
  let repo: InMemoryCardRepository
  let service: CardService

  beforeEach(() => {
    repo = new InMemoryCardRepository()
    service = new CardService(repo)
  })

  it('creates a card with defaults', () => {
    const card = service.create({
      title: '灵感一则',
      source: dummySource,
    })
    expect(card.id).toBeTruthy()
    expect(card.title).toBe('灵感一则')
    expect(card.type).toBe('note')
    expect(card.archived).toBe(false)
    expect(card.pinned).toBe(false)
    expect(card.canvasPosition).toBeUndefined()
  })

  it('applies expected/next batches atomically', () => {
    const card = service.create({ title: 'before', source: dummySource })
    expect(service.applyBatch([{ id: card.id, expected: { ...card, title: 'wrong' }, next: { ...card, title: 'after' } }])).toBe(false)
    expect(service.get(card.id)?.title).toBe('before')
    expect(service.applyBatch([{ id: card.id, expected: card, next: { ...card, title: 'after' } }])).toBe(true)
    expect(service.get(card.id)?.title).toBe('after')
  })

  it('lists inbox (no canvasPosition, not archived)', () => {
    service.create({ title: 'A', source: dummySource })
    service.create({ title: 'B', source: dummySource })
    const archiveCandidate = service.create({ title: 'C', source: dummySource })
    service.archive(archiveCandidate.id)

    expect(service.listInbox()).toHaveLength(2)
    expect(service.listInbox().map((c) => c.title).sort()).toEqual(['A', 'B'])
  })

  it('archives and unarchives', () => {
    const c = service.create({ title: 'arch me', source: dummySource })
    expect(service.get(c.id)?.archived).toBe(false)
    service.archive(c.id)
    expect(service.get(c.id)?.archived).toBe(true)
    service.unarchive(c.id)
    expect(service.get(c.id)?.archived).toBe(false)
  })

  it('moves a card to canvas', () => {
    const c = service.create({ title: 'move me', source: dummySource })
    const canvasId = 'c1' as CanvasId
    service.moveToCanvas(c.id, {
      canvasId,
      x: 8,
      y: 16,
      w: 240,
      h: 120,
      z: 0,
    })
    expect(service.get(c.id)?.canvasPosition?.canvasId).toBe(canvasId)
    expect(service.listOnCanvas(canvasId)).toHaveLength(1)
    expect(service.listInbox()).toHaveLength(0)
  })

  it('soft deletes', () => {
    const c = service.create({ title: 'bye', source: dummySource })
    service.softDelete(c.id)
    const fetched = service.get(c.id)
    expect(fetched?.deletedAt).toBeInstanceOf(Date)
    // soft-deleted cards still retrievable by id (DB keeps tombstone)
    expect(fetched).not.toBeNull()
  })

  it('fromCapture builds a card from CaptureInput', () => {
    const card = service.fromCapture({
      title: 'from capture',
      body: '...',
      source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'd1' },
    })
    expect(card.source.kind).toBe('shortcut')
    if (card.source.kind === 'shortcut') {
      expect(card.source.shortcutId).toBe('cmd-shift-space')
    }
  })

  it('update mutates whitelisted fields and bumps updatedAt', async () => {
    const c = service.create({ title: 'old', body: 'b', source: dummySource })
    const before = c.updatedAt.getTime()
    // small delay so the timestamps differ deterministically
    await new Promise((r) => setTimeout(r, 5))
    const next = service.update(c.id, { title: 'new', body: 'B' })
    expect(next).not.toBeNull()
    expect(next?.title).toBe('new')
    expect(next?.body).toBe('B')
    expect(next?.updatedAt.getTime()).toBeGreaterThan(before)
  })

  it('update only touches provided fields', () => {
    const c = service.create({ title: 'keep', source: dummySource })
    service.update(c.id, { title: 'changed' })
    const fetched = service.get(c.id)
    expect(fetched?.title).toBe('changed')
    expect(fetched?.type).toBe('note')
    expect(fetched?.archived).toBe(false)
  })

  it('clears color only when patch explicitly uses null', () => {
    const c = service.create({
      title: 'colored',
      source: dummySource,
      color: 'red',
    })
    expect(service.update(c.id, { title: 'kept' })?.color).toBe('red')
    expect(service.update(c.id, { color: null })?.color).toBeUndefined()
  })

  it('update can swap multi-media arrays', () => {
    const c = service.create({ title: 'media', source: dummySource })
    service.update(c.id, {
      links: [{ url: 'https://a.example', fetchedAt: new Date() }],
      codeSnippets: [{ language: 'ts', code: 'const x = 1' }],
      quotes: [{ text: 'q', attribution: 'a' }],
    })
    const fetched = service.get(c.id)
    expect(fetched?.links).toHaveLength(1)
    expect(fetched?.codeSnippets).toHaveLength(1)
    expect(fetched?.quotes).toHaveLength(1)
  })

  it('update can swap media array', () => {
    const c = service.create({ title: 'media-assets', source: dummySource })
    const a1: MediaRef = { assetId: 'a1' as MediaAssetId, order: 0 }
    const a2: MediaRef = { assetId: 'a2' as MediaAssetId, order: 1 }
    service.update(c.id, { media: [a1, a2] })
    const fetched = service.get(c.id)
    expect(fetched?.media).toHaveLength(2)
    expect(fetched?.media[0]?.assetId).toBe('a1')
  })

  it('update returns null for unknown id', () => {
    const result = service.update('nope' as CardId, { title: 'x' })
    expect(result).toBeNull()
  })

  it('restore clears deletedAt and preserves archived/canvasPosition', async () => {
    // archive + move to canvas, then soft-delete, then restore
    const c = service.create({ title: 'round trip', source: dummySource })
    const canvasId = 'c1' as CanvasId
    const position = { canvasId, x: 0, y: 0, w: 200, h: 100, z: 0 }
    service.moveToCanvas(c.id, position)
    service.archive(c.id)
    const before = service.get(c.id)
    expect(before?.deletedAt).toBeUndefined()
    const beforeUpdate = before!.updatedAt.getTime()
    await new Promise((r) => setTimeout(r, 5))
    service.softDelete(c.id)
    expect(service.get(c.id)?.deletedAt).toBeInstanceOf(Date)

    const ok = service.restore(c.id)
    expect(ok).toBe(true)
    const restored = service.get(c.id)
    expect(restored).not.toBeNull()
    expect(restored?.deletedAt).toBeUndefined()
    // archived + canvasPosition untouched (so card returns to its previous
    // view naturally — archive or canvas, not inbox)
    expect(restored?.archived).toBe(true)
    expect(restored?.canvasPosition).toEqual(position)
    // updatedAt bumped
    expect(restored!.updatedAt.getTime()).toBeGreaterThan(beforeUpdate)
  })

  it('restore on unknown id returns false (idempotent no-op)', () => {
    const ok = service.restore('nope' as CardId)
    expect(ok).toBe(false)
  })

  it('hardDelete removes the card entirely', () => {
    const c = service.create({ title: 'gone', source: dummySource })
    expect(service.get(c.id)).not.toBeNull()
    const ok = service.hardDelete(c.id)
    expect(ok).toBe(true)
    expect(service.get(c.id)).toBeNull()
    expect(service.listAll().some((x) => x.id === c.id)).toBe(false)
  })

  it('hardDelete on unknown id returns false (idempotent no-op)', () => {
    const ok = service.hardDelete('nope' as CardId)
    expect(ok).toBe(false)
  })

  it('removeFromCanvas clears canvasPosition so card returns to inbox', () => {
    const c = service.create({ title: 'on canvas', source: dummySource })
    const canvasId = 'c1' as CanvasId
    service.moveToCanvas(c.id, { canvasId, x: 0, y: 0, w: 200, h: 100, z: 0 })
    expect(service.listInbox()).toHaveLength(0)
    expect(service.listOnCanvas(canvasId)).toHaveLength(1)

    const ok = service.removeFromCanvas(c.id)
    expect(ok).toBe(true)

    const after = service.get(c.id)
    expect(after?.canvasPosition).toBeUndefined()
    expect(service.listInbox()).toHaveLength(1)
    expect(service.listOnCanvas(canvasId)).toHaveLength(0)
  })

  it('removeFromCanvas is idempotent (no-op when not on canvas)', () => {
    const c = service.create({ title: 'inbox', source: dummySource })
    expect(c.canvasPosition).toBeUndefined()
    const ok = service.removeFromCanvas(c.id)
    expect(ok).toBe(false)
    expect(service.get(c.id)?.canvasPosition).toBeUndefined()
  })

  // ── Tags (P4) ─────────────────────────────────────────────────────────

  it('creates a card with an empty tags array', () => {
    const c = service.create({ title: 'no tags', source: dummySource })
    expect(c.tags).toEqual([])
  })

  it('creates a card with initial tags', () => {
    const c = service.create({
      title: 'tagged',
      source: dummySource,
      tags: [{ value: 'idea', color: 'var(--color-red)' }],
    })
    expect(c.tags).toHaveLength(1)
    expect(c.tags[0]?.value).toBe('idea')
    expect(c.tags[0]?.color).toBe('var(--color-red)')
  })

  it('preserves import metadata (pinned/archived/capturedAt/createdAt) when supplied', () => {
    // R2: .cystift / JSON 导出往返 —— create 带可选元数据时如实保留,而非硬编码默认。
    const capturedAt = new Date('2026-06-21T00:00:00Z')
    const createdAt = new Date('2026-06-22T00:00:00Z')
    const card = service.create({
      title: '导入卡',
      source: dummySource,
      pinned: true,
      archived: true,
      capturedAt,
      createdAt,
    })
    expect(card.pinned).toBe(true)
    expect(card.archived).toBe(true)
    expect(card.capturedAt).toEqual(capturedAt)
    expect(card.createdAt).toEqual(createdAt)
    // updatedAt 始终是 now(恢复事件),不透传源卡的 updatedAt。
    expect(card.updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime())
  })

  it('defaults lifecycle/timestamps when metadata absent (backward compat)', () => {
    const before = Date.now()
    const card = service.create({ title: 'fresh', source: dummySource })
    expect(card.pinned).toBe(false)
    expect(card.archived).toBe(false)
    expect(card.capturedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(card.createdAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('addTag adds a new tag with a random palette color', () => {
    const c = service.create({ title: 'a', source: dummySource })
    const updated = service.addTag(c.id, 'urgent')
    expect(updated).not.toBeNull()
    expect(updated?.tags).toHaveLength(1)
    expect(updated?.tags[0]?.value).toBe('urgent')
    // color must come from the palette
    expect(TAG_COLORS).toContain(updated?.tags[0]?.color)
  })

  it('addTag trims the tag value', () => {
    const c = service.create({ title: 'a', source: dummySource })
    const updated = service.addTag(c.id, '  spaced  ')
    expect(updated?.tags[0]?.value).toBe('spaced')
  })

  it('addTag is idempotent — same value returns unchanged card', () => {
    const c = service.create({ title: 'a', source: dummySource })
    const u1 = service.addTag(c.id, 'x')
    const u2 = service.addTag(c.id, 'x')
    expect(u2?.tags).toHaveLength(1)
    // colors preserved on re-add
    expect(u2?.tags[0]?.color).toBe(u1?.tags[0]?.color)
  })

  it('removeTag removes a tag by value', () => {
    const c = service.create({
      title: 'a',
      source: dummySource,
      tags: [
        { value: 'a', color: 'var(--color-red)' },
        { value: 'b', color: 'var(--color-blue)' },
      ],
    })
    const updated = service.removeTag(c.id, 'a')
    expect(updated?.tags).toHaveLength(1)
    expect(updated?.tags[0]?.value).toBe('b')
  })

  it('removeTag is idempotent — missing value is no-op', () => {
    const c = service.create({ title: 'a', source: dummySource })
    const updated = service.removeTag(c.id, 'ghost')
    expect(updated).not.toBeNull()
    expect(updated?.tags).toEqual([])
  })

  it('addTag and removeTag return null for unknown card', () => {
    expect(service.addTag('nope' as CardId, 'x')).toBeNull()
    expect(service.removeTag('nope' as CardId, 'x')).toBeNull()
  })

  it('listTags aggregates unique tags with counts', () => {
    service.create({
      title: 'c1',
      source: dummySource,
      tags: [
        { value: 'a', color: 'var(--color-red)' },
        { value: 'b', color: 'var(--color-blue)' },
      ],
    })
    service.create({
      title: 'c2',
      source: dummySource,
      tags: [{ value: 'a', color: 'var(--color-red)' }],
    })
    const summary = service.listTags()
    expect(summary).toHaveLength(2)
    const a = summary.find((s) => s.value === 'a')
    const b = summary.find((s) => s.value === 'b')
    expect(a?.count).toBe(2)
    expect(b?.count).toBe(1)
    expect(a?.color).toBe('var(--color-red)')
  })

  it('listByTags returns cards matching any of the given tags', () => {
    const c1 = service.create({
      title: 'red tagged',
      source: dummySource,
      tags: [{ value: 'x', color: 'var(--color-red)' }],
    })
    const c2 = service.create({
      title: 'blue tagged',
      source: dummySource,
      tags: [{ value: 'y', color: 'var(--color-blue)' }],
    })
    service.create({ title: 'untagged', source: dummySource })

    const result = service.listByTags(['x', 'y'])
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort())
  })

  it('listByTags with empty array returns empty', () => {
    service.create({ title: 'x', source: dummySource, tags: [{ value: 'a', color: 'var(--color-red)' }] })
    expect(service.listByTags([])).toEqual([])
  })

  it('update can change tags', () => {
    const c = service.create({ title: 'a', source: dummySource })
    service.update(c.id, {
      tags: [{ value: 'new', color: 'var(--color-purple)' }],
    })
    const fetched = service.get(c.id)
    expect(fetched?.tags).toHaveLength(1)
    expect(fetched?.tags[0]?.value).toBe('new')
  })

  it('moveToCanvas 守卫 NaN/Infinity 坐标(防 localStorage 序列化成 null → reload 崩)', () => {
    const c = service.create({ title: 'nan guard', source: dummySource })
    service.moveToCanvas(c.id, {
      canvasId: 'c1' as CanvasId,
      x: NaN, y: Infinity, w: -Infinity, h: 100, z: NaN,
    })
    const stored = service.get(c.id)
    // 非有限值兜底:x/y/z → 0, w → 默认 240;有限值(h:100)原样保留。
    expect(stored?.canvasPosition?.x).toBe(0)
    expect(stored?.canvasPosition?.y).toBe(0)
    expect(stored?.canvasPosition?.w).toBe(240)
    expect(stored?.canvasPosition?.h).toBe(100)
    expect(stored?.canvasPosition?.z).toBe(0)
  })
})

describe('tag color migration', () => {
  it('maps legacy and malformed values to available tokens', () => {
    expect(normalizeTagColor('var(--color-teal)')).toBe('var(--color-blue)')
    expect(normalizeTagColor('purple')).toBe('var(--color-blue)')
    expect(normalizeTagColor('var(--color-green)')).toBe('var(--color-gray)')
    expect(normalizeTagColor('not-a-color')).toBe('var(--color-gray)')
    for (const color of TAG_COLORS) expect(normalizeTagColor(color)).toBe(color)
  })

  it('normalizes legacy colors on create and update', () => {
    const repo = new InMemoryCardRepository()
    const svc = new CardService(repo)
    const card = svc.create({
      title: 'legacy',
      source: dummySource,
      tags: [{ value: 'old', color: 'var(--color-purple)' as never }],
    })
    expect(card.tags[0]!.color).toBe('var(--color-blue)')
    const updated = svc.update(card.id, {
      tags: [{ value: 'new', color: 'var(--color-orange)' as never }],
    })!
    expect(updated.tags[0]!.color).toBe('var(--color-yellow)')
  })
})

describe('CardService.createWithId', () => {
  it('creates a card with the given id', () => {
    const svc = new CardService(new InMemoryCardRepository())
    const id = toCardId('c1')
    const card = svc.createWithId(id, { title: 'hi', source: { kind: 'manual', deviceId: 'web' } })
    expect(card.id).toBe(id)
    expect(card.title).toBe('hi')
    expect(svc.get(id)?.title).toBe('hi')
  })

  it('respects canvasPosition when provided', () => {
    const svc = new CardService(new InMemoryCardRepository())
    const id = toCardId('c2')
    svc.createWithId(id, {
      title: '', source: { kind: 'manual', deviceId: 'web' },
      canvasPosition: { canvasId: 'default-canvas' as CanvasId, x: 100, y: 200, w: 240, h: 120, z: 0, rotation: 0 },
    })
    expect(svc.get(id)?.canvasPosition).toMatchObject({ x: 100, y: 200 })
  })
})

// ── 配额失败:CardService.write 捕获 StorageQuotaError(quota-update-fix) ──
// update/addTag 等配额满时返失败值(null/false),不返幻影状态;void mutator 静默 no-op。
class QuotaCardRepository implements CardRepository {
  private store = new Map<CardId, Card>()
  insert(card: Card) { this.store.set(card.id, card) }
  update(_card: Card) { throw new StorageQuotaError() }
  delete(_id: CardId) { throw new StorageQuotaError() }
  getById(id: CardId) { return this.store.get(id) ?? null }
  listInbox() { return [...this.store.values()] }
  listOnCanvas(canvasId: CanvasId) {
    return [...this.store.values()].filter((c) => c.canvasPosition?.canvasId === canvasId)
  }
  listAll() { return [...this.store.values()] }
}

describe('CardService quota failure (write helper)', () => {
  let service: CardService
  beforeEach(() => {
    const repo = new QuotaCardRepository()
    service = new CardService(repo)
    // 带 canvasPosition:create 不抛(insert),且 removeFromCanvas 才会走到 update。
    service.create({
      title: 'x',
      source: { kind: 'manual', deviceId: 'd' },
      canvasPosition: { canvasId: 'default-canvas' as CanvasId, x: 0, y: 0, w: 240, h: 120, z: 0 },
    })
  })

  it('update returns null on quota failure (not phantom next)', () => {
    const c = service.listAll()[0]!
    expect(service.update(c.id, { title: 'edited' })).toBeNull()
  })

  it('addTag returns null on quota failure (not phantom next)', () => {
    const c = service.listAll()[0]!
    expect(service.addTag(c.id, 't')).toBeNull()
  })

  it('removeFromCanvas returns false on quota failure', () => {
    const c = service.listAll()[0]!
    expect(service.removeFromCanvas(c.id)).toBe(false)
  })

  it('restore returns false on quota failure', () => {
    const c = service.listAll()[0]!
    expect(service.restore(c.id)).toBe(false)
  })

  it('hardDelete returns false on quota failure', () => {
    const c = service.listAll()[0]!
    expect(service.hardDelete(c.id)).toBe(false)
  })

  it('archive is a silent no-op on quota failure (does not throw)', () => {
    const c = service.listAll()[0]!
    expect(() => service.archive(c.id)).not.toThrow()
  })

  it('moveToCanvas returns false on quota failure and keeps the card in place', () => {
    const c = service.listAll()[0]!
    expect(service.moveToCanvas(c.id, { canvasId: 'other' as CanvasId, x: 1, y: 2, w: 240, h: 120, z: 0 })).toBe(false)
    expect(service.get(c.id)?.canvasPosition?.canvasId).toBe('default-canvas')
  })

  it('write re-throws non-quota errors (does not swallow programming errors)', () => {
    const badRepo = new QuotaCardRepository()
    ;(badRepo as { update: (c: Card) => void }).update = () => {
      throw new TypeError('bad')
    }
    const svc = new CardService(badRepo)
    svc.create({ title: 'x', source: { kind: 'manual', deviceId: 'd' } })
    const c = svc.listAll()[0]!
    expect(() => svc.update(c.id, { title: 'y' })).toThrow(TypeError)
  })
})
