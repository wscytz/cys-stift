import { describe, it, expect, beforeEach } from 'vitest'
import { CardService, type CardRepository } from '../services/card-service'
import type { Card, CardId, CanvasId, MediaAssetId, MediaRef, WorkspaceId } from '../types'

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
    expect(fetched?.media[0].assetId).toBe('a1')
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
})
