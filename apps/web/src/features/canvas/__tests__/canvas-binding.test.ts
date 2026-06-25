import { describe, it, expect } from 'vitest'
import {
  cardShapeIdOf,
  cardIdFromShapeId,
  cardToElement,
  elementToCardPosition,
  bindCardWriteback,
} from '../canvas-binding'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasId, Card, CardId, CardService, CanvasPosition } from '@cys-stift/domain'

const CARD = {
  id: 'abc-123' as unknown as CardId,
  title: 'test',
  body: '',
  type: 'note' as const,
  media: [],
  links: [],
  codeSnippets: [],
  quotes: [],
  tags: [],
  canvasPosition: {
    canvasId: 'canvas-1' as unknown as CanvasId,
    x: 100,
    y: 200,
    w: 320,
    h: 160,
    z: 3,
    rotation: 0.5,
  },
  source: { kind: 'manual', deviceId: 'dev' } as never,
  capturedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  pinned: false,
  archived: false,
}

describe('cardShapeIdOf / cardIdFromShapeId roundtrip', () => {
  const input = 'test-id' as unknown as CardId
  it('encodes a card id with shape: prefix', () => {
    expect(cardShapeIdOf(input)).toBe('shape:test-id')
  })
  it('decodes back to the original card id', () => {
    expect(cardIdFromShapeId(cardShapeIdOf(input))).toBe('test-id')
  })
  it('strips shape: prefix from any string', () => {
    expect(cardIdFromShapeId('shape:hello')).toBe('hello')
    expect(cardIdFromShapeId('not-prefixed')).toBe('not-prefixed')
  })
})

describe('cardToElement', () => {
  it('maps card.canvasPosition onto a host element (geometry only)', () => {
    const el = cardToElement(CARD)
    expect(el.kind).toBe('card')
    expect(el.id).toBe('abc-123')
    expect(el.x).toBe(100)
    expect(el.y).toBe(200)
    expect(el.rotation).toBe(0.5)
    expect(el.w).toBe(320)
    expect(el.h).toBe(160)
  })
  it('falls back to DEFAULT_W/H when canvasPosition is missing', () => {
    const c = { ...CARD, canvasPosition: undefined }
    const el = cardToElement(c)
    expect(el.w).toBe(240)
    expect(el.h).toBe(120)
    expect(el.rotation).toBe(0)
  })
  it('falls back to 0 coords when position is missing', () => {
    const c = { ...CARD, canvasPosition: undefined }
    const el = cardToElement(c)
    expect(el.x).toBe(0)
    expect(el.y).toBe(0)
  })
})

describe('elementToCardPosition', () => {
  it('preserves existing z and maps canvasId', () => {
    const el = {
      id: 'abc',
      kind: 'card' as const,
      x: 50,
      y: 60,
      w: 200,
      h: 100,
      rotation: 0,
    }
    const pos = elementToCardPosition(el, 'target-canvas' as unknown as CanvasId, 7)
    expect(pos).toEqual({
      canvasId: 'target-canvas',
      x: 50,
      y: 60,
      w: 200,
      h: 100,
      z: 7,
      rotation: 0,
    })
  })
})

/**
 * Bug B regression: canvas Delete/橡皮 擦掉卡元素必须走 removeFromCanvas(送回
 * inbox),不能 softDelete。否则引擎 undo 只恢复 host 元素,DB 的 deletedAt 不
 * 回滚 → 切画布/reload 卡永久丢失(静默数据丢失)。
 *
 * 这里用 InMemoryCanvasHost + fake CardService 验证:user-source remove 触发
 * bindCardWriteback 的 onUserChange → 调用 removeFromCanvas,且永不被 softDelete。
 */
function makeCardOnCanvas(id: string, canvasId: string): Card {
  return {
    id: id as unknown as CardId,
    title: id,
    body: '',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    tags: [],
    canvasPosition: {
      canvasId: canvasId as unknown as CanvasId,
      x: 10,
      y: 20,
      w: 240,
      h: 120,
      z: 1,
      rotation: 0,
    },
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    archived: false,
  }
}

function makeFakeService(cards: Map<string, Card>): {
  service: CardService
  softDeleteCalls: string[]
  removeFromCanvasCalls: string[]
} {
  const softDeleteCalls: string[] = []
  const removeFromCanvasCalls: string[] = []
  const service = {
    get: (id: CardId) => cards.get(String(id)) ?? null,
    listOnCanvas: (_canvasId: CanvasId) => [...cards.values()],
    moveToCanvas: (id: CardId, pos: CanvasPosition) => {
      const c = cards.get(String(id))
      if (c) cards.set(String(id), { ...c, canvasPosition: pos })
    },
    softDelete: (id: CardId) => {
      softDeleteCalls.push(String(id))
      const c = cards.get(String(id))
      if (c) cards.set(String(id), { ...c, deletedAt: new Date() })
    },
    removeFromCanvas: (id: CardId) => {
      removeFromCanvasCalls.push(String(id))
      const c = cards.get(String(id))
      if (c) cards.set(String(id), { ...c, canvasPosition: undefined })
      return true
    },
  } as unknown as CardService
  return { service, softDeleteCalls, removeFromCanvasCalls }
}

describe('bindCardWriteback: user-source remove → removeFromCanvas (not softDelete)', () => {
  it('removing a card element sends the card to inbox (removeFromCanvas)', () => {
    const canvasId = 'canvas-1' as unknown as CanvasId
    const cards = new Map([['card-a', makeCardOnCanvas('card-a', 'canvas-1')]])
    const { service, softDeleteCalls, removeFromCanvasCalls } = makeFakeService(cards)
    const host = new InMemoryCanvasHost()

    // load 卡(applyWithoutEcho:不触发 user-source)
    host.applyWithoutEcho(() => host.upsert(cardToElement(cards.get('card-a')!)))
    const unbind = bindCardWriteback(host, service, canvasId)

    // user-source remove(模拟 Delete 键 / 橡皮擦掉卡)
    host.remove('card-a')

    expect(removeFromCanvasCalls).toEqual(['card-a'])
    expect(softDeleteCalls).toEqual([])
    // 卡仍存在,只是 canvasPosition 被清(回 inbox)
    expect(cards.get('card-a')!.canvasPosition).toBeUndefined()
    expect(cards.get('card-a')!.deletedAt).toBeUndefined()

    unbind()
  })

  it('a programmatic (no-echo) remove does NOT trigger writeback', () => {
    const canvasId = 'canvas-1' as unknown as CanvasId
    const cards = new Map([['card-b', makeCardOnCanvas('card-b', 'canvas-1')]])
    const { service, softDeleteCalls, removeFromCanvasCalls } = makeFakeService(cards)
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => host.upsert(cardToElement(cards.get('card-b')!)))
    const unbind = bindCardWriteback(host, service, canvasId)

    // syncCardsToEditor 风格的 programmatic remove(applyWithoutEcho 包裹)
    host.applyWithoutEcho(() => host.remove('card-b'))

    expect(removeFromCanvasCalls).toEqual([])
    expect(softDeleteCalls).toEqual([])

    unbind()
  })
})
