import { describe, expect, it } from 'vitest'
import {
  resamplePath,
  rotateToZero,
  scaleToSquare,
  translateToOrigin,
  normalizeGesture,
  recognizeGesture,
  type Point,
  type GestureTemplate,
} from '../gesture-recognizer'

// ── 造形状 ─────────────────────────────────────────────────────────────────────

/** 圆(闭合)。 */
function circle(cx: number, cy: number, r: number, n = 32): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return pts
}

/** 三角形。 */
function triangle(cx: number, cy: number, r: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  pts.push(pts[0]!) // 闭合
  return pts
}

/** 正方形描边。 */
function square(cx: number, cy: number, s: number): Point[] {
  const half = s / 2
  return [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
    { x: cx - half, y: cy - half },
  ]
}

// ── Step 1: resamplePath ──────────────────────────────────────────────────────

describe('resamplePath', () => {
  it('重采样到指定点数', () => {
    const out = resamplePath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 11)
    expect(out).toHaveLength(11)
    expect(out[0]).toEqual({ x: 0, y: 0 })
    expect(out[10]!.x).toBeCloseTo(10)
  })
  it('空数组 → 空', () => {
    expect(resamplePath([], 64)).toEqual([])
  })
  it('单点 → 复制 n 份', () => {
    const out = resamplePath([{ x: 5, y: 5 }], 10)
    expect(out).toHaveLength(10)
    expect(out.every((p) => p.x === 5 && p.y === 5)).toBe(true)
  })
  it('路径长 0(点重合)→ 复制首点 n 份', () => {
    const out = resamplePath([{ x: 1, y: 1 }, { x: 1, y: 1 }], 8)
    expect(out).toHaveLength(8)
  })
})

// ── Step 2: rotateToZero ─────────────────────────────────────────────────────

describe('rotateToZero', () => {
  it('旋转后首点-质心连线的角度归 0(指示角=0)', () => {
    const pts = [{ x: 0, y: 10 }, { x: 20, y: 0 }, { x: 20, y: -10 }]
    const out = rotateToZero(pts)
    const cx = out.reduce((s, p) => s + p.x, 0) / out.length
    const cy = out.reduce((s, p) => s + p.y, 0) / out.length
    // 指示角 = atan2(首点.y - 质心.y, 首点.x - 质心.x) 应 ≈ 0(首点在质心正右方)
    const angle = Math.atan2(out[0]!.y - cy, out[0]!.x - cx)
    expect(Math.abs(angle)).toBeLessThan(0.01)
  })
  it('指示角本就 0 时基本不动(首点已在质心右方)', () => {
    const pts = [{ x: 10, y: 0 }, { x: 0, y: 5 }, { x: 0, y: -5 }]
    const out = rotateToZero(pts)
    // 形状应几乎不变(旋转角≈0)
    let drift = 0
    for (let i = 0; i < pts.length; i++) drift += Math.hypot(out[i]!.x - pts[i]!.x, out[i]!.y - pts[i]!.y)
    expect(drift).toBeLessThan(0.5)
  })
})

// ── Step 3: scale + translate ────────────────────────────────────────────────

describe('scaleToSquare', () => {
  it('缩到 size×size 方块', () => {
    const out = scaleToSquare([{ x: 0, y: 0 }, { x: 100, y: 50 }], 250)
    const b = { minX: Math.min(...out.map((p) => p.x)), maxX: Math.max(...out.map((p) => p.x)), minY: Math.min(...out.map((p) => p.y)), maxY: Math.max(...out.map((p) => p.y)) }
    expect(b.maxX - b.minX).toBeCloseTo(250)
    expect(b.maxY - b.minY).toBeCloseTo(250) // 非均匀缩放:y 也拉到 250
  })
  it('1D(短边 0)不除零', () => {
    expect(() => scaleToSquare([{ x: 0, y: 0 }, { x: 10, y: 0 }], 250)).not.toThrow()
  })
})

describe('translateToOrigin', () => {
  it('质心移到原点', () => {
    const out = translateToOrigin([{ x: 100, y: 100 }, { x: 102, y: 102 }])
    const c = out.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 })
    expect(c.x / out.length).toBeCloseTo(0)
    expect(c.y / out.length).toBeCloseTo(0)
  })
})

// ── Step 4: recognizeGesture ─────────────────────────────────────────────────

describe('recognizeGesture', () => {
  // 模板:归一化好的 circle / triangle / square。
  const templates: GestureTemplate[] = [
    { name: 'circle', points: normalizeGesture(circle(0, 0, 50)) },
    { name: 'triangle', points: normalizeGesture(triangle(0, 0, 50)) },
    { name: 'square', points: normalizeGesture(square(0, 0, 80)) },
  ]

  it('圆 → 识别为 circle(高置信度)', () => {
    const r = recognizeGesture(circle(100, 100, 30), templates)
    expect(r.name).toBe('circle')
    expect(r.score).toBeGreaterThan(0.7)
  })

  it('三角 → 识别为 triangle', () => {
    const r = recognizeGesture(triangle(0, 0, 80), templates)
    expect(r.name).toBe('triangle')
    expect(r.score).toBeGreaterThan(0.7)
  })

  it('方 → 识别为 square', () => {
    const r = recognizeGesture(square(50, 50, 60), templates)
    expect(r.name).toBe('square')
    expect(r.score).toBeGreaterThan(0.7)
  })

  it('缩放不变:小圆和大圆都认出 circle', () => {
    expect(recognizeGesture(circle(0, 0, 5), templates).name).toBe('circle')
    expect(recognizeGesture(circle(0, 0, 500), templates).name).toBe('circle')
  })

  it('平移不变:任意位置都认出', () => {
    expect(recognizeGesture(circle(999, -999, 40), templates).name).toBe('circle')
  })

  it('旋转不变:旋转后的圆仍认出 circle', () => {
    // 圆旋转不变是平凡的;用三角验证更严格。
    const rotated = triangle(0, 0, 50).map((p) => {
      const a = Math.PI / 4 // 旋转 45°
      return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }
    })
    expect(recognizeGesture(rotated, templates).name).toBe('triangle')
  })

  it('不同形状得分区分:圆 vs 三角 vs 方互不混淆', () => {
    const cAsT = recognizeGesture(circle(0, 0, 50), templates.filter((t) => t.name === 'triangle'))
    const cAsC = recognizeGesture(circle(0, 0, 50), templates.filter((t) => t.name === 'circle'))
    // 同一个圆,对 circle 模板的得分 > 对 triangle 模板的得分。
    expect(cAsC.score).toBeGreaterThan(cAsT.score)
  })

  it('空候选 → unknown@0', () => {
    expect(recognizeGesture([], templates)).toEqual({ name: 'unknown', score: 0 })
    expect(recognizeGesture([{ x: 1, y: 1 }], templates)).toEqual({ name: 'unknown', score: 0 })
  })

  it('无模板 → unknown@0', () => {
    expect(recognizeGesture(circle(0, 0, 50), [])).toEqual({ name: 'unknown', score: 0 })
  })

  it('score 始终 [0..1]', () => {
    for (const pts of [circle(0, 0, 50), triangle(0, 0, 50), square(0, 0, 80)]) {
      const s = recognizeGesture(pts, templates).score
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})
