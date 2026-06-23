import { describe, expect, it } from 'vitest'
import { unionBounds, expandBounds, normalizeBox } from '../bounds'

describe('normalizeBox', () => {
  it('正 bbox 原样返回', () => {
    expect(normalizeBox({ x: 10, y: 20, w: 30, h: 40 })).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })
  it('负 w 翻转 x', () => {
    expect(normalizeBox({ x: 200, y: 20, w: -100, h: 40 })).toEqual({ x: 100, y: 20, w: 100, h: 40 })
  })
  it('负 h 翻转 y', () => {
    expect(normalizeBox({ x: 10, y: 200, w: 30, h: -100 })).toEqual({ x: 10, y: 100, w: 30, h: 100 })
  })
  it('负 w+h(自由箭头反向)两轴都翻', () => {
    expect(normalizeBox({ x: 200, y: 200, w: -100, h: -100 })).toEqual({ x: 100, y: 100, w: 100, h: 100 })
  })
  it('零尺寸保持', () => {
    expect(normalizeBox({ x: 5, y: 5, w: 0, h: 0 })).toEqual({ x: 5, y: 5, w: 0, h: 0 })
  })
})

describe('unionBounds', () => {
  it('空列表 → null', () => {
    expect(unionBounds([])).toBeNull()
  })
  it('两 box 并集', () => {
    expect(unionBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }]))
      .toEqual({ x: 0, y: 0, w: 30, h: 30 })
  })
})

describe('expandBounds', () => {
  it('四边各扩 border', () => {
    expect(expandBounds({ x: 10, y: 10, w: 20, h: 20 }, 5)).toEqual({ x: 5, y: 5, w: 30, h: 30 })
  })
  it('shadow + border=0 → +5 slack', () => {
    expect(expandBounds({ x: 0, y: 0, w: 10, h: 10 }, 0, true)).toEqual({ x: -5, y: -5, w: 20, h: 20 })
  })
})
