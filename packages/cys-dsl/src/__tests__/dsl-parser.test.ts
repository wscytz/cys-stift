import { describe, it, expect } from 'vitest'
import { parseDsl, parseDslStrictWithDiagnostics, parseDslWithDiagnostics, type DslOp } from '../dsl-parser'
import { DSL_MAX_TEXT_LEN } from '../dsl-grammar'

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

  it('gracefully accepts attribute-only card lines without @pos (v5 E: keepExistingPos)', () => {
    const result = parseDsl('[card #a1] @color(red)')
    expect(result).toHaveLength(1)
    expect((result[0] as { keepExistingPos?: boolean }).keepExistingPos).toBe(true)
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

  it('parses a card with create flag', () => {
    const result = parseDsl('[card #new create] @pos(0, 0)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'card') throw new Error('expected card op')
    expect(op.cardId).toBe('new')
    expect(op.x).toBe(0)
    expect(op.y).toBe(0)
    expect(op.create).toBe(true)
  })

  it('parses a card with create flag after pos', () => {
    const result = parseDsl('[card #new] @pos(100, 200) create @size(200, 100)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'card') throw new Error('expected card op')
    expect(op.create).toBe(true)
    expect(op.w).toBe(200)
    expect(op.h).toBe(100)
  })

  it('parses a card without create flag → create undefined', () => {
    const result = parseDsl('[card #abc123] @pos(300, 400)')
    const op = result[0]!
    if (op.type !== 'card') throw new Error('expected card op')
    expect(op.create).toBeUndefined()
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

  it('parses curved arrow (@curve cx, cy)', () => {
    const result = parseDsl('[arrow #a1] from #c1 to #c2 @curve(150, -30)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.curve).toEqual({ cx: 150, cy: -30 })
  })

  it('parses curved free arrow (pos+size+curve)', () => {
    const result = parseDsl('[arrow #fa] @pos(0,0) @size(100,100) @curve(50,80)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.freeArrow).toBe(true)
    expect(op.curve).toEqual({ cx: 50, cy: 80 })
  })

  // ── @route / @elbow(箭头路由形态:弯曲/折线)──

  it('parses @route(curve) on a relation arrow', () => {
    const result = parseDsl('[arrow #a1] from #c1 to #c2 @route(curve) @curve(150, -30)')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.route).toBe('curve')
    expect(op.curve).toEqual({ cx: 150, cy: -30 })
  })

  it('parses @route(elbow) with 1 corner', () => {
    const result = parseDsl('[arrow #a1] from #c1 to #c2 @route(elbow) @elbow(100,50)')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.route).toBe('elbow')
    expect(op.elbow).toEqual([{ x: 100, y: 50 }])
  })

  it('parses @elbow with 2 corners (semicolon-separated, negatives ok)', () => {
    const result = parseDsl('[arrow #a1] from #c1 to #c2 @route(elbow) @elbow(100,50;-20,200)')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.elbow).toEqual([{ x: 100, y: 50 }, { x: -20, y: 200 }])
  })

  it('parses @route(straight) explicitly', () => {
    const result = parseDsl('[arrow #a1] from #c1 to #c2 @route(straight)')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.route).toBe('straight')
  })

  it('elbow on a free arrow (pos+size+route+elbow)', () => {
    const result = parseDsl('[arrow #fa] @pos(0,0) @size(100,100) @route(elbow) @elbow(50,0;50,100)')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.freeArrow).toBe(true)
    expect(op.route).toBe('elbow')
    expect(op.elbow).toEqual([{ x: 50, y: 0 }, { x: 50, y: 100 }])
  })

  it('arrow without @route → route undefined (backward compat: straight)', () => {
    const result = parseDsl('[arrow #a1] from #c1 to #c2')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.route).toBeUndefined()
  })

  it('free arrow without pos+size is skipped', () => {
    const result = parseDsl('[arrow #fa3] @color(red)')
    expect(result).toHaveLength(0)
  })

  // ── # 注释行被静默跳过(grammar 契约;strict/graceful 对注释一致)──

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
    const { ops, errors } = parseDslWithDiagnostics('[card #a1]')
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
      '[card #a2]', // line 2 malformed (bare card, no pos)
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

  it('[freedraw] 出 DSL → unrecognized directive(freedraw 已归程序自管,不是 DSL kind)', () => {
    // freedraw 不再是 DSL kind(程序自管 R2 + 渲染)。`[freedraw]` 行和任何未知 kind 一样
    // 落 bracketUnknown → 报 unrecognized(不静默吞,诚实告诉调用方这行不是有效 DSL)。
    const { ops, errors } = parseDslWithDiagnostics(
      '[freedraw #freedraw-abc-123] @pos(10,20)',
    )
    expect(ops).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toMatch(/unrecognized|未知/)
  })

  it('freedraw 出 DSL:freedraw 行报 unrecognized,card 行照解析', () => {
    const { ops, errors } = parseDslWithDiagnostics(
      '[freedraw #freedraw-1] @pos(5,5)\n[card #c1] @pos(10,20) @size(100,50)\n[freedraw #freedraw-2] @pos(30,30)',
    )
    expect(ops).toHaveLength(1) // 只有 card
    expect(errors).toHaveLength(2) // 两行 [freedraw] 各报一个 unrecognized
    expect(errors.every((e) => /unrecognized|未知/.test(e.message))).toBe(true)
  })

  it('parseDsl wrapper still returns plain DslOp[]', () => {
    const result = parseDsl('[card #a1] @pos(1,2)\n[rect #r1] @pos(3,4) @size(10,10)')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe('card')
    expect(result[1]!.type).toBe('free')
  })

  // ── AI 排版真实输出场景(v0.39.2 排版 bug 修复配套) ────────────────────────
  // handleAILayout 用 errors.length 区分两种失败:
  //   errors.length === 0 + ops 空 → 模型根本没输出 [ 行(纯散文/空)→ Empty 文案
  //   errors.length > 0 + ops 空   → 模型输出了类 DSL 行但格式错 → ParseFail 文案
  // 这几个测试锁住该判定的输入分类,防止回归成「一律 Empty」的静默失败。

  it('思考模式截断:只有半截 [card 行 → errors 非空(触发 ParseFail 而非 Empty)', () => {
    // 模型思考吃光 token,DSL 输出被砍到只剩半行。
    const { ops, errors } = parseDslWithDiagnostics('[card #a1] @pos(1,')
    expect(ops).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0) // 关键:非空 → 用户看到「格式错」而非「未生效」
  })

  it('markdown 围栏:围栏行被跳过,内部 DSL 正常解析', () => {
    // 模型无视「no fences」要求,用 ``` 包 DSL。围栏行非 [ 开头 → 静默跳过,
    // 内部 [ 行正常解析。这场景应「成功」而非失败。
    const dsl = '```dsl\n[card #a1] @pos(1,2)\n[rect #r1] @pos(3,4) @size(10,10)\n```'
    const { ops, errors } = parseDslWithDiagnostics(dsl)
    expect(ops).toHaveLength(2)
    expect(errors).toEqual([])
  })

  it('纯散文前言 + 解释(无任何 [ 行)→ errors 空 + ops 空(触发 Empty)', () => {
    // 模型输出了纯解释文字,没产出任何 DSL 行。这是「没输出」非「格式错」。
    const { ops, errors } = parseDslWithDiagnostics(
      '好的,我来帮你重新排版这个画布。考虑到卡片之间的逻辑关系,我建议把相关卡片聚拢。\n\n希望这个布局对你有帮助。',
    )
    expect(ops).toHaveLength(0)
    expect(errors).toHaveLength(0) // 关键:空 → Empty 文案(不是 ParseFail)
  })

  it('混合:部分合法 + 部分格式错 → ops 非空 + errors 非空(应用合法的,报错的跳过)', () => {
    const dsl = [
      '[card #a1] @pos(1,2)', // 合法
      '[card #b2]', // 格式错(裸行,缺 pos)
      '[rect #r1] @pos(3,4) @size(10,10)', // 合法
    ].join('\n')
    const { ops, errors } = parseDslWithDiagnostics(dsl)
    expect(ops).toHaveLength(2)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.line).toBe(2)
  })
})

describe('parseDslStrictWithDiagnostics', () => {
  it('rejects prose and markdown fences in AI output', () => {
    const result = parseDslStrictWithDiagnostics('Here is the layout:\n```dsl\n[card #a] @pos(1,2)\n```')
    expect(result.ops).toHaveLength(1)
    expect(result.errors).toHaveLength(3)
  })

  it('rejects unknown residual and duplicate directives', () => {
    const residual = parseDslStrictWithDiagnostics('[card #a] @pos(1,2) surprise')
    expect(residual.errors[0]?.message).toContain('residual')
    const duplicate = parseDslStrictWithDiagnostics('[card #a] @pos(1,2) @pos(3,4)')
    expect(duplicate.errors[0]?.message).toContain('duplicate pos')
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

// ── @text/@label 长度上限(STATE 缺口⑩,防 AI 超长 DoS)──────────────────────
describe('@text/@label 长度上限 (DSL_MAX_TEXT_LEN)', () => {
  it('超长 @text 静默截断到上限(不报错)', () => {
    const long = 'x'.repeat(500)
    const ops = parseDsl(`[text #t1] @pos(0,0) @text("${long}")`)
    expect(ops).toHaveLength(1)
    const op = ops[0]!
    if (op.type !== 'free' || op.shape !== 'text') throw new Error('expected free:text')
    expect(op.text).toHaveLength(DSL_MAX_TEXT_LEN)
    expect(op.text).toBe('x'.repeat(DSL_MAX_TEXT_LEN))
  })

  it('超长 @label 静默截断到上限', () => {
    const long = 'y'.repeat(500)
    const ops = parseDsl(`[arrow #a1] from #a to #b @label("${long}")`)
    expect(ops).toHaveLength(1)
    const op = ops[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.label).toHaveLength(DSL_MAX_TEXT_LEN)
  })

  it('超长 @text 不产生 diagnostic(parser robust:静默截断,不记 error)', () => {
    const long = 'x'.repeat(500)
    const { ops, errors } = parseDslWithDiagnostics(`[text #t1] @pos(0,0) @text("${long}")`)
    expect(errors).toEqual([])
    expect(ops).toHaveLength(1)
  })

  it('恰好等于上限不截断(边界)', () => {
    const exact = 'x'.repeat(DSL_MAX_TEXT_LEN)
    const ops = parseDsl(`[text #t1] @pos(0,0) @text("${exact}")`)
    const op = ops[0]!
    if (op.type !== 'free' || op.shape !== 'text') throw new Error('expected free:text')
    expect(op.text).toHaveLength(DSL_MAX_TEXT_LEN)
    expect(op.text).toBe(exact)
  })

  it('短文本不受影响', () => {
    const ops = parseDsl('[text #t1] @pos(0,0) @text("hello")')
    const op = ops[0]!
    if (op.type !== 'free' || op.shape !== 'text') throw new Error('expected free:text')
    expect(op.text).toBe('hello')
  })
})

// ── B工程:relational 坐标(right-of / below + @gap)─────────────────────────────
// 关系式 card:不要求 @pos(占位 x/y=0),rel 描述对 anchor 的相对关系,求解器填真值。
// 绝对 card(@pos)路径行为不变(回归,保 e2e round-trip byte-equal);无 @pos 且无 rel 仍报错。
describe('parseDsl — relational card (right-of / below + @gap)', () => {
  it('right-of #anchor @gap(20) → rel 带 dir/anchor/gap,x/y 占位 0', () => {
    const ops = parseDsl('[card #a] right-of #c0 @gap(20)')
    expect(ops).toHaveLength(1)
    const op = ops[0]!
    expect(op.type).toBe('card')
    expect((op as { rel?: unknown }).rel).toEqual({ dir: 'right-of', anchor: 'c0', gap: 20 })
    expect((op as { x: number }).x).toBe(0)
    expect((op as { y: number }).y).toBe(0)
  })

  it('below #anchor 无 @gap → gap 默认 20', () => {
    const ops = parseDsl('[card #a] below #c0')
    const op = ops[0]!
    expect((op as { rel?: { gap: number } }).rel?.gap).toBe(20)
    expect((op as { rel?: { dir: string } }).rel?.dir).toBe('below')
  })

  it('relational card 保留 @size / @color', () => {
    const ops = parseDsl('[card #a] right-of #c0 @gap(40) @size(200,100) @color(blue)')
    const op = ops[0]!
    expect((op as { w?: number }).w).toBe(200)
    expect((op as { h?: number }).h).toBe(100)
    expect((op as { color?: string }).color).toBe('blue')
  })

  it('relational card 可带 create flag', () => {
    const ops = parseDsl('[card #a create] right-of #c0 @gap(20)')
    const op = ops[0]!
    expect((op as { create?: boolean }).create).toBe(true)
  })

  it('anchor id 支持下划线/短横线', () => {
    const ops = parseDsl('[card #a] right-of #card_1-2 @gap(10)')
    const op = ops[0]!
    expect((op as { rel?: { anchor: string } }).rel?.anchor).toBe('card_1-2')
  })

  it('绝对 card(@pos)路径不变 —— 无 rel(回归,保 e2e round-trip byte-equal)', () => {
    const ops = parseDsl('[card #c1] @pos(100,200) @size(240,120) @color(blue)')
    const op = ops[0]!
    expect((op as { rel?: unknown }).rel).toBeUndefined()
    expect((op as { x: number }).x).toBe(100)
    expect((op as { y: number }).y).toBe(200)
  })

  it('无 @pos 且无 rel 且无可更新字段 → 仍报 missing @pos(既有契约不破)', () => {
    const { ops, errors } = parseDslWithDiagnostics('[card #a]')
    expect(ops).toHaveLength(0)
    expect(errors[0]?.message).toBe('missing @pos')
  })

  it('@gap 出现在绝对 card 上(无 rel)→ gap 忽略,正常绝对 op', () => {
    const ops = parseDsl('[card #a] @pos(0,0) @gap(20)')
    const op = ops[0]!
    expect((op as { rel?: unknown }).rel).toBeUndefined()
    expect((op as { x: number }).x).toBe(0)
  })

  it('arrow 无 #id(仅 from/to)→ 不报错,id undefined(LLM 常省略 arrow id)', () => {
    const { ops, errors } = parseDslWithDiagnostics('[arrow] from #c0 to #c1 @label("next")')
    expect(errors).toEqual([])
    expect(ops).toHaveLength(1)
    expect((ops[0] as { id?: string }).id).toBeUndefined()
    expect((ops[0] as { from: string }).from).toBe('c0')
    expect((ops[0] as { to: string }).to).toBe('c1')
  })
})

describe('parseDsl — v7 directives (@group / @href / @compute)', () => {
  it('@group("名") on card → op.group(带空格组名,quoted)', () => {
    const ops = parseDsl('[card #a] @pos(0,0) @group("Q3 规划")')
    const op = ops[0]!
    expect(op.type).toBe('card')
    if (op.type === 'card') expect(op.group).toBe('Q3 规划')
  })

  it('@group 无 @pos(给现有卡分组)→ keepExistingPos + group(不报 missing @pos)', () => {
    const { ops, errors } = parseDslWithDiagnostics('[card #a] @group("idea")')
    expect(errors).toEqual([])
    expect(ops).toHaveLength(1)
    const op = ops[0]!
    if (op.type === 'card') {
      expect(op.keepExistingPos).toBe(true)
      expect(op.group).toBe('idea')
    }
  })

  it('@group on rect/text/frame(freeDir 共享)→ 各自携带 group', () => {
    const rect = parseDsl('[rect #r] @pos(0,0) @group("g1")')[0]!
    const text = parseDsl('[text #t] @pos(0,0) @text("x") @group("g1")')[0]!
    if (rect.type === 'free') expect(rect.group).toBe('g1')
    if (text.type === 'free') expect(text.group).toBe('g1')
  })

  it('@href(#a;#b) → op.href 裸 id 列表(去 #)', () => {
    const ops = parseDsl('[card #c] @pos(0,0) @href(#a;#b)')
    const op = ops[0]!
    if (op.type === 'card') expect(op.href).toEqual(['a', 'b'])
  })

  it('@href 容错:去重 + 丢非法 + 接受可无 # 前缀', () => {
    const ops = parseDsl('[card #c] @pos(0,0) @href(#a;a;#b;bad id;#a)')
    const op = ops[0]!
    // a 去重(首留),bad id 含空格丢,顺序 a,b
    if (op.type === 'card') expect(op.href).toEqual(['a', 'b'])
  })

  it('@href 无有效目标 → href undefined', () => {
    const ops = parseDsl('[card #c] @pos(0,0) @href(;;)')
    const op = ops[0]!
    if (op.type === 'card') expect(op.href).toBeUndefined()
  })

  it('@href 超过上限截断到 DSL_MAX_HREF_TARGETS', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `#n${i}`).join(';')
    const ops = parseDsl(`[card #c] @pos(0,0) @href(${ids})`)
    const op = ops[0]!
    if (op.type === 'card') {
      expect(op.href).toHaveLength(20)
      expect(op.href![0]).toBe('n0')
      expect(op.href![19]).toBe('n19')
    }
  })

  it('@compute on text → op.compute 原文(quoted)', () => {
    const ops = parseDsl('[text #t] @pos(0,0) @compute("#a.w + #b.w")')
    const op = ops[0]!
    if (op.type === 'free' && op.shape === 'text') expect(op.compute).toBe('#a.w + #b.w')
  })

  it('@compute on rect → 忽略(仅 text 携带 compute)', () => {
    const ops = parseDsl('[rect #r] @pos(0,0) @compute("1+1")')
    const op = ops[0]!
    if (op.type === 'free' && op.shape === 'rect') {
      expect((op as { compute?: string }).compute).toBeUndefined()
    }
  })

  it('strict 模式接受 v7 directive(非 unknown residual)', () => {
    const { ops, errors } = parseDslStrictWithDiagnostics(
      '[card #a] @pos(0,0) @group("g") @href(#b)\n[text #t] @pos(0,0) @text("x") @compute("#a.w")',
    )
    expect(errors).toEqual([])
    expect(ops).toHaveLength(2)
  })
})
