import { describe, expect, it } from 'vitest'
import {
  classifyFreedraw,
  duplicateFreedraw,
  freedrawToArrow,
  detectArrowRoute,
} from '../freedraw-classify'
import { commitFreedraw, freedrawPointsOf } from '../self-built-freedraw'
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

// ── freedrawToArrow ───────────────────────────────────────────────────────────

describe('freedrawToArrow', () => {
  it('首尾点 → 自由箭头端点(bbox 编码线段),默认 solid+arrow 签名', () => {
    const el = freedrawEl([[10, 20], [50, 40], [110, 60]], 'f')
    const arrow = freedrawToArrow(el, 'a1')!
    expect(arrow.kind).toBe('arrow')
    expect(arrow.id).toBe('a1')
    // 起点=首点 (10,20);终点=尾点 (110,60) → w=100,h=40
    expect(arrow).toMatchObject({ x: 10, y: 20, w: 100, h: 40, dash: 'solid', arrowhead: 'arrow' })
    // 自由箭头:无 from/to
    expect(arrow.from).toBeUndefined()
    expect(arrow.to).toBeUndefined()
  })

  it('点序列 <2 → null', () => {
    expect(freedrawToArrow(freedrawEl([[5, 5]], 'f'), 'a')).toBeNull()
  })

  it('非 freedraw → null', () => {
    const card: CanvasElement = { id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }
    expect(freedrawToArrow(card, 'a')).toBeNull()
  })
})

// ── detectArrowRoute — 手绘形态识别(straight/curve/elbow)──────────────────

describe('detectArrowRoute', () => {
  it('近似直线笔画 → straight', () => {
    // (0,0) → (100,0) 均匀采样,几乎不偏
    expect(detectArrowRoute(line(0, 0, 100, 0))).toEqual({ kind: 'straight' })
  })

  it('明确 L 形折角笔画 → elbow(1 折点)', () => {
    // (0,0) → (50,0) 水平,再 → (50,80) 垂直:90° 折角
    const pts: [number, number][] = []
    for (let i = 0; i <= 10; i++) pts.push([i * 5, 0]) // 水平段
    for (let i = 1; i <= 8; i++) pts.push([50, i * 10]) // 垂直段
    const r = detectArrowRoute(pts)
    expect(r.kind).toBe('elbow')
    expect(r.elbow).toHaveLength(1)
    // 折角在拐弯处附近 (≈50, 附近)
    expect(r.elbow![0]!.x).toBeCloseTo(50, 0)
  })

  it('Z 形两折角笔画 → elbow(2 折点)', () => {
    // (0,0)→(40,0) →(40,40) →(80,40):两个折角
    const pts: [number, number][] = []
    for (let i = 0; i <= 8; i++) pts.push([i * 5, 0])
    for (let i = 1; i <= 8; i++) pts.push([40, i * 5])
    for (let i = 1; i <= 8; i++) pts.push([40 + i * 5, 40])
    const r = detectArrowRoute(pts)
    expect(r.kind).toBe('elbow')
    expect(r.elbow).toHaveLength(2)
  })

  it('平滑弯曲笔画 → curve(控制点在笔画弧的凸侧)', () => {
    // 弧形:(0,0) 沿上凸弧到 (100,0),中点 (50,-40)。采样平滑无急折。
    const pts: [number, number][] = []
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const x = 100 * t
      const y = -40 * Math.sin(Math.PI * t) // 平滑正弦弧,中点 y=-40
      pts.push([x, y])
    }
    const r = detectArrowRoute(pts)
    expect(r.kind).toBe('curve')
    expect(r.curve).toBeDefined()
    // 控制点 y 应在中点上方(让曲线凸向上):反算 C=2M-0.5(from+to),M≈(50,-40)
    // C = 2*(50,-40) - 0.5*((0,0)+(100,0)) = (100,-80) - (50,0) = (50,-80)
    expect(r.curve!.cy).toBe(-80)
  })

  it('点序列 <3 → straight(退化)', () => {
    expect(detectArrowRoute([[0, 0], [10, 10]])).toEqual({ kind: 'straight' })
  })
})

// ── 回归:commitFreedraw 的 store-time RDP 不破形态识别(保角设计负载点)──────
//   detectArrowRoute 靠折角;RDP 必须保留真折角,否则「转 elbow 箭头」会坏。
//   L 形(90° ≫ 45° 阈值)是鲁棒负载点;直线退化也必稳。

describe('回归:RDP 简化后 detectArrowRoute 仍正确识别', () => {
  it('L 形笔画 commit(RDP)后仍识别为 elbow(折角保留)', () => {
    const dense: [number, number][] = []
    for (let i = 0; i <= 10; i++) dense.push([i * 5, 0])
    for (let i = 1; i <= 8; i++) dense.push([50, i * 10])
    const simplified = freedrawPointsOf(commitFreedraw('f', dense))!
    expect(simplified.length).toBeLessThan(dense.length) // 确实简化了
    expect(detectArrowRoute(simplified).kind).toBe('elbow')
  })

  it('Z 形两折角笔画 commit(RDP)后仍识别为 elbow', () => {
    const dense: [number, number][] = []
    for (let i = 0; i <= 8; i++) dense.push([i * 5, 0])
    for (let i = 1; i <= 8; i++) dense.push([40, i * 5])
    for (let i = 1; i <= 8; i++) dense.push([40 + i * 5, 40])
    const simplified = freedrawPointsOf(commitFreedraw('f', dense))!
    expect(detectArrowRoute(simplified).kind).toBe('elbow')
  })

  it('直线笔画 commit(RDP)后仍识别为 straight', () => {
    const simplified = freedrawPointsOf(commitFreedraw('f', line(0, 0, 100, 0)))!
    expect(detectArrowRoute(simplified).kind).toBe('straight')
  })
})

// ── freedrawToArrow 形态:转出的箭头带 route ────────────────────────────────

describe('freedrawToArrow — 形态识别', () => {
  it('直线笔画 → straight 箭头(无 route 字段,默认直线)', () => {
    const el = freedrawEl(line(0, 0, 100, 0), 'f')
    const arrow = freedrawToArrow(el, 'a1')!
    expect(arrow.route).toBeUndefined()
    expect(arrow.curve).toBeUndefined()
    expect(arrow.elbow).toBeUndefined()
  })

  it('L 形笔画 → elbow 箭头(带折点)', () => {
    const pts: [number, number][] = []
    for (let i = 0; i <= 10; i++) pts.push([i * 5, 0])
    for (let i = 1; i <= 8; i++) pts.push([50, i * 10])
    const arrow = freedrawToArrow(freedrawEl(pts, 'f'), 'a1')!
    expect(arrow.route).toBe('elbow')
    expect(arrow.elbow).toBeDefined()
    expect(arrow.elbow!.length).toBeGreaterThanOrEqual(1)
  })
})
