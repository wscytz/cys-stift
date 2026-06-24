import { describe, it, expect } from 'vitest'
import { diffCanvasSnapshots } from '../canvas-diff'
import type { CanvasElement } from '@cys-stift/canvas-engine'

function card(id: string, x = 0, y = 0, color = 'black'): CanvasElement {
  return { id, kind: 'card', x, y, w: 100, h: 80, rotation: 0, color } as unknown as CanvasElement
}
function rect(id: string, x = 0, y = 0): CanvasElement {
  return { id, kind: 'rect', x, y, w: 100, h: 80, rotation: 0, color: 'red' } as unknown as CanvasElement
}

describe('diffCanvasSnapshots', () => {
  it('detects added elements', () => {
    const before = [card('c1')]
    const after = [card('c1'), rect('r1')]
    const diff = diffCanvasSnapshots(before, after)
    expect(diff.added.map((e) => e.id)).toEqual(['r1'])
    expect(diff.removed).toEqual([])
    expect(diff.changed).toEqual([])
  })

  it('detects removed elements', () => {
    const before = [card('c1'), rect('r1')]
    const after = [card('c1')]
    const diff = diffCanvasSnapshots(before, after)
    expect(diff.removed.map((e) => e.id)).toEqual(['r1'])
  })

  it('detects changed elements (geometry or color)', () => {
    const before = [card('c1', 0, 0, 'black')]
    const after = [card('c1', 50, 50, 'red')]
    const diff = diffCanvasSnapshots(before, after)
    expect(diff.changed.map((c) => c.id)).toEqual(['c1'])
    expect(diff.changed[0]!.fields).toContain('x')
    expect(diff.changed[0]!.fields).toContain('color')
  })

  it('reports no changes for identical snapshots', () => {
    const snap = [card('c1')]
    const diff = diffCanvasSnapshots(snap, snap)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.changed).toEqual([])
  })
})
