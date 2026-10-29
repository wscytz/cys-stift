import { describe, it, expect } from 'vitest'
import {
  DSL_VERSION,
  DSL_KINDS,
  DSL_COLORS,
  DSL_COLOR_ALIASES,
  DSL_GRAMMAR_REFERENCE,
  truncateDslText,
} from '../dsl-grammar'
import { parseDslWithDiagnostics, AT_DIRECTIVES } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
import { solveRelational } from '../dsl-relational-solver'
import { toSvg } from '../to-svg'

describe('dsl-grammar', () => {
  it('DSL_VERSION is a positive integer (grammar version, independent of app version)', () => {
    expect(Number.isInteger(DSL_VERSION)).toBe(true)
    expect(DSL_VERSION).toBeGreaterThan(0)
  })

  it('DSL_KINDS is the 5 canonical directive kinds (freedraw 出 DSL,程序自管)', () => {
    expect([...DSL_KINDS]).toEqual(['card', 'rect', 'frame', 'text', 'arrow'])
  })

  it('DSL_COLORS is the 6 Bauhaus tokens', () => {
    expect([...DSL_COLORS]).toEqual(['red', 'yellow', 'blue', 'black', 'white', 'gray'])
  })

  it('DSL_COLOR_ALIASES maps grey → gray', () => {
    expect(DSL_COLOR_ALIASES.grey).toBe('gray')
  })

  it('DSL_GRAMMAR_REFERENCE embeds the version line', () => {
    expect(DSL_GRAMMAR_REFERENCE).toContain(`cys-dsl grammar v${DSL_VERSION}`)
  })

  it('DSL_GRAMMAR_REFERENCE mentions every DSL kind (all 5 are AI-producible)', () => {
    for (const kind of DSL_KINDS) {
      expect(DSL_GRAMMAR_REFERENCE).toContain(`[${kind} #id]`)
    }
  })

  it('DSL_GRAMMAR_REFERENCE lists all canonical colors + the grey alias', () => {
    for (const c of DSL_COLORS) expect(DSL_GRAMMAR_REFERENCE).toContain(c)
    expect(DSL_GRAMMAR_REFERENCE).toContain('grey')
  })

  it('DSL_GRAMMAR_REFERENCE does NOT advertise freedraw (AI should not emit hand-draw)', () => {
    expect(DSL_GRAMMAR_REFERENCE).not.toContain('[freedraw')
  })
})

describe('truncateDslText (代理对安全截断;parser/sanitize 单一实现 — G/H)', () => {
  it('不超长 → 原样返回', () => {
    expect(truncateDslText('hello', 10)).toBe('hello')
    expect(truncateDslText('', 10)).toBe('')
  })

  it('超长 → 截到 max', () => {
    expect(truncateDslText('abcdef', 3)).toBe('abc')
  })

  it('切点落在 emoji 代理对中间 → 回退一位,不产孤立高代理位', () => {
    const max = 10
    const s = 'a'.repeat(max - 1) + '😀' // 9 个 a + 2 码元 emoji = 11 码元
    const out = truncateDslText(s, max)
    expect(out).toBe('a'.repeat(max - 1)) // 丢整个 emoji,而非切出半个
    const last = out.charCodeAt(out.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false) // 末位非孤立高代理
  })

  it('emoji 完整落在 max 内 → 保留不丢', () => {
    expect(truncateDslText('ab😀cd', 4)).toBe('ab😀')
  })

  it('max=0 → 空串(不越界)', () => {
    expect(truncateDslText('abc', 0)).toBe('')
  })
})

/**
 * 参考文档全要素对账(2026-10-29「语法你多注意」路线):DSL_GRAMMAR_REFERENCE 是
 * AI prompt 与用户帮助的语法真值——文档承诺的每个特性都必须真的能写、能全管线通过。
 * 文档行是模板占位(@pos(x, y)),不能照抄解析;这里按文档逐条写**具体实例**。
 * grammar 改名/删指令而文档没跟上 → 这里先炸。
 */
describe('DSL_GRAMMAR_REFERENCE 全要素对账(文档承诺=语言事实)', () => {
  /** 文档中出现的全部特性,逐条具体实例(注释=文档出处行为) */
  const CONFORMANCE_DOC = [
    // L1-2:card 全指令 + create
    '[card #a] @pos(0,0) @size(120,80) @color(red) @title("A") @content("正文") @group("规划") @href(#b;#c) @type(note) @tags(x;y) @links(https%3A%2F%2Fex.com) @code(js,"let x=1","cap") @code(py,"print(1)") @quote("少即是多","Mies") @quote("More is different","Andrea")',
    '[card #b create] @pos(200,0) @size(120,80) @color(gray) @title("B")',
    // relational placement + @gap
    '[card #c create] right-of #b @gap(20) @size(120,80) @title("C")',
    '[card #d create] below #b @gap(20) @size(120,80) @title("D")',
    // v9 组锚三形态:@简单名 / @"带空格" / 成员 #id
    '[card #e create] right-of @规划 @gap(30) @size(120,80) @title("E")',
    '[card #f create] below @"规划" @gap(30) @size(120,80) @title("F")',
    '[card #g create] right-of #c @gap(30) @size(120,80) @title("G")',
    // rect / text(+@compute)/ frame
    '[rect #r1] @pos(0,300) @size(300,100) @color(blue) @group("画区")',
    '[text #t1] @pos(0,420) @text("合计") @color(black) @group("画区") @compute("#a.w + #b.w")',
    '[frame #fr1] @pos(0,200) @size(400,120) @text("区块") @color(blue)',
    // arrow 七指令 + wikilink + 自由箭头 + route 三形态
    '[arrow #e1] from #a to #b @label("引用") @color(black) @dash(solid) @arrowhead(arrow)',
    '[arrow #e2] from #a to #c @dash(dashed) @arrowhead(triangle) @wikilink',
    '[arrow #e3] @pos(10,10) @size(60,40) @color(black)',
    '[arrow #e4] from #c to #d @route(curve) @curve(40,40)',
    '[arrow #e5] from #d to #e @route(elbow) @elbow(300,60;300,120)',
  ]

  it('文档承诺的每条指令/形态 → 全管线零错误零警告零跳过', () => {
    const p = parseDslWithDiagnostics(CONFORMANCE_DOC.join('\n'))
    expect(p.errors, JSON.stringify(p.errors)).toEqual([])
    expect(p.warnings, JSON.stringify(p.warnings)).toEqual([])
    const s = sanitizeDslOps(p.ops)
    expect(s.diagnostics, JSON.stringify(s.diagnostics)).toEqual([])
    const v = solveRelational(s.ops)
    expect(v.diagnostics).toEqual([])
    const { svg, skipped } = toSvg(v.ops)
    expect(skipped).toEqual([])
    expect(svg).toContain('<svg')
    expect(/NaN|Infinity/.test(svg)).toBe(false)
  })

  it('文档提及的 @指令名都在 AT_DIRECTIVES(允许清单=锚示例/占位词)', () => {
    const nonDirective = new Set(['name', 'groupname', 'methods', 'axes', 'a', 'b', 'expr', 'x', 'y', 'w', 'h', 'word'])
    const mentioned = [...DSL_GRAMMAR_REFERENCE.matchAll(/@([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) => m[1]!)
    for (const w of new Set(mentioned)) {
      if (nonDirective.has(w)) continue
      expect(AT_DIRECTIVES.has(w), `文档提及 @${w} 但不在 @指令集`).toBe(true)
    }
  })
})
