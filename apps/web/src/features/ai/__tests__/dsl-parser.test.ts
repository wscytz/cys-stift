import { describe, it, expect } from 'vitest'
import { parseDsl, parseDslWithDiagnostics, type DslOp } from '../dsl-parser'

describe('parseDsl', () => {
  it('parses a card positioning directive', () => {
    const result = parseDsl('[card #abc123] @pos(300, 400) @color(red)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('card')
    if (op.type === 'card') {
      expect(op.cardId).toBe('abc123')
      expect(op.x).toBe(300)
      expect(op.y).toBe(400)
      expect(op.color).toBe('red')
    }
  })

  it('parses negative @pos coords (elements dragged above/left of origin)', () => {
    // Canvas pan lets coords go negative; serialize outputs @pos(-54,150) and
    // the parser MUST round-trip it (regression: POS_RE was \d+ only → "missing @pos").
    const result = parseDsl('[card #abc123] @pos(-54, -150) @size(202, 144)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('card')
    if (op.type === 'card') {
      expect(op.x).toBe(-54)
      expect(op.y).toBe(-150)
    }
  })

  it('parses a card without color', () => {
    const result = parseDsl('[card #xyz] @pos(100, 200)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('card')
    if (op.type === 'card') {
      expect(op.x).toBe(100)
      expect(op.y).toBe(200)
      expect(op.color).toBeUndefined()
    }
  })

  it('parses an arrow directive with label', () => {
    const result = parseDsl(
      '[arrow #arr1] from #a to #b @label("references") @color(blue)',
    )
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('arrow')
    if (op.type === 'arrow') {
      expect(op.from).toBe('a')
      expect(op.to).toBe('b')
      expect(op.label).toBe('references')
      expect(op.color).toBe('blue')
    }
  })

  it('parses a rect shape via the unified grammar', () => {
    const result = parseDsl('[rect #r1] @pos(100, 200) @size(300, 400) @color(red)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('free')
    if (op.type === 'free') {
      expect(op.shape).toBe('rect')
      expect(op.x).toBe(100)
      expect(op.y).toBe(200)
      expect(op.w).toBe(300)
      expect(op.h).toBe(400)
      expect(op.color).toBe('red')
    }
  })

  it('parses multiple directives from one block', () => {
    const dsl = `[card #a1] @pos(100, 200) @color(blue)
[card #a2] @pos(300, 400) @color(red)
[arrow #arr1] from #a1 to #a2 @label("blocks")
[rect #r1] @pos(100, 200) @size(300, 400)`
    const result = parseDsl(dsl)
    expect(result).toHaveLength(4)
    expect(result[0]?.type).toBe('card')
    expect(result[1]?.type).toBe('card')
    expect(result[2]?.type).toBe('arrow')
    expect(result[3]?.type).toBe('free')
  })

  it('gracefully skips unrecognized lines', () => {
    const result = parseDsl('some random text\n[card #a1] @pos(1, 2)\ngarbage')
    expect(result).toHaveLength(1)
    expect(result[0]?.type).toBe('card')
  })

  it('gracefully skips card lines without position', () => {
    const result = parseDsl('[card #a1] @color(red)')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty input', () => {
    expect(parseDsl('')).toEqual([])
  })

  it('legacy [free: syntax is no longer parsed', () => {
    expect(parseDsl('[free: rect at (100,200) size 300x400]')).toEqual([])
    expect(parseDsl('[free shape: rect at (10, 20) size 100x200]')).toEqual([])
    expect(parseDsl('[free: note at (50, 60)]')).toEqual([])
  })

  // ── arrow relation signature (dash + arrowhead + id) — DSL symmetry fix 1 ──

  it('parses an arrow with id + dash + arrowhead + label + color + endpoints', () => {
    const result = parseDsl(
      '[arrow #arr1] from #a to #b @label("references") @color(blue) @dash(dashed) @arrowhead(triangle)',
    )
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.id).toBe('arr1')
    expect(op.from).toBe('a')
    expect(op.to).toBe('b')
    expect(op.label).toBe('references')
    expect(op.color).toBe('blue')
    expect(op.dash).toBe('dashed')
    expect(op.arrowhead).toBe('triangle')
  })

  it('parses an arrow with dotted dash + none arrowhead', () => {
    const result = parseDsl('[arrow #arr2] from #a to #b @dash(dotted) @arrowhead(none)')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.dash).toBe('dotted')
    expect(op.arrowhead).toBe('none')
  })

  it('parses an arrow without dash/arrowhead (backward compat: both undefined)', () => {
    const result = parseDsl('[arrow #arr3] from #a to #b')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.dash).toBeUndefined()
    expect(op.arrowhead).toBeUndefined()
  })

  // ── card size — DSL symmetry fix 2 ──

  it('parses a card with @size(w,h)', () => {
    const result = parseDsl('[card #abc123] @pos(300, 400) @size(240, 120) @color(blue)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'card') throw new Error('expected card op')
    expect(op.w).toBe(240)
    expect(op.h).toBe(120)
  })

  it('parses a card without @size (w/h undefined)', () => {
    const result = parseDsl('[card #abc123] @pos(300, 400)')
    const op = result[0]!
    if (op.type !== 'card') throw new Error('expected card op')
    expect(op.w).toBeUndefined()
    expect(op.h).toBeUndefined()
  })

  // ── text color — DSL symmetry fix 3 ──

  it('parses a text line with @color', () => {
    const result = parseDsl('[text #t1] @pos(5,6) @text("hello") @color(red)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'free' || op.shape !== 'text') throw new Error('expected free:text op')
    expect(op.color).toBe('red')
    expect(op.text).toBe('hello')
  })

  // ── free arrow (no from/to) — DSL symmetry Step 3 ──

  it('parses a free arrow (no from/to, pos+size)', () => {
    const result = parseDsl(
      '[arrow #fa1] @pos(10,20) @size(100,50) @color(red) @dash(solid) @arrowhead(arrow)',
    )
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.freeArrow).toBe(true)
    expect(op.id).toBe('fa1')
    expect(op.x).toBe(10)
    expect(op.y).toBe(20)
    expect(op.w).toBe(100)
    expect(op.h).toBe(50)
    expect(op.color).toBe('red')
    expect(op.dash).toBe('solid')
    expect(op.arrowhead).toBe('arrow')
    expect(op.from).toBe('')
    expect(op.to).toBe('')
  })

  it('parses free arrow with negative size', () => {
    const result = parseDsl('[arrow #fa2] @pos(100,50) @size(-80,30)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.w).toBe(-80)
    expect(op.h).toBe(30)
    expect(op.freeArrow).toBe(true)
  })

  it('parses relation arrow unchanged', () => {
    const result = parseDsl('[arrow #a1] from #c1 to #c2 @label("ref")')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.from).toBe('c1')
    expect(op.to).toBe('c2')
    expect(op.freeArrow).toBeUndefined()
    expect(op.label).toBe('ref')
  })

  it('free arrow without pos+size is skipped', () => {
    const result = parseDsl('[arrow #fa3] @color(red)')
    expect(result).toHaveLength(0)
  })

  // ── # 注释行被静默跳过(serializeCanvasReadable 的 title 注释)──

  it('parseDsl 跳过 # 注释行', () => {
    const result = parseDsl(
      '[card #c1] @pos(0,0) @size(10,10)\n  # title: hello\n[rect #r1] @pos(5,5) @size(20,20)',
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.type).toBe('card')
    expect(result[1]?.type).toBe('free')
  })
})

describe('parseDslWithDiagnostics', () => {
  it('returns no errors for a valid block', () => {
    const { ops, errors } = parseDslWithDiagnostics(
      '[card #a1] @pos(1,2)\n[rect #r1] @pos(3,4) @size(10,10)',
    )
    expect(errors).toEqual([])
    expect(ops).toHaveLength(2)
  })

  it('reports a card line missing @pos', () => {
    const { ops, errors } = parseDslWithDiagnostics('[card #a1] @color(red)')
    expect(ops).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toMatch(/pos/i)
    expect(errors[0]!.line).toBe(1)
    expect(errors[0]!.text).toContain('[card #a1]')
  })

  it('reports a card line missing #id', () => {
    const { errors } = parseDslWithDiagnostics('[card @pos(1,2)')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toMatch(/id/i)
  })

  it('reports an unrecognized element kind', () => {
    const { errors } = parseDslWithDiagnostics('[foo #x] @pos(1,2)')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message.toLowerCase()).toContain('unrecognized')
  })

  it('reports correct line numbers in a mixed block', () => {
    const dsl = [
      '[card #a1] @pos(1,2)', // line 1 valid
      '[card #a2] @color(red)', // line 2 malformed (no pos)
      '[arrow #arr1] from #a1 to #a2', // line 3 valid
      '[bad #x] @pos(1,2)', // line 4 unrecognized
    ].join('\n')
    const { ops, errors } = parseDslWithDiagnostics(dsl)
    expect(ops).toHaveLength(2)
    expect(errors).toHaveLength(2)
    expect(errors.map((e) => e.line)).toEqual([2, 4])
  })

  it('does not report comments, blank lines, or free-form prose', () => {
    const { errors } = parseDslWithDiagnostics(
      '# a comment line\n\nsome free-form prose\n[card #a1] @pos(1,2)',
    )
    expect(errors).toEqual([])
  })

  it('parseDsl wrapper still returns plain DslOp[]', () => {
    const result = parseDsl('[card #a1] @pos(1,2)\n[rect #r1] @pos(3,4) @size(10,10)')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe('card')
    expect(result[1]!.type).toBe('free')
  })
})

// ── COLOR_RE Bauhaus 6 色收窄(审计 H3)─────────────────────────────────────
describe('COLOR_RE Bauhaus 6 色', () => {
  it('接受 6 个 Bauhaus 原色', () => {
    for (const c of ['red', 'yellow', 'blue', 'black', 'white', 'gray']) {
      const ops = parseDsl(`[rect #r1] @pos(0,0) @size(10,10) @color(${c})`)
      expect(ops, `color ${c} 应被接受`).toHaveLength(1)
      if (ops[0] && ops[0].type === 'free') {
        expect(ops[0].color).toBe(c)
      }
    }
  })

  it('接受 grey(gray 的别名,引擎 colorOf 映射到 --color-gray)', () => {
    const ops = parseDsl('[rect #r1] @pos(0,0) @size(10,10) @color(grey)')
    expect(ops).toHaveLength(1)
    if (ops[0] && ops[0].type === 'free') expect(ops[0].color).toBe('grey')
  })

  it('拒绝 green(非 Bauhaus 色)——color 字段 undefined,渲染回退默认而非静默变黑', () => {
    const ops = parseDsl('[rect #r1] @pos(0,0) @size(10,10) @color(green)')
    expect(ops).toHaveLength(1) // 行本身仍被解析(pos/size 有效)
    if (ops[0] && ops[0].type === 'free') {
      expect(ops[0].color).toBeUndefined() // color 指令被忽略
    }
  })

  it('拒绝 teal/pink/orange/purple(非 Bauhaus 色)', () => {
    for (const c of ['teal', 'pink', 'orange', 'purple']) {
      const ops = parseDsl(`[rect #r1] @pos(0,0) @size(10,10) @color(${c})`)
      expect(ops, `color ${c} 应被忽略`).toHaveLength(1)
      if (ops[0] && ops[0].type === 'free') {
        expect(ops[0].color).toBeUndefined()
      }
    }
  })
})
