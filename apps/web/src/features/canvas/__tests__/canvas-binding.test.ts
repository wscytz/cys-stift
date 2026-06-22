import { describe, it, expect } from 'vitest'
import {
  cardShapeIdOf,
  cardIdFromShapeId,
  cardToElement,
  elementToCardPosition,
} from '../canvas-binding'
import type { CanvasId, CardId } from '@cys-stift/domain'

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
