import { describe, expect, it } from 'vitest'
import { hitTest, screenToPage } from '../self-built-hittest'
import type { CanvasElement, CanvasView } from '../canvas-host'

const els: CanvasElement[] = [
  { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0 },
  { id: 'b', kind: 'card', x: 200, y: 0, w: 100, h: 50, rotation: 0 },
]

describe('screenToPage', () => {
  it('subtracts pan and divides by zoom', () => {
    const v: CanvasView = { panX: 10, panY: 20, zoom: 2, gridMode: 'free' }
    expect(screenToPage(v, 110, 120)).toEqual({ x: 50, y: 50 })
  })
})

describe('hitTest', () => {
  it('hits the element containing the page point', () => {
    expect(hitTest(els, 50, 25)).toBe('a')
    expect(hitTest(els, 250, 25)).toBe('b')
    expect(hitTest(els, 150, 25)).toBeNull()
  })
  it('prefers the later-drawn (top) element on overlap', () => {
    const overlap: CanvasElement[] = [
      { id: 'bottom', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'top', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    ]
    expect(hitTest(overlap, 50, 50)).toBe('top') // 数组末尾 = 最上层
  })
})
