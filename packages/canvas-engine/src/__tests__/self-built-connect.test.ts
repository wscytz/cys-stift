import { describe, expect, it } from 'vitest'
import { arrowPreviewEndpoints } from '../self-built-arrow'
import type { CanvasElement } from '../canvas-host'

describe('arrowPreviewEndpoints', () => {
  const fromEl = { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 } as CanvasElement
  it('from = fromEl 朝 pointer 的边框交点;to = pointer', () => {
    // fromEl 中心 (50,50),朝 pointer (200,50):dx=150 → tX=50/150=0.333 → from=(100,50)
    const { from, to } = arrowPreviewEndpoints(fromEl, { x: 200, y: 50 })
    expect(from).toEqual({ x: 100, y: 50 })
    expect(to).toEqual({ x: 200, y: 50 })
  })
  it('pointer 在 fromEl 内部 → from = 中心(退化)', () => {
    const { from } = arrowPreviewEndpoints(fromEl, { x: 50, y: 50 })
    expect(from).toEqual({ x: 50, y: 50 })
  })
})
