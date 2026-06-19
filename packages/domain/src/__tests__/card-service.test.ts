import { describe, it, expect, beforeEach } from 'vitest'
import { CardService, type CardRepository } from '../services/card-service'
import type { Card, CardId, CanvasId, WorkspaceId } from '../types'

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
})
