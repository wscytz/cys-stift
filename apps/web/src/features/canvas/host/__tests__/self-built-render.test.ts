import { describe, expect, it } from 'vitest'
import { renderElements } from '../self-built-render'
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
    roundRect: (x: number, y: number, w: number, h: number, r?: number) => calls.push(`roundRect(${x},${y},${w},${h})`),
    fill: () => calls.push('fill'),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect(${x},${y},${w},${h})`),
    stroke: () => calls.push('stroke'),
    fillText: (t: string, x: number, y: number) => calls.push(`fillText(${t}@${x},${y})`),
    set fillStyle(v: unknown) { calls.push(`fillStyle=${v}`) },
    set strokeStyle(v: unknown) { calls.push(`strokeStyle=${v}`) },
    set font(v: string) { calls.push(`font=${v}`) },
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
})
