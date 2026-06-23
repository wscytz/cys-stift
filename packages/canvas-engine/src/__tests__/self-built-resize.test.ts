import { describe, expect, it } from 'vitest'
import { handleAtPoint, resizeGeometry, type Handle } from '../self-built-resize'

const el = { x: 100, y: 100, w: 100, h: 100 } // 四角:nw(100,100) ne(200,100) sw(100,200) se(200,200)

describe('handleAtPoint', () => {
  it('命中四角', () => {
    expect(handleAtPoint(el, { x: 100, y: 100 }, 1)).toBe('nw')
    expect(handleAtPoint(el, { x: 200, y: 100 }, 1)).toBe('ne')
    expect(handleAtPoint(el, { x: 100, y: 200 }, 1)).toBe('sw')
    expect(handleAtPoint(el, { x: 200, y: 200 }, 1)).toBe('se')
  })
  it('中心 → null', () => {
    expect(handleAtPoint(el, { x: 150, y: 150 }, 1)).toBeNull()
  })
  it('超出容差 → null(容差 6px,zoom=1)', () => {
    // 距角 7 > 容差 6 → 不命中 → null(计划 Step 1.1 原写 toBe('nw') 有误,已按 self-review 修正为 toBeNull)
    expect(handleAtPoint(el, { x: 107, y: 100 }, 1)).toBeNull()
  })
  it('zoom=2 时页坐标容差减半(6/2=3 页单位)', () => {
    expect(handleAtPoint(el, { x: 102, y: 100 }, 2)).toBe('nw') // 距角 2 ≤ 3 → nw
    expect(handleAtPoint(el, { x: 105, y: 100 }, 2)).toBeNull() // 距角 5 > 3 → null
  })
})

describe('resizeGeometry', () => {
  const start = { x: 100, y: 100, w: 100, h: 100 } // right=200 bottom=200
  it('se 拖小:fixed=nw', () => {
    expect(resizeGeometry('se', start, { x: 150, y: 150 })).toEqual({ x: 100, y: 100, w: 50, h: 50 })
  })
  it('nw 拖:fixed=se,x/y 随指针', () => {
    expect(resizeGeometry('nw', start, { x: 120, y: 120 })).toEqual({ x: 120, y: 120, w: 80, h: 80 })
  })
  it('ne 拖:fixed=sw', () => {
    expect(resizeGeometry('ne', start, { x: 150, y: 80 })).toEqual({ x: 100, y: 80, w: 50, h: 120 })
  })
  it('sw 拖:fixed=ne', () => {
    expect(resizeGeometry('sw', start, { x: 80, y: 150 })).toEqual({ x: 80, y: 100, w: 120, h: 50 })
  })
  it('se clamp 到 min 10', () => {
    expect(resizeGeometry('se', start, { x: 101, y: 101 })).toEqual({ x: 100, y: 100, w: 10, h: 10 })
  })
  it('nw clamp 到 min 10(对角固定)', () => {
    expect(resizeGeometry('nw', start, { x: 195, y: 195 })).toEqual({ x: 190, y: 190, w: 10, h: 10 })
  })
})
