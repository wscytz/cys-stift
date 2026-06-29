import { describe, it, expect } from 'vitest'
import { computeAutoLayout } from '../auto-layout'
import type { CanvasElement } from '@cys-stift/canvas-engine'

function card(id: string, x = 0, y = 0, w = 200, h = 120): CanvasElement {
  return { id, kind: 'card', x, y, w, h, rotation: 0 }
}
function arrow(id: string, from: string, to: string): CanvasElement {
  return { id, kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from, to }
}

describe('computeAutoLayout', () => {
  it('空元素 → 空 Map', () => {
    expect(computeAutoLayout([]).size).toBe(0)
  })

  it('单 card 无 arrow → 原位返回(不挪动)', () => {
    const c = card('a', 100, 50)
    const m = computeAutoLayout([c])
    expect(m.get('a')).toEqual({ x: 100, y: 50 })
  })

  it('线性链 A→B→C → 三卡分层不重叠', () => {
    const els = [card('a'), card('b'), card('c'), arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c')]
    const m = computeAutoLayout(els)
    expect(m.size).toBe(3)
    const a = m.get('a')!, b = m.get('b')!, c = m.get('c')!
    // TB 布局:a 在最上(y 最小),c 在最下。b 居中。
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(c.y)
    // 卡片不重叠(同列时 y 差 ≥ 卡高;dagre ranksep 默认 60 保证间距)
    expect(b.y - a.y).toBeGreaterThanOrEqual(120)
  })

  it('分支 A→B, A→C → B/C 同层(y 接近),A 在上层', () => {
    const els = [card('a'), card('b'), card('c'), arrow('e1', 'a', 'b'), arrow('e2', 'a', 'c')]
    const m = computeAutoLayout(els)
    const a = m.get('a')!, b = m.get('b')!, c = m.get('c')!
    expect(a.y).toBeLessThan(b.y)
    expect(a.y).toBeLessThan(c.y)
    // B/C 同层(y 相近,差异来自 dagre 节点对齐抖动,容忍 10px)
    expect(Math.abs(b.y - c.y)).toBeLessThan(10)
    // B/C 水平分开
    expect(Math.abs(b.x - c.x)).toBeGreaterThan(100)
  })

  it('环 A→B→C→A → 不崩(dagre 断环),三卡都拿到坐标', () => {
    const els = [
      card('a'), card('b'), card('c'),
      arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c'), arrow('e3', 'c', 'a'),
    ]
    const m = computeAutoLayout(els)
    expect(m.size).toBe(3)
    expect(m.has('a')).toBe(true)
    expect(m.has('b')).toBe(true)
    expect(m.has('c')).toBe(true)
    // 坐标都是有限数
    for (const pos of m.values()) {
      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    }
  })

  it('孤立 card(无 arrow) → 不丢失,有坐标', () => {
    const els = [card('a'), card('b')] // 两卡无边
    const m = computeAutoLayout(els)
    expect(m.size).toBe(2)
    expect(m.has('a')).toBe(true)
    expect(m.has('b')).toBe(true)
  })

  it('targetIds 限定 → 只布局选中的 card,其余不返回', () => {
    const els = [
      card('a'), card('b'), card('c'),
      arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c'),
    ]
    const m = computeAutoLayout(els, { targetIds: new Set(['a', 'b']) })
    expect(m.size).toBe(2)
    expect(m.has('a')).toBe(true)
    expect(m.has('b')).toBe(true)
    expect(m.has('c')).toBe(false) // c 不在 targetIds,排除
  })

  it('targetIds 内只有 1 个 → 原位返回(单 card 不挪)', () => {
    const els = [card('a', 50, 60), card('b'), arrow('e1', 'a', 'b')]
    const m = computeAutoLayout(els, { targetIds: new Set(['a']) })
    expect(m.size).toBe(1)
    expect(m.get('a')).toEqual({ x: 50, y: 60 })
  })

  it('arrow 引用集合外的 card → 该边被忽略(不拉外部 card)', () => {
    const els = [
      card('a'), card('b'), card('outside'),
      arrow('e1', 'a', 'b'),
      arrow('e2', 'a', 'outside'), // outside 不在 targetIds
    ]
    const m = computeAutoLayout(els, { targetIds: new Set(['a', 'b']) })
    expect(m.size).toBe(2)
    expect(m.has('outside')).toBe(false)
  })

  it('freeform 元素(text/rect/frame) → 不参与,不影响 card 布局', () => {
    const els: CanvasElement[] = [
      card('a'), card('b'),
      arrow('e1', 'a', 'b'),
      { id: 't1', kind: 'text', x: 0, y: 0, w: 100, h: 30, rotation: 0 },
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 50, h: 50, rotation: 0 },
    ]
    const m = computeAutoLayout(els)
    expect(m.size).toBe(2) // 只 a/b
    expect(m.has('t1')).toBe(false)
    expect(m.has('r1')).toBe(false)
  })

  it('坐标转成左上角(dagre 给中心,函数减半宽高)', () => {
    // 单卡 w=200 h=120, dagre 把它放中心(100,60),函数应转成左上(0,0)... 但单卡走原位分支。
    // 用两卡验证:拿到的 x/y 配合 w/h 不会让卡跑出合理范围。
    const els = [card('a', 0, 0, 200, 120), card('b', 0, 0, 200, 120), arrow('e1', 'a', 'b')]
    const m = computeAutoLayout(els)
    for (const [id, pos] of m) {
      // 左上角坐标应是有限整数(函数 Math.round 过)
      expect(Number.isInteger(pos.x)).toBe(true)
      expect(Number.isInteger(pos.y)).toBe(true)
    }
  })
})
