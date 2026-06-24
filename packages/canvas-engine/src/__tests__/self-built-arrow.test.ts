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
  it('R1.7:负 w/h → 中心落在可视 box 的中心(非 x+w/2)', () => {
    // 可视 box:x 100..200(因 w=-100 → 右上角在 x=100),中心 x=150
    const el = { id: 'a', kind: 'card', x: 200, y: 0, w: -100, h: 100, rotation: 0 } as CanvasElement
    expect(elementCenter(el)).toEqual({ x: 150, y: 50 })
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
  it('自由箭头(无 from/to,bbox 非零)→ 端点 = bbox 两角', () => {
    const free = { id: 'fa', kind: 'arrow', x: 10, y: 20, w: 100, h: 40, rotation: 0 } as CanvasElement
    expect(arrowEndpoints(free, [])).toEqual({ from: { x: 10, y: 20 }, to: { x: 110, y: 60 } })
  })
  it('自由箭头 w/h 可负(表方向)', () => {
    const free = { id: 'fa', kind: 'arrow', x: 100, y: 100, w: -50, h: -30, rotation: 0 } as CanvasElement
    expect(arrowEndpoints(free, [])).toEqual({ from: { x: 100, y: 100 }, to: { x: 50, y: 70 } })
  })
  it('无 from/to 且 bbox 零 → null(不画)', () => {
    const empty = { id: 'fa', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0 } as CanvasElement
    expect(arrowEndpoints(empty, [])).toEqual({ from: null, to: null })
  })
  it('R1.7:to 元素负 w(可视 100..200)→ 箭头出口落在正确边框(非 x=200)', () => {
    // A 可视 0..100,中心 (50,50);B {x:200,w:-100} 可视 100..200,中心 (150,50)。
    // from = A 朝 B:dx=100 → tX=0.5 → from=(100,50)。
    // to = B 朝 A:中心(150,50) 朝 (50,50):dx=-100 → tX=0.5 → to=(100,50)。
    // 旧 bug:elementCenter 用 x+w/2=200/2+200=150 旧值实际 x+w/2=200+(-50)=150(碰巧对中心),
    // 但 borderPoint 的 hw = w/2 = -50 会让出口偏移。正确 to 应在 x=100(B 左边框)。
    const cardA = { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 } as CanvasElement
    const cardB = { id: 'cb', kind: 'card', x: 200, y: 0, w: -100, h: 100, rotation: 0 } as CanvasElement
    const arrow = { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb' } as CanvasElement
    const { from, to } = arrowEndpoints(arrow, [cardA, cardB])
    expect(from).toEqual({ x: 100, y: 50 })
    expect(to).toEqual({ x: 100, y: 50 })
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
