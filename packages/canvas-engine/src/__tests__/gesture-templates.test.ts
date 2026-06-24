import { describe, expect, it } from 'vitest'
import { recognizeShape, BUILTIN_SHAPE_TEMPLATES } from '../gesture-templates'
import type { Point } from '../gesture-recognizer'

// ── 造形状(独立于模板生成,用不同采样/位置/大小验证泛化) ────────────────────

function circle(cx: number, cy: number, r: number, n = 40): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return pts
}

function triangle(cx: number, cy: number, r: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  pts.push(pts[0]!)
  return pts
}

function square(cx: number, cy: number, s: number): Point[] {
  const h = s / 2
  return [
    { x: cx - h, y: cy - h }, { x: cx + h, y: cy - h },
    { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h },
    { x: cx - h, y: cy - h },
  ]
}

function check(cx: number, cy: number, s: number): Point[] {
  const h = s / 2
  return [{ x: cx - h, y: cy }, { x: cx - h / 3, y: cy + h }, { x: cx + h, y: cy - h }]
}

describe('BUILTIN_SHAPE_TEMPLATES', () => {
  it('含 circle / rect / triangle / check 四个预归一化模板', () => {
    const names = BUILTIN_SHAPE_TEMPLATES.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['circle', 'rect', 'triangle', 'check']))
    // 每个模板都是归一化过的 64 点
    for (const t of BUILTIN_SHAPE_TEMPLATES) {
      expect(t.points.length).toBe(64)
    }
  })
})

describe('recognizeShape', () => {
  it('圆 → circle(高置信度)', () => {
    const r = recognizeShape(circle(100, 100, 30))
    expect(r.shape).toBe('circle')
    expect(r.confidence).toBeGreaterThan(0.7)
  })

  it('三角 → triangle', () => {
    expect(recognizeShape(triangle(0, 0, 80)).shape).toBe('triangle')
  })

  it('方 → rect', () => {
    expect(recognizeShape(square(50, 50, 60)).shape).toBe('rect')
  })

  it('对勾 → check', () => {
    const r = recognizeShape(check(0, 0, 60))
    expect(r.shape).toBe('check')
  })

  it('缩放不变:小圆和大圆都认 circle', () => {
    expect(recognizeShape(circle(0, 0, 5)).shape).toBe('circle')
    expect(recognizeShape(circle(0, 0, 500)).shape).toBe('circle')
  })

  it('平移不变:任意位置都认', () => {
    expect(recognizeShape(circle(999, -999, 40)).shape).toBe('circle')
  })

  it('乱涂(非任何模板)→ unknown', () => {
    const scribble: Point[] = [
      { x: 0, y: 0 }, { x: 30, y: 10 }, { x: 5, y: 25 }, { x: 20, y: 5 }, { x: 0, y: 20 },
    ]
    const r = recognizeShape(scribble)
    expect(r.confidence).toBeLessThan(0.7)
  })

  it('点序列 <2 → unknown@0', () => {
    expect(recognizeShape([])).toEqual({ shape: 'unknown', confidence: 0 })
    expect(recognizeShape([{ x: 1, y: 1 }])).toEqual({ shape: 'unknown', confidence: 0 })
  })

  it('置信度 ∈ [0,1]', () => {
    for (const pts of [circle(0, 0, 50), triangle(0, 0, 50), square(0, 0, 80)]) {
      const c = recognizeShape(pts).confidence
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})
