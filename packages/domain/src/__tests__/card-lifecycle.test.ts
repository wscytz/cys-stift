import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CardService, type CardRepository } from '../services/card-service'
import type { Card, CardId } from '../types'
import { toCardId, toCanvasId } from '../codec'
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
      .filter((card) => !card.canvasPosition && !card.archived && !card.deletedAt)
      .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())
  }
  listOnCanvas(canvasId: ReturnType<typeof toCanvasId>) {
    return [...this.store.values()]
      .filter((card) => card.canvasPosition?.canvasId === canvasId)
      .sort((left, right) => (left.canvasPosition?.z ?? 0) - (right.canvasPosition?.z ?? 0))
  }
  listAll() {
    return [...this.store.values()]
  }
}

const source = { kind: 'manual' as const, deviceId: 'test-device' }
const position = { canvasId: toCanvasId('canvas'), x: 100, y: 200, w: 240, h: 120, z: 5, rotation: 15 }
const lifecycleMethods = ['archive', 'unarchive', 'softDelete', 'restore'] as const

describe('CardService lifecycle', () => {
  let repo: InMemoryCardRepository
  let service: CardService

  beforeEach(() => {
    repo = new InMemoryCardRepository()
    service = new CardService(repo)
  })

  it.each([
    { location: 'inbox', canvasPosition: undefined },
    { location: 'canvas', canvasPosition: position },
  ])('archive and unarchive preserve the $location card and its placement', ({ canvasPosition }) => {
    const card = service.create({ title: 'original', source, canvasPosition })
    const before = structuredClone(card)
    Object.freeze(card)

    service.archive(card.id)
    expect(service.get(card.id)).toEqual({ ...before, archived: true, updatedAt: expect.any(Date) })
    expect(service.listInbox()).toHaveLength(0)

    service.unarchive(card.id)
    expect(service.get(card.id)).toEqual({ ...before, updatedAt: expect.any(Date) })
    expect(service.listInbox()).toHaveLength(canvasPosition ? 0 : 1)
    expect(card).toEqual(before)
  })

  it.each([
    { location: 'inbox', archived: false, canvasPosition: undefined },
    { location: 'archive', archived: true, canvasPosition: undefined },
    { location: 'canvas', archived: false, canvasPosition: position },
    { location: 'archived canvas', archived: true, canvasPosition: position },
  ])('delete and restore preserve the $location state and content', ({ archived, canvasPosition }) => {
    const card = service.create({ title: 'original', body: 'keep me', source, archived, canvasPosition })
    const before = structuredClone(card)
    Object.freeze(card)

    service.softDelete(card.id)
    expect(service.get(card.id)).toEqual({
      ...before,
      deletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    expect(service.listInbox()).toHaveLength(0)

    expect(service.restore(card.id)).toBe(true)
    expect(service.get(card.id)).toEqual({ ...before, deletedAt: undefined, updatedAt: expect.any(Date) })
    expect(service.listInbox()).toHaveLength(!archived && !canvasPosition ? 1 : 0)
    expect(card).toEqual(before)
  })

  it.each(lifecycleMethods)('%s leaves the stored card unchanged on quota failure and can retry', (method) => {
    const card = service.create({ title: 'original', source, archived: method === 'unarchive', canvasPosition: position })
    if (method === 'restore') service.softDelete(card.id)
    const stored = service.get(card.id)!
    const before = structuredClone(stored)
    Object.freeze(stored)
    const update = vi.spyOn(repo, 'update').mockImplementationOnce(() => {
      throw new StorageQuotaError('full')
    })

    const result = service[method](card.id)
    expect(result).toBe(method === 'restore' ? false : undefined)
    expect(update).toHaveBeenCalledTimes(1)
    expect(service.get(card.id)).toEqual(before)

    const retry = service[method](card.id)
    expect(retry).toBe(method === 'restore' ? true : undefined)
    expect(update).toHaveBeenCalledTimes(2)
    const expected = method === 'archive' ? { archived: true }
      : method === 'unarchive' ? { archived: false }
        : method === 'softDelete' ? { deletedAt: expect.any(Date) }
          : { deletedAt: undefined }
    expect(service.get(card.id)).toEqual({ ...before, ...expected, updatedAt: expect.any(Date) })
  })

  it.each(lifecycleMethods)('%s propagates non-quota repository errors without changing state', (method) => {
    const card = service.create({ title: 'original', source, archived: method === 'unarchive', canvasPosition: position })
    if (method === 'restore') service.softDelete(card.id)
    const before = structuredClone(service.get(card.id))
    const error = new TypeError('repository failed')
    vi.spyOn(repo, 'update').mockImplementationOnce(() => { throw error })

    expect(() => service[method](card.id)).toThrow(error)
    expect(service.get(card.id)).toEqual(before)
  })

  it('lifecycle operations on an unknown id do not write or create a card', () => {
    const missingId = toCardId('missing')
    const update = vi.spyOn(repo, 'update')

    expect(service.archive(missingId)).toBeUndefined()
    expect(service.unarchive(missingId)).toBeUndefined()
    expect(service.softDelete(missingId)).toBeUndefined()
    expect(service.restore(missingId)).toBe(false)
    expect(update).not.toHaveBeenCalled()
    expect(service.get(missingId)).toBeNull()
    expect(service.listAll()).toEqual([])
  })

  it.each(['create', 'createWithId'] as const)('%s propagates insert quota errors without leaving a phantom card', (method) => {
    const error = new StorageQuotaError('full')
    vi.spyOn(repo, 'insert').mockImplementationOnce(() => { throw error })
    const input = { title: 'draft', source }
    const create = () => method === 'create'
      ? service.create(input)
      : service.createWithId(toCardId('imported'), input)

    expect(create).toThrow(error)
    expect(service.listAll()).toEqual([])
    expect(service.get(toCardId('imported'))).toBeNull()
  })
})
