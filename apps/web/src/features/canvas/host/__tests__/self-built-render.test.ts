import { describe, expect, it } from 'vitest'
import { renderElements, drawSelectionOutlines, drawMarquee } from '../self-built-render'
import type { CanvasElement, CanvasView } from '../canvas-host'

/** mock CanvasRenderingContext2D:记录所有方法调用。 */
function mockCtx() {
  const calls: string[] = []
  const ctx = {
    _calls: calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    scale: (x: number, y: number) => calls.push(`scale(${x})`),
    beginPath: () => calls.push('beginPath'),
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect(${x},${y},${w},${h})`),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    setLineDash: (arr: number[]) => calls.push(`setLineDash(${arr.join(',')})`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect(${x},${y},${w},${h})`),
    roundRect: (x: number, y: number, w: number, h: number, r?: number) => calls.push(`roundRect(${x},${y},${w},${h})`),
    fill: () => calls.push('fill'),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect(${x},${y},${w},${h})`),
    stroke: () => calls.push('stroke'),
    fillText: (t: string, x: number, y: number) => calls.push(`fillText(${t}@${x},${y})`),
    set fillStyle(v: unknown) { calls.push(`fillStyle=${v}`) },
    set strokeStyle(v: unknown) { calls.push(`strokeStyle=${v}`) },
    set font(v: string) { calls.push(`font=${v}`) },
    set lineWidth(v: unknown) { calls.push(`lineWidth=${v}`) },
    clearRect: (x: number, y: number, w: number, h: number) => calls.push(`clearRect(${x},${y},${w},${h})`),
  }
  return ctx as unknown as CanvasRenderingContext2D & { _calls: string[] }
}

describe('renderElements', () => {
  const view: CanvasView = { panX: 10, panY: 20, zoom: 2, gridMode: 'free' }

  it('applies the camera transform (translate + scale) around the draw', () => {
    const ctx = mockCtx()
    renderElements(ctx, [], view, 800, 600, () => '', '#0f172a')
    expect(ctx._calls).toContain('clearRect(0,0,800,600)')
    expect(ctx._calls).toContain('save')
    expect(ctx._calls).toContain('translate(10,20)')
    expect(ctx._calls).toContain('scale(2)')
    expect(ctx._calls).toContain('restore')
  })

  it('draws a card (rounded rect + label) and a rect', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 100, y: 50, w: 240, h: 120, rotation: 0 },
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 50, h: 30, rotation: 0, color: 'blue' },
    ]
    renderElements(ctx, els, view, 800, 600, (id) => (id === 'c1' ? 'Title' : ''), '#0f172a')
    expect(ctx._calls.some((c) => c.startsWith('roundRect(100,50,240,120)'))).toBe(true)
    expect(ctx._calls).toContain('fillText(Title@110,70)')
    expect(ctx._calls.some((c) => c.startsWith('rect(0,0,50,30)'))).toBe(true)
  })

  it('skips unknown kinds without throwing', () => {
    const ctx = mockCtx()
    const els = [{ id: 'x', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0 }] as CanvasElement[]
    expect(() => renderElements(ctx, els, view, 800, 600, () => '', '#0f172a')).not.toThrow()
  })

  it('draws a freedraw stroke as a polyline', () => {
    const ctx = mockCtx()
    const els = [
      {
        id: 'f1', kind: 'freedraw', x: 10, y: 10, w: 30, h: 40, rotation: 0,
        meta: { points: [[10, 10], [40, 50], [10, 50]] },
      },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')
    expect(ctx._calls).toContain('moveTo(10,10)')
    expect(ctx._calls).toContain('lineTo(40,50)')
    expect(ctx._calls).toContain('lineTo(10,50)')
  })

  it('freedraw with no points draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [{ id: 'f2', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: {} }] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')).not.toThrow()
    expect(ctx._calls.some((c) => c.startsWith('moveTo'))).toBe(false)
  })

  it('renders an arrow as a line + arrowhead between two cards (border endpoints)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', text: 'rel' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')
    // from=(100,50) → to=(200,50):主线
    expect(ctx._calls).toContain('moveTo(100,50)')
    expect(ctx._calls).toContain('lineTo(200,50)')
    // label 画在中点 (150,50)
    expect(ctx._calls.some((c) => c.startsWith('fillText(rel@150,50)'))).toBe(true)
  })

  it('arrow with missing endpoint draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'ghost' },
    ] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')).not.toThrow()
    // 不画 arrow 主线(没有 (100,50) 那种)— 只检查没有 moveTo(100,50)
    expect(ctx._calls.some((c) => c === 'moveTo(100,50)')).toBe(false)
  })

  it('renders text (multi-line, top baseline)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 't1', kind: 'text', x: 10, y: 20, w: 100, h: 36, rotation: 0, text: 'hello\nworld' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')
    // 行 1 @ y=20,行 2 @ y=20+18=38
    expect(ctx._calls).toContain('fillText(hello@10,20)')
    expect(ctx._calls).toContain('fillText(world@10,38)')
  })

  it('text with empty string draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [{ id: 't2', kind: 'text', x: 0, y: 0, w: 1, h: 1, rotation: 0, text: '' }] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')).not.toThrow()
    expect(ctx._calls.some((c) => c.startsWith('fillText'))).toBe(false)
  })
})

describe('drawSelectionOutlines', () => {
  it('draws a dashed rect only around selected elements', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 },
      { id: 'c2', kind: 'card', x: 200, y: 0, w: 100, h: 60, rotation: 0 },
    ] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['c1'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // 只画 c1 的框(c1 外扩 2px:strokeRect(8,18,104,64));c2 不画
    expect(ctx._calls).toContain('strokeRect(8,18,104,64)')
    expect(ctx._calls.some((c) => c.startsWith('strokeRect(198'))).toBe(false)
    expect(ctx._calls.some((c) => c.startsWith('setLineDash'))).toBe(true)
  })

  it('draws handle squares at the 4 corners of selected elements', () => {
    const ctx = mockCtx()
    const els = [{ id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 }] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['c1'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // handle hs=3(zoom1):nw(10,20)→ fillRect(7,17,6,6);se(110,80)→ fillRect(107,77,6,6)
    expect(ctx._calls).toContain('fillRect(7,17,6,6)')
    expect(ctx._calls).toContain('fillRect(107,77,6,6)')
    // ne(110,20)→ strokeRect(107,17,6,6);sw(10,80)→ strokeRect(7,77,6,6)
    expect(ctx._calls).toContain('strokeRect(107,17,6,6)')
    expect(ctx._calls).toContain('strokeRect(7,77,6,6)')
  })

  it('with empty selection draws nothing', () => {
    const ctx = mockCtx()
    drawSelectionOutlines(ctx, [], [], { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    expect(ctx._calls.some((c) => c.startsWith('strokeRect'))).toBe(false)
  })
})

describe('drawMarquee', () => {
  it('draws a dashed semi-transparent rect', () => {
    const ctx = mockCtx()
    drawMarquee(ctx, { x: 10, y: 20, w: 100, h: 60 }, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    expect(ctx._calls.some((c) => c.startsWith('fillRect(10,20,100,60)'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('strokeRect(10,20,100,60)'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('setLineDash'))).toBe(true)
  })
})
