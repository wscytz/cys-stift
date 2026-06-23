import { describe, expect, it } from 'vitest'
import {
  elementCenter,
  borderPoint,
  arrowEndpoints,
  dashPattern,
  arrowheadPoints,
} from '../self-built-arrow'
import type { CanvasElement } from '../canvas-host'

describe('elementCenter', () => {
  it('元素中心', () => {
    const el = { id: 'a', kind: 'card', x: 100, y: 50, w: 240, h: 120, rotation: 0 } as CanvasElement
    expect(elementCenter(el)).toEqual({ x: 220, y: 110 })
  })
})

describe('borderPoint', () => {
  it('目标在正右方 → 出口在右边框(中心 + hw)', () => {
    expect(borderPoint({ x: 0, y: 0 }, 50, 30, { x: 100, y: 0 })).toEqual({ x: 50, y: 0 })
  })
  it('目标在正上方 → 出口在上边框(中心 - hh)', () => {
    expect(borderPoint({ x: 0, y: 0 }, 50, 30, { x: 0, y: -100 })).toEqual({ x: 0, y: -30 })
  })
  it('目标在斜上方 → 受 hh 约束(更窄的那轴)', () => {
    // hw=50,hh=30;dx=100,dy=100 → tX=0.5,tY=0.3 → t=0.3 → {30,30}
    expect(borderPoint({ x: 0, y: 0 }, 50, 30, { x: 100, y: 100 })).toEqual({ x: 30, y: 30 })
  })
  it('退化:目标=中心 → 中心', () => {
    expect(borderPoint({ x: 5, y: 6 }, 50, 30, { x: 5, y: 6 })).toEqual({ x: 5, y: 6 })
  })
})

describe('arrowEndpoints', () => {
  const cardA = { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 } as CanvasElement
  const cardB = { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 } as CanvasElement
  const arrow = { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb' } as CanvasElement

  it('两端元素都在 → from 在 A 右边框,to 在 B 左边框', () => {
    const { from, to } = arrowEndpoints(arrow, [cardA, cardB])
    // A 中心 (50,50),hw=hh=50;朝 B 中心 (250,50):dx=200 → tX=0.25 → from=(100,50)
    expect(from).toEqual({ x: 100, y: 50 })
    // B 中心 (250,50),朝 A 中心 (50,50):dx=-200 → tX=0.25 → to=(200,50)
    expect(to).toEqual({ x: 200, y: 50 })
  })
  it('from 元素缺失 → from/to 都 null(不画半截)', () => {
    const ghost = { ...arrow, from: 'ghost' } as CanvasElement
    expect(arrowEndpoints(ghost, [cardB])).toEqual({ from: null, to: null })
  })
  it('to 元素缺失 → 都 null', () => {
    const ghost = { ...arrow, to: 'ghost' } as CanvasElement
    expect(arrowEndpoints(ghost, [cardA])).toEqual({ from: null, to: null })
  })
})

describe('dashPattern — 语义线型', () => {
  it('solid / undefined → 空数组(实线)', () => {
    expect(dashPattern('solid')).toEqual([])
    expect(dashPattern(undefined)).toEqual([])
  })
  it('dashed → 段+隙', () => {
    expect(dashPattern('dashed')).toEqual([8, 6])
  })
  it('dotted → 短点', () => {
    expect(dashPattern('dotted')).toEqual([1.5, 5])
  })
})

describe('arrowheadPoints — 语义箭头形', () => {
  const tip = { x: 100, y: 0 }
  it('none → 无点(不画箭头)', () => {
    expect(arrowheadPoints('none', tip, 0)).toEqual([])
  })
  it('arrow → [left, tip, right] 三点(开口 V)', () => {
    const pts = arrowheadPoints('arrow', tip, 0, 10)
    expect(pts).toHaveLength(3)
    expect(pts[1]).toEqual(tip) // 中点是 tip
  })
  it('triangle → 同样三点(调用方闭合填充)', () => {
    const pts = arrowheadPoints('triangle', tip, 0, 10)
    expect(pts).toHaveLength(3)
    expect(pts[1]).toEqual(tip)
  })
  it('沿来向角:水平 angle=0 时两翼点 x < tip(在 tip 后方)', () => {
    const [left, , right] = arrowheadPoints('arrow', tip, 0, 10)
    expect(left!.x).toBeLessThan(tip.x)
    expect(right!.x).toBeLessThan(tip.x)
  })
})
