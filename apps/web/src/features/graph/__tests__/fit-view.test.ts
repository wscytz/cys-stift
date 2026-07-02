import { describe, it, expect } from 'vitest'
import { computeFitView } from '../fit-view'

describe('computeFitView', () => {
  it('returns null for empty nodes', () => {
    expect(computeFitView([], 800, 600)).toBeNull()
  })

  it('fits a single node at zoom 1, centered (degenerate bbox absorbed via min(fit,1))', () => {
    const fit = computeFitView([{ x: 100, y: 200 }], 800, 600)
    expect(fit).not.toBeNull()
    expect(fit!.zoom).toBe(1)
    // 节点中心 → 画布中心:x*zoom + panX = canvasW/2
    expect(100 * fit!.zoom + fit!.panX).toBeCloseTo(400)
    expect(200 * fit!.zoom + fit!.panY).toBeCloseTo(300)
  })

  it('keeps a small graph at zoom 1 with padding whitespace', () => {
    const fit = computeFitView([{ x: 0, y: 0 }, { x: 100, y: 100 }], 800, 600)
    expect(fit).not.toBeNull()
    expect(fit!.zoom).toBe(1)
    // bbox 中心 (50,50) → 画布中心
    expect(50 * fit!.zoom + fit!.panX).toBeCloseTo(400)
    expect(50 * fit!.zoom + fit!.panY).toBeCloseTo(300)
  })

  it('zooms out (<1, not clamped) when the graph is larger than the canvas', () => {
    const fit = computeFitView([{ x: 0, y: 0 }, { x: 2000, y: 2000 }], 800, 600)
    expect(fit).not.toBeNull()
    expect(fit!.zoom).toBeLessThan(1)
    expect(fit!.zoom).toBeGreaterThan(0.2)
    // bbox 中心 (1000,1000) → 画布中心
    expect(1000 * fit!.zoom + fit!.panX).toBeCloseTo(400)
    expect(1000 * fit!.zoom + fit!.panY).toBeCloseTo(300)
  })

  it('clamps zoom to MIN_ZOOM (0.2) for an enormous graph', () => {
    const fit = computeFitView([{ x: 0, y: 0 }, { x: 100000, y: 100000 }], 800, 600)
    expect(fit).not.toBeNull()
    expect(fit!.zoom).toBe(0.2)
  })

  it('centers the bbox on the canvas (general invariant)', () => {
    const nodes = [{ x: 137, y: 42 }, { x: 900, y: -50 }, { x: 500, y: 600 }]
    const fit = computeFitView(nodes, 800, 600)!
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    expect(cx * fit.zoom + fit.panX).toBeCloseTo(400)
    expect(cy * fit.zoom + fit.panY).toBeCloseTo(300)
  })

  it('honors padding + nodeRadius overrides (degenerate bbox → zoom 1)', () => {
    // r=0, pad=0:单节点 bbox 退化(bboxW=0 → fit=∞ → min(∞,1)=1),仍 zoom 1 居中。
    const fit = computeFitView([{ x: 5, y: 5 }], 800, 600, 0, 0)!
    expect(fit.zoom).toBe(1)
    expect(5 * fit.zoom + fit.panX).toBeCloseTo(400)
  })
})
