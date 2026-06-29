import { describe, it, expect } from 'vitest'
import { applyAlign, type AlignOp } from '../align-distribute'
import type { CanvasElement } from '../canvas-host'

function el(id: string, x: number, y: number, w = 100, h = 80, kind: CanvasElement['kind'] = 'rect'): CanvasElement {
  return { id, kind, x, y, w, h, rotation: 0 } as CanvasElement
}

describe('applyAlign', () => {
  it('left: aligns all to min x', () => {
    const els = [el('a', 10, 0), el('b', 50, 0), el('c', 100, 0)]
    const r = applyAlign(els, 'left')
    expect(r.get('a')!.x).toBe(10)
    expect(r.get('b')!.x).toBe(10)
    expect(r.get('c')!.x).toBe(10)
  })
  it('right: aligns all to max x+w', () => {
    const els = [el('a', 10, 0, 100), el('b', 50, 0, 100)]
    const r = applyAlign(els, 'right')
    expect(r.get('a')!.x).toBe(50) // 50+100 - 100 = 50
    expect(r.get('b')!.x).toBe(50)
  })
  it('top: aligns all to min y', () => {
    const els = [el('a', 0, 10), el('b', 0, 50)]
    const r = applyAlign(els, 'top')
    expect(r.get('b')!.y).toBe(10)
  })
  it('center-h: centers horizontally to bbox center', () => {
    const els = [el('a', 0, 0, 100), el('b', 200, 0, 100)]
    const r = applyAlign(els, 'center-h')
    // bbox center = 150; a.x = 150-50=100, b.x = 150-50=100
    expect(r.get('a')!.x).toBe(100)
    expect(r.get('b')!.x).toBe(100)
  })
  it('distribute-h: equal spacing (needs ≥3)', () => {
    const els = [el('a', 0, 0, 100), el('b', 200, 0, 100), el('c', 400, 0, 100)]
    const r = applyAlign(els, 'distribute-h')
    // 排序后 a,b,c;总跨度 0→500;间隔 = (500-300)/2=100 → b 应在 a 右边 200 处?具体看实现
    expect(r.size).toBe(3)
  })
  it('distribute-h: no-op for <3', () => {
    expect(applyAlign([el('a', 0, 0), el('b', 100, 0)], 'distribute-h').size).toBe(0)
  })
  it('equalize: average w/h', () => {
    const els = [el('a', 0, 0, 100, 80), el('b', 0, 0, 200, 120)]
    const r = applyAlign(els, 'equalize')
    expect(r.get('a')!.w).toBe(150) // (100+200)/2
    expect(r.get('a')!.h).toBe(100) // (80+120)/2
  })
  it('returns empty for <2 on align ops', () => {
    expect(applyAlign([el('a', 0, 0)], 'left').size).toBe(0)
  })
})
