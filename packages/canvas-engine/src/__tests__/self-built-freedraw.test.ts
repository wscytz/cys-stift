import { describe, expect, it } from 'vitest'
import { bboxOf, commitFreedraw, translateFreedraw, scaleFreedrawToBox, freedrawPointsOf } from '../self-built-freedraw'
import type { CanvasElement } from '../canvas-host'

function fd(points: [number, number][], box?: { x: number; y: number; w: number; h: number }): CanvasElement {
  const b = box ?? bboxOf(points)
  return { id: 'f', kind: 'freedraw', x: b.x, y: b.y, w: b.w, h: b.h, rotation: 0, meta: { points } }
}

describe('bboxOf', () => {
  it('空点集 → 0 bbox', () => {
    expect(bboxOf([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
  it('算最小角 + 尺寸', () => {
    expect(bboxOf([[10, 20], [30, 5], [20, 50]])).toEqual({ x: 10, y: 5, w: 20, h: 45 })
  })
  it('单点 → 0 尺寸', () => {
    expect(bboxOf([[7, 8]])).toEqual({ x: 7, y: 8, w: 0, h: 0 })
  })
})

describe('commitFreedraw', () => {
  it('建 freedraw 元素:bbox + 点序列进 meta.points', () => {
    const el = commitFreedraw('f1', [[10, 10], [40, 50]], 'black')
    expect(el).toMatchObject({
      id: 'f1', kind: 'freedraw', x: 10, y: 10, w: 30, h: 40, rotation: 0, color: 'black',
    })
    expect(el.meta?.points).toEqual([[10, 10], [40, 50]])
  })
  it('无 color 时 color 字段缺省(undefined)', () => {
    const el = commitFreedraw('f2', [[0, 0]])
    expect(el.color).toBeUndefined()
  })
  it('R1.2:拷贝调用方点数组(不持引用 — 改原数组不影响元素)', () => {
    const pts: [number, number][] = [[0, 0]]
    const el = commitFreedraw('f3', pts)
    pts[0]![0] = 999
    expect((el.meta as { points: [number, number][] }).points[0]![0]).toBe(0) // 不是 999
  })
  it('R1.2:外层数组也不持引用(push 不污染元素)', () => {
    const pts: [number, number][] = [[1, 1]]
    const el = commitFreedraw('f4', pts)
    pts.push([5, 5])
    expect((el.meta as { points: [number, number][] }).points).toHaveLength(1)
    expect((el.meta as { points: [number, number][] }).points).toEqual([[1, 1]])
  })
  it('store-time RDP:密集共线点简化到首尾', () => {
    // 100 个共线点 → commit 后只存首尾 2 个
    const pts: [number, number][] = Array.from({ length: 100 }, (_, i) => [i, 0] as [number, number])
    const el = commitFreedraw('f5', pts)
    const stored = (el.meta as { points: [number, number][] }).points
    expect(stored).toEqual([[0, 0], [99, 0]])
  })
  it('store-time RDP:折角笔画保留折角', () => {
    // L 形密集采样,折角 (50, 0) 必须在 commit 后的点里(detectArrowRoute 靠它)
    const pts: [number, number][] = []
    for (let x = 0; x <= 50; x += 5) pts.push([x, 0])
    for (let y = 5; y <= 50; y += 5) pts.push([50, y])
    const el = commitFreedraw('f6', pts)
    const stored = (el.meta as { points: [number, number][] }).points
    expect(stored).toContainEqual([50, 0])
    expect(stored.length).toBeLessThan(pts.length)
  })
  it('store-time RDP:bbox 与存储点严格一致(从简化点算)', () => {
    // 简化后 bbox 必须正好包住存储的点,不漂移
    const pts: [number, number][] = Array.from({ length: 50 }, (_, i) => [i * 2, 0] as [number, number])
    const el = commitFreedraw('f7', pts)
    const stored = (el.meta as { points: [number, number][] }).points
    expect(el.x).toBe(Math.min(...stored.map((p) => p[0])))
    expect(el.y).toBe(Math.min(...stored.map((p) => p[1])))
    expect(el.w).toBe(Math.max(...stored.map((p) => p[0])) - el.x)
    expect(el.h).toBe(Math.max(...stored.map((p) => p[1])) - el.y)
  })
})

describe('freedrawPointsOf', () => {
  it('freedraw 元素 → 返回点数组', () => {
    const el: CanvasElement = { id: 'f', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: { points: [[1, 2], [3, 4]] } }
    expect(freedrawPointsOf(el)).toEqual([[1, 2], [3, 4]])
  })
  it('非 freedraw → null', () => {
    const el: CanvasElement = { id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }
    expect(freedrawPointsOf(el)).toBeNull()
  })
  it('freedraw 但无 meta.points → null', () => {
    const el: CanvasElement = { id: 'f', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0 }
    expect(freedrawPointsOf(el)).toBeNull()
  })
  it('freedraw 但 points 为空数组 → null', () => {
    const el: CanvasElement = { id: 'f', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: { points: [] } }
    expect(freedrawPointsOf(el)).toBeNull()
  })
})

describe('translateFreedraw', () => {
  it('点序列 + bbox 整体平移', () => {
    const el = fd([[10, 10], [40, 50]])
    const moved = translateFreedraw(el, 100, 50)!
    expect(moved.meta?.points).toEqual([[110, 60], [140, 100]])
    expect(moved.x).toBe(110)
    expect(moved.y).toBe(60)
  })
  it('纯函数:原元素不被改', () => {
    const el = fd([[10, 10], [40, 50]])
    translateFreedraw(el, 5, 5)
    expect(el.meta?.points).toEqual([[10, 10], [40, 50]])
    expect(el.x).toBe(10)
  })
  it('非 freedraw → null', () => {
    expect(translateFreedraw({ id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }, 1, 1)).toBeNull()
  })
})

describe('scaleFreedrawToBox', () => {
  it('点序列线性映射到新 box(放大 2 倍)', () => {
    // bbox (0,0,100,100),点在两角 + 中心
    const el = fd([[0, 0], [50, 50], [100, 100]], { x: 0, y: 0, w: 100, h: 100 })
    const scaled = scaleFreedrawToBox(el, { x: 0, y: 0, w: 200, h: 200 })!
    expect(scaled.meta?.points).toEqual([[0, 0], [100, 100], [200, 200]])
    expect(scaled.w).toBe(200)
  })
  it('新 box 带偏移:点跟着平移 + 缩放', () => {
    const el = fd([[0, 0], [100, 100]], { x: 0, y: 0, w: 100, h: 100 })
    const scaled = scaleFreedrawToBox(el, { x: 50, y: 50, w: 100, h: 100 })!
    expect(scaled.meta?.points).toEqual([[50, 50], [150, 150]])
  })
  it('退化轴(w=0:纯垂直笔画)→ 该轴不除零,只平移', () => {
    const el = fd([[10, 0], [10, 100]], { x: 10, y: 0, w: 0, h: 100 })
    const scaled = scaleFreedrawToBox(el, { x: 30, y: 0, w: 0, h: 200 })!
    // x 轴 w=0 → 不缩放只平移(+20);y 轴正常缩放 2 倍
    expect(scaled.meta?.points).toEqual([[30, 0], [30, 200]])
  })
  it('非 freedraw → null', () => {
    expect(scaleFreedrawToBox({ id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }, { x: 0, y: 0, w: 2, h: 2 })).toBeNull()
  })
})
