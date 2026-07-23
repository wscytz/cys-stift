import { describe, expect, it } from 'vitest'
import { parseDsl, parseDslStrictWithDiagnostics, parseDslWithDiagnostics } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
import { DSL_VERSION } from '../dsl-grammar'

/**
 * glm-5.2 独立交叉验证 —— 转义核心卖点之二:**AI 可驱动(真实 LLM 输出可被零诊断接受)**。
 *
 * 独立角度:不写单行 fixture,而是写**整段真实风格的 LLM 输出文档**(树/网格/内容板/流程),
 * 用 **strict parser**(对 LLM 输出的最高门槛:prose、重复 directive、残余文本一律算错)断言
 * **零诊断**,再过 sanitize 不抛。这锁定"AI 照着 GRAMMAR_REFERENCE 写就能被机器吃下"的承诺。
 */
describe('glm-5.2 AI 样本 —— 真实风格 DSL 文档被 strict parser 零诊断接受', () => {
  it('树形布局(根 + right-of 子节点 + 关系箭头)', () => {
    // 注:strict 模式现在放行 `#` 注释行(grammar 承诺"注释被忽略",已修正一致);样本仍用纯指令行,
    // 注释行为见下文「strict 与 graceful 对注释/散文的处理」小节。
    const dsl = [
      '[card #root create] @pos(100, 100) @size(240, 120) @color(blue) @title("根节点") @content("这是根")',
      '[card #child-a create] right-of #root @gap(40) @size(200, 100) @color(yellow) @title("子 A")',
      '[card #child-b create] below #child-a @gap(40) @size(200, 100) @color(yellow) @title("子 B")',
      '[arrow #e1] from #root to #child-a @label("分支") @color(black) @dash(solid) @arrowhead(arrow)',
      '[arrow #e2] from #root to #child-b @label("分支") @color(black) @dash(solid) @arrowhead(arrow)',
    ].join('\n')

    const { ops, errors } = parseDslStrictWithDiagnostics(dsl)
    expect(errors, JSON.stringify(errors)).toEqual([])
    expect(ops).toHaveLength(5)
    expect(ops.filter((o) => o.type === 'card')).toHaveLength(3)
    expect(ops.filter((o) => o.type === 'arrow')).toHaveLength(2)

    // sanitize 不抛 + 不产非预期诊断(ctx 为空 → 仅 size/coord 路径,合法输入零诊断)。
    const { diagnostics } = sanitizeDslOps(ops)
    expect(diagnostics).toEqual([])
  })

  it('2x2 网格(右下交叉用 right-of + below,所有 card 带 create)', () => {
    const dsl = [
      '[card #g00 create] @pos(0, 0) @size(120, 80) @color(red)',
      '[card #g01 create] right-of #g00 @gap(20) @size(120, 80) @color(red)',
      '[card #g10 create] below #g00 @gap(20) @size(120, 80) @color(red)',
      '[card #g11 create] right-of #g10 @gap(20) @size(120, 80) @color(red)',
    ].join('\n')

    const { ops, errors } = parseDslStrictWithDiagnostics(dsl)
    expect(errors).toEqual([])
    expect(ops).toHaveLength(4)
    // 全部带 rel(除 anchor)且 create。
    const cards = ops.filter((o) => o.type === 'card')
    expect(cards.every((c) => 'create' in c && c.create === true)).toBe(true)
  })

  it('内容板(每张卡带 @title + 多行 markdown @content,含代码块与列表)', () => {
    const dsl = [
      '[card #note-1 create] @pos(0, 0) @size(300, 200) @color(white) @title("会议纪要") @content("## 主题\\n- 讨论路线图\\n- 分配任务\\n\\n```\\nconst x = 1\\n```")',
      '[card #note-2 create] @pos(400, 0) @size(300, 200) @color(white) @title("行动项") @content("1. 写设计文档\\n2. 评审\\n3. 发布")',
    ].join('\n')

    const { ops, errors } = parseDslStrictWithDiagnostics(dsl)
    expect(errors).toEqual([])
    expect(ops).toHaveLength(2)
    const n1 = ops[0]!
    expect(n1).toMatchObject({
      type: 'card',
      cardId: 'note-1',
      title: '会议纪要',
      content: '## 主题\n- 讨论路线图\n- 分配任务\n\n```\nconst x = 1\n```',
    })
  })

  it('流程图(关系箭头 + 自由箭头 + dash/arrowhead 全枚举 + wikilink)', () => {
    const dsl = [
      '[card #start create] @pos(0, 0) @size(120, 60) @color(green) @title("开始")'.replace('green', 'blue'),
      '[card #end create] @pos(300, 0) @size(120, 60) @color(blue) @title("结束")',
      '[arrow #flow] from #start to #end @label("流转") @color(black) @dash(dashed) @arrowhead(triangle)',
      '[arrow #flow2] from #start to #end @color(red) @dash(dotted) @arrowhead(none)',
      '[arrow #free-note] @pos(50, 200) @size(80, -40) @color(yellow) @dash(solid) @arrowhead(arrow)',
      '[arrow #wiki] from #start to #end @label("参见") @color(gray) @wikilink',
    ].join('\n')

    const { ops, errors } = parseDslStrictWithDiagnostics(dsl)
    expect(errors).toEqual([])
    expect(ops.filter((o) => o.type === 'arrow')).toHaveLength(4)

    // dash/arrowhead 枚举值全部正确收窄。
    const arrows = ops.filter((o) => o.type === 'arrow')
    const dashes = new Set(arrows.map((a) => (a as { dash?: string }).dash))
    expect(dashes.has('dashed')).toBe(true)
    expect(dashes.has('dotted')).toBe(true)
    expect(dashes.has('solid')).toBe(true)

    // wikilink 标记在 strict 下存活。
    const wiki = arrows.find((a) => (a as { wikilink?: boolean }).wikilink)
    expect(wiki).toBeDefined()
  })

  it('grey 颜色别名被接受(strict 不因别名报错)', () => {
    const dsl = '[card #c create] @pos(0,0) @size(10,10) @color(grey)'
    const { ops, errors } = parseDslStrictWithDiagnostics(dsl)
    expect(errors).toEqual([])
    expect((ops[0] as { color?: string }).color).toBe('grey')
  })

  it('grammar 版本号 v8(锁定 AI 样本所依据的当前语法版)', () => {
    expect(DSL_VERSION).toBe(8)
  })

  it('所有 AI 样本经 sanitize 后 ops 数量不变(无数据丢失)', () => {
    const samples = [
      '[card #a create] @pos(0,0) @size(10,10) @title("x")',
      '[rect #r] @pos(1,1) @size(2,2) @color(red)',
      '[arrow #ar] @pos(5,5) @size(10,10) @color(black) @dash(solid) @arrowhead(arrow)',
    ].join('\n')
    const ops = parseDsl(samples)
    const { ops: clean } = sanitizeDslOps(ops)
    expect(clean).toHaveLength(ops.length)
  })

  describe('strict 与 graceful 对注释/散文的处理(锁定:strict 放行注释、拒散文)', () => {
    it('graceful:行首 `#` 注释被静默跳过(GRAMMAR_REFERENCE 承诺"注释被忽略")', () => {
      const dsl = '# 这是注释\n[card #c create] @pos(0,0) @size(1,1)'
      const { ops, errors } = parseDslWithDiagnostics(dsl)
      expect(ops).toHaveLength(1)
      expect(errors).toEqual([])
    })

    it('strict:行首 `#` 注释也被放行(grammar 承诺注释被忽略;与 graceful 在注释上一致)', () => {
      // 修正:strict 曾把 `#` 注释当 prose 报错,与 grammar "Lines starting with # are
      // comments and ignored" 矛盾。现已让 strict 放行注释行 —— strict 仍比 graceful 严
      // (拒散文),但注释照忽略,grammar 对 AI 的承诺成立。
      const { ops, errors } = parseDslStrictWithDiagnostics(
        '# 这是注释\n[card #c create] @pos(0,0) @size(1,1)',
      )
      expect(ops).toHaveLength(1)
      expect(errors).toEqual([])
    })

    it('strict:非注释散文仍报错(strict 比 graceful 严之处)', () => {
      const { ops, errors } = parseDslStrictWithDiagnostics(
        '这是散文 not a comment\n[card #c create] @pos(0,0) @size(1,1)',
      )
      expect(ops).toHaveLength(1)
      expect(errors).toHaveLength(1)
      expect(errors[0]!.message).toMatch(/prose|markdown/)
    })
  })
})
