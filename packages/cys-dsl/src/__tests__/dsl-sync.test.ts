import { describe, it, expect } from 'vitest'
import { DSL_KINDS, DSL_COLORS, DSL_COLOR_ALIASES } from '../dsl-grammar'
import { parseDslWithDiagnostics } from '../dsl-parser'

/** parser 对每个 DSL_KINDS 都「认识」并产 1 op(freedraw 已出 DSL,不在此;[freedraw] 现 unrecognized,见 dsl-parser 测试)。 */
describe('parser recognizes every DSL_KINDS', () => {
  const SAMPLES: Record<string, string> = {
    card: '[card #c1] @pos(10,20) @size(100,50) @color(blue)',
    rect: '[rect #r1] @pos(10,20) @size(100,50)',
    text: '[text #t1] @pos(10,20) @text("hi")',
    frame: '[frame #f1] @pos(10,20) @size(100,50) @text("t")',
    arrow: '[arrow #a1] from #x to #y',
  }
  for (const kind of DSL_KINDS) {
    it(`parser handles [${kind} …] without "unrecognized" error`, () => {
      const line = SAMPLES[kind]
      if (!line) throw new Error(`no sample for kind ${kind} — add it`)
      const { ops, errors } = parseDslWithDiagnostics(line)
      expect(errors).toEqual([]) // 全部 DSL_KINDS 都被认、产 1 op
      expect(ops.length).toBe(1)
    })
  }

  it('a kind NOT in DSL_KINDS is rejected as unrecognized', () => {
    const { errors } = parseDslWithDiagnostics('[ellipse #x] @pos(0,0)')
    expect(errors[0]?.message).toBe('unrecognized element kind')
  })
})

/** parser 接受的颜色集合 == DSL_COLORS ∪ DSL_COLOR_ALIASES 键(锁住颜色漂移)。 */
describe('parser color acceptance == DSL_COLORS ∪ aliases', () => {
  const accepted = [...DSL_COLORS, ...Object.keys(DSL_COLOR_ALIASES)]
  for (const c of accepted) {
    it(`accepts @color(${c})`, () => {
      const { ops, errors } = parseDslWithDiagnostics(`[card #x] @pos(0,0) @size(1,1) @color(${c})`)
      expect(errors).toEqual([])
      expect(ops[0]).toBeDefined()
      // color 在 DslOp 每个变体上都是 optional string,TS 联合类型直接可访问
      expect(ops[0]!.color).toBe(c)
    })
  }
  it('rejects a non-listed color (green → color undefined, not matched)', () => {
    const { ops, errors } = parseDslWithDiagnostics(`[card #x] @pos(0,0) @size(1,1) @color(green)`)
    expect(errors).toEqual([])
    expect(ops[0]).toBeDefined()
    expect(ops[0]!.color).toBeUndefined()
  })
})

/** parser 识别 @wikilink 标记(锁住 wikilink arrow 的显式 DSL 属性)。 */
describe('parser recognizes @wikilink on arrows', () => {
  it('sets op.wikilink === true when @wikilink is present on a relation arrow', () => {
    const { ops, errors } = parseDslWithDiagnostics(
      '[arrow #a1] from #x to #y @wikilink',
    )
    expect(errors).toEqual([])
    expect(ops[0]).toBeDefined()
    expect(ops[0]!.type).toBe('arrow')
    expect((ops[0] as { wikilink?: boolean }).wikilink).toBe(true)
  })

  it('sets op.wikilink === undefined when @wikilink is absent', () => {
    const { ops, errors } = parseDslWithDiagnostics(
      '[arrow #a1] from #x to #y',
    )
    expect(errors).toEqual([])
    expect(ops[0]).toBeDefined()
    expect(ops[0]!.type).toBe('arrow')
    expect((ops[0] as { wikilink?: boolean }).wikilink).toBeUndefined()
  })

  it('sets op.wikilink === true on free arrows too (parser fills uniformly)', () => {
    const { ops, errors } = parseDslWithDiagnostics(
      '[arrow #fa1] @pos(0,0) @size(10,20) @wikilink',
    )
    expect(errors).toEqual([])
    expect(ops[0]).toBeDefined()
    expect(ops[0]!.type).toBe('arrow')
    expect((ops[0] as { wikilink?: boolean }).wikilink).toBe(true)
  })

  it('does not treat @wikilinkXYZ as the marker (word boundary required)', () => {
    const { ops } = parseDslWithDiagnostics(
      '[arrow #a1] from #x to #y @wikilinkXYZ',
    )
    expect(ops[0]).toBeDefined()
    expect((ops[0] as { wikilink?: boolean }).wikilink).toBeUndefined()
  })
})
