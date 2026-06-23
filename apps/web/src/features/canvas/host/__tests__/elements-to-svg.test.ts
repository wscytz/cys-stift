import { describe, expect, it } from 'vitest'
import { elementsToSvg } from '../elements-to-svg'
import type { CanvasElement } from '../canvas-host'

describe('elementsToSvg', () => {
  const view = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' as const }
  const info = (id: string) =>
    id === 'c1' ? { title: 'T', body: 'B', type: 'note', pinned: false } : null

  it('空元素 → 空 SVG(只有背景 + svg 根)', () => {
    const r = elementsToSvg([], view, info as never, { background: true, border: 0 })
    expect(r.svg).toContain('<svg')
    expect(r.width).toBeGreaterThan(0)
  })

  it('card → SVG 含 <rect> + <text>(title)', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 },
    ]
    const r = elementsToSvg(els, view, info as never, { background: true, border: 0 })
    expect(r.svg).toContain('<rect')
    expect(r.svg).toContain('T') // title 文本
    expect(r.svg).toContain('NOTE') // 类型标
  })

  it('rect → SVG <rect>', () => {
    const els: CanvasElement[] = [
      { id: 'r1', kind: 'rect', x: 10, y: 10, w: 50, h: 30, rotation: 0, color: 'black' },
    ]
    const r = elementsToSvg(els, view, () => null, { background: false, border: 0 })
    expect(r.svg).toContain('<rect')
  })

  it('arrow → SVG <line>(from→to 端点)', () => {
    const els: CanvasElement[] = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' },
    ]
    const r = elementsToSvg(els, view, () => null, { background: false, border: 0 })
    expect(r.svg).toContain('<line')
  })

  it('border 加 padding(width/height 含 2×border)', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0 },
    ]
    const r = elementsToSvg(els, view, info as never, { background: true, border: 16 })
    expect(r.width).toBe(132) // 100 + 16*2
    expect(r.height).toBe(82) // 50 + 16*2
  })
})
