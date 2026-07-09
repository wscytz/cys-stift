import { describe, expect, it } from 'vitest'
import type { DslOp } from '../dsl-parser'
import { parseDsl } from '../dsl-parser'
import { solveRelational } from '../relational-solver'

/**
 * B工程:relational solver 测试。
 *
 * 契约:
 * - 单遍顺序求解:rel op anchor 到同批更早 op 或 existingGeometry(已处理元素的绝对几何已知)
 * - right-of #X:x = X.x + X.w + gap;y = X.y
 * - below    #X:y = X.y + X.h + gap;x = X.x
 * - anchor 不存在 → diagnostic(op 保留占位坐标,apply 自己处理)
 * - 默认 card 尺寸 240×120(op.w/h undefined + 非 existing 时);existing card 用其真实 w/h
 * - 纯函数,永不抛错;非 card op + 绝对 card op 引用稳定(原样返回)
 */
describe('solveRelational — relational → 绝对坐标', () => {
  it('right-of 单链:c1.x = c0.x + c0.w + gap,c1.y = c0.y', () => {
    const ops = parseDsl(
      '[card #c0 create] @pos(100,100) @size(240,120)\n[card #c1 create] right-of #c0 @gap(20) @size(240,120)',
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toEqual([])
    expect(out[1]).toMatchObject({ cardId: 'c1', x: 360, y: 100 })
    expect((out[1] as { rel?: unknown }).rel).toBeUndefined()
  })

  it('below 单链:c1.y = c0.y + c0.h + gap,c1.x = c0.x', () => {
    const ops = parseDsl('[card #c0 create] @pos(100,100) @size(240,120)\n[card #c1 create] below #c0 @gap(20)')
    const { ops: out } = solveRelational(ops)
    // c1 无 @size → 默认 240×120;c0.h=120 → c1.y=100+120+20=240
    expect(out[1]).toMatchObject({ cardId: 'c1', x: 100, y: 240 })
  })

  it('多跳链:c2 right-of c1 right-of c0(顺序求解,逐个算)', () => {
    const ops = parseDsl(
      '[card #c0 create] @pos(100,100) @size(240,120)\n' +
        '[card #c1 create] right-of #c0 @gap(20) @size(240,120)\n' +
        '[card #c2 create] right-of #c1 @gap(20) @size(240,120)',
    )
    const { ops: out } = solveRelational(ops)
    // c1.x=360;c2.x=360+240+20=620
    expect(out[1]).toMatchObject({ x: 360 })
    expect(out[2]).toMatchObject({ x: 620, y: 100 })
  })

  it('默认 gap 20(@gap 缺省)', () => {
    const ops = parseDsl('[card #c0 create] @pos(0,0) @size(100,100)\n[card #c1 create] right-of #c0 @size(100,100)')
    const { ops: out } = solveRelational(ops)
    expect(out[1]).toMatchObject({ x: 120 }) // 0+100+20
  })

  it('默认 card 尺寸 240×120(op.w/h undefined + 非 existing)', () => {
    const ops = parseDsl('[card #c0 create] @pos(0,0)\n[card #c1 create] below #c0')
    const { ops: out } = solveRelational(ops)
    // c0 无 size → 默认 h=120;c1.y=0+120+20=140
    expect(out[1]).toMatchObject({ y: 140 })
  })

  it('anchor 不存在 → diagnostic + op 保留(占位坐标)', () => {
    const ops = parseDsl('[card #c1 create] right-of #ghost @gap(20) @size(100,100)')
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.message).toMatch(/ghost/)
    expect(diagnostics[0]!.opIndex).toBe(0)
    // op 保留(占位 0,0),apply 自己处理
    expect(out[0]).toMatchObject({ cardId: 'c1' })
    expect((out[0] as { rel?: unknown }).rel).toBeUndefined()
  })

  it('existingGeometry 提供 anchor(画布已有 card)', () => {
    const ops = parseDsl('[card #c1 create] right-of #ex @gap(20) @size(100,100)')
    const existing = new Map([['ex', { x: 50, y: 50, w: 200, h: 100 }]])
    const { ops: out, diagnostics } = solveRelational(ops, existing)
    expect(diagnostics).toEqual([])
    expect(out[0]).toMatchObject({ x: 270, y: 50 }) // 50+200+20
  })

  it('绝对 card 重定位时用 existing card 真实 w/h(作后续 anchor)', () => {
    // c0 existing 真实 300×200;op 把 c0 移到 (10,10) 不带 size → 几何记 300×200
    const ops = parseDsl('[card #c0] @pos(10,10)\n[card #c1 create] right-of #c0 @gap(20) @size(100,100)')
    const existing = new Map([['c0', { x: 0, y: 0, w: 300, h: 200 }]])
    const { ops: out } = solveRelational(ops, existing)
    // c1.x = 10 + 300(existing w,不是默认 240) + 20 = 330
    expect(out[1]).toMatchObject({ x: 330, y: 10 })
  })

  it('绝对 card op 引用稳定(原样返回,=== 同对象)', () => {
    const ops = parseDsl('[card #c0 create] @pos(100,100) @size(240,120)')
    const { ops: out } = solveRelational(ops)
    expect(out[0]).toBe(ops[0])
  })

  it('free / arrow op 原样透传', () => {
    const ops: DslOp[] = [
      { type: 'free', shape: 'rect', id: 'r1', x: 5, y: 5, w: 10, h: 10 },
      { type: 'arrow', from: 'a', to: 'b' },
    ]
    const { ops: out } = solveRelational(ops)
    expect(out[0]).toBe(ops[0])
    expect(out[1]).toBe(ops[1])
  })

  it('空 ops → 空 ops + 空 diagnostics', () => {
    const { ops, diagnostics } = solveRelational([])
    expect(ops).toEqual([])
    expect(diagnostics).toEqual([])
  })

  it('混用绝对 + rel + free:顺序保,各按类处理', () => {
    const ops = parseDsl(
      '[card #c0 create] @pos(100,100) @size(240,120)\n' +
        '[rect #r1] @pos(0,0) @size(50,50)\n' +
        '[card #c1 create] below #c0 @gap(20) @size(240,120)\n' +
        '[card #c2 create] right-of #c1 @gap(20) @size(240,120)',
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toEqual([])
    expect(out[0]).toBe(ops[0]) // 绝对 card 原样
    expect(out[1]).toBe(ops[1]) // rect 原样
    expect(out[2]).toMatchObject({ cardId: 'c1', x: 100, y: 240 }) // below c0
    expect(out[3]).toMatchObject({ cardId: 'c2', x: 360, y: 240 }) // right-of c1 (c1.x=100+240? no: c1.x=100, c1.w=240 → 100+240+20=360)
  })

  // ── 碰撞避让(axis-aligned flow avoidance)───────────────────────────────────
  // 真实实验发现:competent 模型 tree-org B 臂 ~0.13 overlap 全来自参照系碰撞 ——
  // c4[right-of c3] 与 c5[below c2] 两条 1D 链算到同坐标 (720,410)。solver 应沿关系轴避让。
  it('tree-org 参照系碰撞:c4(right-of c3)与 c5(below c2)同位 → 避让后无任何两卡相交', () => {
    const ops = parseDsl(
      '[card #c0 create] @pos(400,50) @size(240,120)\n' +
        '[card #c1 create] below #c0 @gap(60)\n' +
        '[card #c2 create] right-of #c1 @gap(80)\n' +
        '[card #c3 create] below #c1 @gap(60)\n' +
        '[card #c4 create] right-of #c3 @gap(80)\n' +
        '[card #c5 create] below #c2 @gap(60)\n' +
        '[card #c6 create] right-of #c5 @gap(80)',
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toEqual([])
    const cards = out
      .filter((o): o is Extract<DslOp, { type: 'card' }> => o.type === 'card')
      .map((o) => ({ id: String(o.cardId), x: o.x, y: o.y, w: o.w ?? 240, h: o.h ?? 120 }))
    const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    // 主验收:解算后无任何两卡 bbox 相交
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(overlap(cards[i]!, cards[j]!)).toBe(false)
      }
    }
    // c6 跟随 c5(right-of 语义:同 y、x 更大)c5 被避让后 c6 用其最终几何派生
    const c5 = cards.find((c) => c.id === 'c5')!
    const c6 = cards.find((c) => c.id === 'c6')!
    expect(c6.y).toBe(c5.y)
    expect(c6.x).toBeGreaterThan(c5.x)
  })

  it('right-of 参照系碰撞:c4(right-of c2)与 c3(below c1)同位 → 沿 x 向右推、y 不变', () => {
    // 水平镜像版:两个 100×100 + gap20;c3[below c1] 与 c4[right-of c2] 算到同 (120,120)
    const ops = parseDsl(
      '[card #c0 create] @pos(0,0) @size(100,100)\n' +
        '[card #c1 create] right-of #c0 @gap(20) @size(100,100)\n' +
        '[card #c2 create] below #c0 @gap(20) @size(100,100)\n' +
        '[card #c3 create] below #c1 @gap(20) @size(100,100)\n' +
        '[card #c4 create] right-of #c2 @gap(20) @size(100,100)\n' +
        '[card #c5 create] below #c4 @gap(20) @size(100,100)',
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toEqual([])
    const byId = (id: string) => {
      const o = out.find((o): o is Extract<DslOp, { type: 'card' }> => o.type === 'card' && String(o.cardId) === id)!
      return { x: o.x, y: o.y, w: o.w ?? 240, h: o.h ?? 120 }
    }
    const c4 = byId('c4')
    // c4 原 (120,120) 撞 c3 → 沿 x 推过 c3(c3.x+w+gap=120+100+20=240),y 守行不变(=c2.y=120)
    expect(c4.x).toBe(240)
    expect(c4.y).toBe(120)
    // c5 below c4 → 用 c4 最终几何,c5.y = c4.y+c4.h+gap
    expect(byId('c5').y).toBe(c4.y + c4.h + 20)
  })

  it('与 existingGeometry 绝对障碍避让:rel card 被推过画布已有 card', () => {
    // c0 @ (0,0);c1 right-of c0 算得 (120,0),但画布已有障碍 obs 在 (120,0) 100×100 → 推到 (240,0)
    const ops = parseDsl('[card #c0 create] @pos(0,0) @size(100,100)\n[card #c1 create] right-of #c0 @gap(20) @size(100,100)')
    const existing = new Map([['obs', { x: 120, y: 0, w: 100, h: 100 }]])
    const { ops: out, diagnostics } = solveRelational(ops, existing)
    expect(diagnostics).toEqual([])
    expect(out[1]).toMatchObject({ cardId: 'c1', x: 240, y: 0 }) // 推过障碍(obs.x+w+gap=120+100+20)
  })

  it('负 @gap 不破坏避让:clearance 钳 0,贴合不重叠、不残留', () => {
    // c0 @ (0,0) 240×120;c1 right-of c0 @gap(-100) → 原算 ax = 0+240-100 = 140(撞 c0 自身)。
    // 负 gap 让推进推不过障碍;钳 0 后 c1 被推到 c0 右沿 240(贴合,严格 >0 不算重叠)。
    const ops = parseDsl(
      '[card #c0 create] @pos(0,0) @size(240,120)\n[card #c1 create] right-of #c0 @gap(-100) @size(240,120)',
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toEqual([])
    const cards = out
      .filter((o): o is Extract<DslOp, { type: 'card' }> => o.type === 'card')
      .map((o) => ({ id: String(o.cardId), x: o.x, y: o.y, w: o.w ?? 240, h: o.h ?? 120 }))
    const c0 = cards.find((c) => c.id === 'c0')!
    const c1 = cards.find((c) => c.id === 'c1')!
    const overlap =
      c0.x < c1.x + c1.w && c0.x + c0.w > c1.x && c0.y < c1.y + c1.h && c0.y + c0.h > c1.y
    expect(overlap).toBe(false)
    expect(c1.x).toBeGreaterThanOrEqual(c0.x + c0.w) // 清空(c0 右沿及之后)
  })
})
