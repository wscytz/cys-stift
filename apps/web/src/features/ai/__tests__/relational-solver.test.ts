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
})
