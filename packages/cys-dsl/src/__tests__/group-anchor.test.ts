import { describe, expect, it } from 'vitest'
import type { DslCardOp, DslOp } from '../dsl-parser'
import { parseDsl } from '../dsl-parser'
import { solveRelational, type ExistingGeom } from '../dsl-relational-solver'

/** v9 组级相对锚:right-of/below @组名 = 以该组已解成员包围盒为锚。 */

const card = (op: DslOp | undefined): DslCardOp => op as DslCardOp

describe('v9 组级相对锚 · parse', () => {
  it('@组名 解出 anchorGroup:true,gap 照常合并', () => {
    const ops = parseDsl('[card #n create] right-of @grp @gap(30)')
    expect(card(ops[0]).rel).toEqual({ dir: 'right-of', anchor: 'grp', gap: 30, anchorGroup: true })
  })

  it('#id 卡锚不受影响(回归)', () => {
    const ops = parseDsl('[card #n create] right-of #c0')
    expect(card(ops[0]).rel).toEqual({ dir: 'right-of', anchor: 'c0', gap: 20 })
  })
})

describe('v9 组级相对锚 · solve', () => {
  it('right-of @g = 贴包围盒右缘,y 对齐 bbox.minY', () => {
    const ops = parseDsl(
      [
        '[card #a1 create] @pos(0,0) @size(100,80) @group("axes")',
        '[card #a2 create] @pos(200,50) @size(100,80) @group("axes")',
        '[card #n create] right-of @axes @gap(20)',
      ].join('\n'),
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toEqual([])
    // bbox = (0,0)-(300,130) → x = 300+20, y = minY = 0
    const n = out.find((o) => o.type === 'card' && o.cardId === 'n')!
    expect(n.x).toBe(320)
    expect(n.y).toBe(0)
  })

  it('below @g = 贴包围盒下缘,x 对齐 bbox.minX', () => {
    const ops = parseDsl(
      [
        '[card #a1 create] @pos(0,0) @size(100,80) @group("axes")',
        '[card #a2 create] @pos(200,50) @size(100,80) @group("axes")',
        '[card #n create] below @axes @gap(20)',
      ].join('\n'),
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toEqual([])
    const n = out.find((o) => o.type === 'card' && o.cardId === 'n')!
    expect(n.x).toBe(0)
    expect(n.y).toBe(150)
  })

  it('rel 落点的组员计入后续组 bbox(顺序敏感,先组员后组锚)', () => {
    const ops = parseDsl(
      [
        '[card #m1 create] @pos(0,0) @size(100,80) @group("g")',
        '[card #m2 create] right-of #m1 @group("g")',
        '[card #n create] right-of @g @gap(20)',
      ].join('\n'),
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toEqual([])
    // m2 落 (120,0) 默认 240×120 → bbox maxX = 360 → n.x = 380
    const n = out.find((o) => o.type === 'card' && o.cardId === 'n')!
    expect(n.x).toBe(380)
    expect(n.y).toBe(0)
  })

  it('画布既有分组的组员也可锚(existingGeometry 带 group)', () => {
    const existing = new Map<string, ExistingGeom>([
      ['e1', { x: 50, y: 40, w: 100, h: 80, group: 'old' }],
      ['e2', { x: 250, y: 90, w: 100, h: 80, group: 'old' }],
    ])
    const ops = parseDsl('[card #n create] below @old @gap(30)')
    const { ops: out, diagnostics } = solveRelational(ops, existing)
    expect(diagnostics).toEqual([])
    // bbox = (50,40)-(350,170) → y = 170+30, x = minX = 50
    const n = out.find((o) => o.type === 'card' && o.cardId === 'n')!
    expect(n.x).toBe(50)
    expect(n.y).toBe(200)
  })

  it('组无已解成员 → 诊断(提示顺序敏感),rel 剥离留占位', () => {
    const ops = parseDsl(
      [
        '[card #n create] right-of @ghost @gap(20)',
        '[card #g1 create] @pos(0,0) @group("ghost")',
      ].join('\n'),
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.message).toContain('@ghost')
    expect(diagnostics[0]!.message).toContain('顺序')
    const n = card(out.find((o) => o.type === 'card' && o.cardId === 'n'))
    expect(n.rel).toBeUndefined()
    expect(n.x).toBe(0) // 占位坐标
  })

  it('组名与断链卡 id 同名时,组锚不误入 broken 链', () => {
    const ops = parseDsl(
      [
        '[card #g create] right-of #nowhere',
        // m1 挪到 y=500,组锚目标区不撞 #g 的断链占位卡(0,0,240,120)
        '[card #m1 create] @pos(0,500) @size(100,80) @group("g")',
        '[card #n create] right-of @g @gap(20)',
      ].join('\n'),
    )
    const { ops: out, diagnostics } = solveRelational(ops)
    // 仅 #g 一条断链诊断;#n 走组锚,正常落位
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.message).toContain('#nowhere')
    const n = card(out.find((o) => o.type === 'card' && o.cardId === 'n'))
    expect(n.x).toBe(120)
    expect(n.y).toBe(500)
  })
})
