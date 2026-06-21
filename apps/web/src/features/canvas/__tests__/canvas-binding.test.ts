import { describe, it, expect } from 'vitest'
import {
  cardShapeIdOf,
  cardIdFromShapeId,
  cardToShape,
  shapeToCardPosition,
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
    expect(String(cardShapeIdOf(input))).toBe('shape:test-id')
  })
  it('decodes back to the original card id', () => {
    expect(cardIdFromShapeId(String(cardShapeIdOf(input)))).toBe('test-id')
  })
  it('strips shape: prefix from any string', () => {
    expect(cardIdFromShapeId('shape:hello')).toBe('hello')
    expect(cardIdFromShapeId('not-prefixed')).toBe('not-prefixed')
  })
})

describe('cardToShape', () => {
  it('maps card.canvasPosition onto a shape partial', () => {
    const s = cardToShape(CARD)
    expect(s.type).toBe('card')
    expect(s.x).toBe(100)
    expect(s.y).toBe(200)
    expect(s.rotation).toBe(0.5)
    expect(s.props).toMatchObject({ w: 320, h: 160 })
  })
  it('falls back to DEFAULT_W/H when canvasPosition is missing', () => {
    const c = { ...CARD, canvasPosition: undefined }
    const s = cardToShape(c)
    expect(s.props).toMatchObject({ w: 240, h: 120 })
    expect(s.rotation).toBe(0)
  })
  it('falls back to 0 coords when position is missing', () => {
    const c = { ...CARD, canvasPosition: undefined }
    const s = cardToShape(c)
    expect(s.x).toBe(0)
    expect(s.y).toBe(0)
  })
})

describe('shapeToCardPosition', () => {
  it('preserves existing z and maps canvasId', () => {
    const shape = {
      id: 'shape:abc' as never,
      type: 'card' as const,
      x: 50,
      y: 60,
      rotation: 0,
      props: { w: 200, h: 100 },
    }
    const pos = shapeToCardPosition(
      shape as never,
      'target-canvas' as unknown as CanvasId,
      7,
    )
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
