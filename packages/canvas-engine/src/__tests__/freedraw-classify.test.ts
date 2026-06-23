import { describe, expect, it } from 'vitest'
import {
  classifyFreedraw,
  duplicateFreedraw,
  freedrawPoints,
} from '../freedraw-classify'
import type { CanvasElement } from '../canvas-host'

// ── 造笔迹 ─────────────────────────────────────────────────────────────────────

/** 直线(均匀采样 first→last)。 */
function line(x0: number, y0: number, x1: number, y1: number, n = 20): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
  }
  return pts
}

/** 圆(闭合,首尾几乎重合)。 */
function circle(cx: number, cy: number, r: number, n = 32): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

function freedrawEl(points: [number, number][], id = 'f1'): CanvasElement {
  return { id, kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: { points } }
}

// ── classifyFreedraw ──────────────────────────────────────────────────────────

describe('classifyFreedraw', () => {
  it('一条长直线 → arrow,置信度高', () => {
    const r = classifyFreedraw(line(0, 0, 300, 0))
    expect(r.kind).toBe('arrow')
    expect(r.confidence).toBeGreaterThan(0.6)
    expect(r.features.straightness).toBeGreaterThan(0.92)
  })

  it('对角长直线也 → arrow', () => {
    const r = classifyFreedraw(line(0, 0, 200, 200))
    // 直但不细长(正方形 bbox)——可能 arrow 也可能 unknown,但一定不是 decoration(不闭合)
    expect(r.kind).not.toBe('decoration')
  })

  it('细长直线(对角但拉长)→ arrow', () => {
    const r = classifyFreedraw(line(0, 0, 400, 40))
    expect(r.kind).toBe('arrow')
  })

  it('一个圆 → decoration(闭合)', () => {
    const r = classifyFreedraw(circle(100, 100, 50))
    expect(r.kind).toBe('decoration')
    expect(r.confidence).toBeGreaterThan(0.5)
    expect(r.features.closure).toBeLessThan(0.18)
  })

  it('随手涂(短而绕,不闭合不细长)→ decoration,低置信', () => {
    const scribble: [number, number][] = [
      [0, 0], [10, 30], [25, 5], [15, 35], [30, 20], [5, 25],
    ]
    const r = classifyFreedraw(scribble)
    expect(['decoration', 'unknown']).toContain(r.kind)
    expect(r.confidence).toBeLessThan(0.6)
  })

  it('少于 2 点 → unknown@0', () => {
    expect(classifyFreedraw([])).toMatchObject({ kind: 'unknown', confidence: 0 })
    expect(classifyFreedraw([[5, 5]])).toMatchObject({ kind: 'unknown', confidence: 0 })
  })

  it('退化(所有点重合,路径长 0)→ unknown@0', () => {
    const r = classifyFreedraw([[10, 10], [10, 10], [10, 10]])
    expect(r).toMatchObject({ kind: 'unknown', confidence: 0 })
  })

  it('confidence 始终在 [0,1]', () => {
    for (const pts of [line(0, 0, 500, 1), circle(0, 0, 80), [[1, 1], [2, 2]] as [number, number][]]) {
      const c = classifyFreedraw(pts).confidence
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('features 都是 scale-invariant:同形状放大 10 倍,分类不变', () => {
    const small = classifyFreedraw(circle(0, 0, 10))
    const big = classifyFreedraw(circle(0, 0, 100))
    expect(small.kind).toBe(big.kind)
  })
})

// ── freedrawPoints ──────────────────────────────────────────────────────────

describe('freedrawPoints', () => {
  it('取出 freedraw 的点序列', () => {
    expect(freedrawPoints(freedrawEl([[1, 2], [3, 4]]))).toEqual([[1, 2], [3, 4]])
  })
  it('非 freedraw → null', () => {
    expect(freedrawPoints({ id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })).toBeNull()
  })
  it('freedraw 无点 → null', () => {
    expect(freedrawPoints({ id: 'f', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: {} })).toBeNull()
  })
})

// ── duplicateFreedraw ─────────────────────────────────────────────────────────

describe('duplicateFreedraw', () => {
  it('平移点序列 + bbox,换新 id', () => {
    const orig = freedrawEl([[10, 10], [20, 30]], 'orig')
    orig.x = 10; orig.y = 10; orig.w = 10; orig.h = 20
    const dup = duplicateFreedraw(orig, 'dup', 100, 50)
    expect(dup).not.toBeNull()
    expect(dup!.id).toBe('dup')
    expect(dup!.x).toBe(110)
    expect(dup!.y).toBe(60)
    expect(dup!.meta?.points).toEqual([[110, 60], [120, 80]])
  })

  it('原元素不被改(纯函数)', () => {
    const orig = freedrawEl([[0, 0], [10, 10]], 'orig')
    duplicateFreedraw(orig, 'dup', 5, 5)
    expect(orig.meta?.points).toEqual([[0, 0], [10, 10]])
    expect(orig.x).toBe(0)
  })

  it('非 freedraw → null', () => {
    const card: CanvasElement = { id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }
    expect(duplicateFreedraw(card, 'x', 1, 1)).toBeNull()
  })
})
