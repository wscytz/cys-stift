import { describe, expect, it } from 'vitest'
import type { DslCardOp, DslOp } from '../dsl-parser'
import { parseDsl } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
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

  it('引号组锚 @\"Q3 规划\" → anchorQuoted:true,转义处理', () => {
    const ops = parseDsl('[card #n create] right-of @"Q3 规划"')
    expect(card(ops[0]).rel).toMatchObject({ dir: 'right-of', anchor: 'Q3 规划', anchorGroup: true, anchorQuoted: true })
  })

  it('CJK 裸名组锚可解析', () => {
    const ops = parseDsl('[card #n create] right-of @数据模型')
    expect(card(ops[0]).rel).toMatchObject({ dir: 'right-of', anchor: '数据模型', anchorGroup: true })
  })
})

describe('v9 组级相对锚 · sanitize 保留字防线', () => {
  it('锚位裸名撞指令词 → 诊断 + 剥 rel(不静默吞)', () => {
    const { ops, diagnostics } = sanitizeDslOps(parseDsl('[card #n create] right-of @gap(50)'))
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.message).toContain('@gap 与内建指令同名')
    const n = card(ops.find((o) => o.type === 'card' && o.cardId === 'n'))
    expect(n.rel).toBeUndefined()
  })

  it('引号形式 @\"gap\" 是显式意图,不受保留字限制', () => {
    const { ops, diagnostics } = sanitizeDslOps(parseDsl('[card #n create] right-of @"gap"'))
    expect(diagnostics).toEqual([])
    expect(card(ops[0]).rel).toMatchObject({ anchor: 'gap', anchorGroup: true, anchorQuoted: true })
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

  it('断链占位卡即使声明了同组名,也不把组 bbox 拖向原点', () => {
    const { ops: out, diagnostics } = solveRelational(
      parseDsl(
        [
          '[card #b create] right-of #nowhere @group("g")',
          '[card #m create] @pos(500,500) @size(100,80) @group("g")',
          '[card #n create] right-of @g @gap(20)',
        ].join('\n'),
      ),
    )
    // #b 断链占位 (0,0) 带 group g —— 不进 bbox;#n 锚到 m 真实位置
    expect(diagnostics.some((d) => d.message.includes('#nowhere'))).toBe(true)
    const n = card(out.find((o) => o.type === 'card' && o.cardId === 'n'))
    expect(n.x).toBe(620)
    expect(n.y).toBe(500)
  })

  it('组锚失败的占位卡同样不污染后续组 bbox', () => {
    const { ops: out } = solveRelational(
      parseDsl(
        [
          '[card #z create] right-of @ghost @gap(20) @group("g")',
          '[card #m create] @pos(500,500) @size(100,80) @group("g")',
          '[card #n create] below @g @gap(20)',
        ].join('\n'),
      ),
    )
    const n = card(out.find((o) => o.type === 'card' && o.cardId === 'n'))
    expect(n.x).toBe(500)
    expect(n.y).toBe(600)
  })

  it('更新既有组员不带 @group 时沿用组名(与 web apply 语义一致)', () => {
    const existing = new Map<string, ExistingGeom>([
      ['a', { x: 0, y: 0, w: 100, h: 80, group: 'old' }],
    ])
    const { ops: out, diagnostics } = solveRelational(
      parseDsl(['[card #a] @pos(600,600) @size(100,80)', '[card #n create] right-of @old @gap(20)'].join('\n')),
      existing,
    )
    expect(diagnostics).toEqual([])
    const n = card(out.find((o) => o.type === 'card' && o.cardId === 'n'))
    expect(n.x).toBe(720)
    expect(n.y).toBe(600)
  })

  it('中文组名 + 引号组名端到端可锚', () => {
    const { ops: out, diagnostics } = solveRelational(
      parseDsl(
        [
          '[card #m create] @pos(0,0) @size(100,80) @group("Q3 规划")',
          '[card #n1 create] right-of @"Q3 规划" @gap(30)',
          '[card #k create] @pos(0,300) @size(100,80) @group("数据模型")',
          '[card #n2 create] below @数据模型 @gap(20)',
        ].join('\n'),
      ),
    )
    expect(diagnostics).toEqual([])
    expect(card(out.find((o) => o.type === 'card' && o.cardId === 'n1')).x).toBe(130)
    expect(card(out.find((o) => o.type === 'card' && o.cardId === 'n2')).y).toBe(400)
  })
})
