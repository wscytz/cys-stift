import { describe, expect, it } from 'vitest'
import { bboxOf, commitFreedraw, translateFreedraw, scaleFreedrawToBox } from '../self-built-freedraw'
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
