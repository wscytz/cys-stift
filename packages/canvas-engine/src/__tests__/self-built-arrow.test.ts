import { describe, expect, it } from 'vitest'
import {
  elementCenter,
  borderPoint,
  arrowEndpoints,
  dashPattern,
  arrowheadPoints,
  arrowRoute,
  elbowSegments,
  arrowHeadAngle,
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

// ── 箭头路由形态(straight / curve / elbow)共享几何 ──────────────────────────
describe('arrowRoute — 路由形态解析(含向后兼容)', () => {
  it('显式 route=straight → straight', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'straight' } as CanvasElement
    expect(arrowRoute(a)).toBe('straight')
  })
  it('显式 route=curve → curve', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'curve', curve: { cx: 50, cy: 50 } } as CanvasElement
    expect(arrowRoute(a)).toBe('curve')
  })
  it('显式 route=elbow → elbow', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'elbow', elbow: [{ x: 50, y: 0 }] } as CanvasElement
    expect(arrowRoute(a)).toBe('elbow')
  })
  it('向后兼容:无 route 但有 curve 数据 → curve(旧箭头)', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, curve: { cx: 50, cy: 50 } } as CanvasElement
    expect(arrowRoute(a)).toBe('curve')
  })
  it('无 route 无 curve 无 elbow → straight(默认)', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0 } as CanvasElement
    expect(arrowRoute(a)).toBe('straight')
  })
  it('route=straight 但残留 curve 数据 → straight(route 优先,切回直线)', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'straight', curve: { cx: 50, cy: 50 } } as CanvasElement
    expect(arrowRoute(a)).toBe('straight')
  })
})

describe('elbowSegments — 折线路径折点', () => {
  const from = { x: 0, y: 0 }
  const to = { x: 100, y: 100 }
  it('route=elbow 1 折点 → [from, elbow, to]', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'elbow', elbow: [{ x: 50, y: 0 }] } as CanvasElement
    expect(elbowSegments(a, from, to)).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 100 }])
  })
  it('route=elbow 2 折点 → [from, e0, e1, to]', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'elbow', elbow: [{ x: 50, y: 0 }, { x: 50, y: 100 }] } as CanvasElement
    expect(elbowSegments(a, from, to)).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }])
  })
  it('route=elbow 0 折点(退化)→ [from, to](直线段)', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'elbow' } as CanvasElement
    expect(elbowSegments(a, from, to)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 100 }])
  })
  it('route=straight → null(不走折线分支)', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'straight' } as CanvasElement
    expect(elbowSegments(a, from, to)).toBeNull()
  })
  it('route=curve → null', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'curve', curve: { cx: 50, cy: 50 } } as CanvasElement
    expect(elbowSegments(a, from, to)).toBeNull()
  })
})

describe('arrowHeadAngle — 终点切线角(按 route)', () => {
  const from = { x: 0, y: 0 }
  const to = { x: 100, y: 0 }
  it('straight → atan2(to - from):水平向右 = 0', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0 } as CanvasElement
    expect(arrowHeadAngle(a, from, to)).toBeCloseTo(0)
  })
  it('curve → atan2(to - ctrl):ctrl 在 to 上方 → 角朝下(正)', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'curve', curve: { cx: 50, cy: -50 } } as CanvasElement
    // to=(100,0), ctrl=(50,-50):atan2(0-(-50), 100-50) = atan2(50,50) = π/4
    expect(arrowHeadAngle(a, from, to)).toBeCloseTo(Math.PI / 4)
  })
  it('elbow 1 折点 → 最后一段 = to - lastElbow', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'elbow', elbow: [{ x: 100, y: 0 }] } as CanvasElement
    // elbow=(100,0), to=(100,0) → 同点退化 → atan2(0,0)=0
    expect(arrowHeadAngle(a, from, to)).toBeCloseTo(0)
  })
  it('elbow 折点在 to 正左方 → 最后一段水平向右', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'elbow', elbow: [{ x: 0, y: 0 }] } as CanvasElement
    // lastElbow=(0,0), to=(100,0) → atan2(0,100)=0
    expect(arrowHeadAngle(a, from, to)).toBeCloseTo(0)
  })
  it('elbow 无折点(退化)→ atan2(to - from)', () => {
    const a = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, route: 'elbow' } as CanvasElement
    expect(arrowHeadAngle(a, from, to)).toBeCloseTo(0)
  })
})
