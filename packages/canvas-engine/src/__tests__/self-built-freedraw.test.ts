import { describe, expect, it } from 'vitest'
import { bboxOf, commitFreedraw } from '../self-built-freedraw'

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
