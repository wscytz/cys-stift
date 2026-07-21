import { describe, it, expect } from 'vitest'
import { parseDsl, parseDslWithDiagnostics } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
import { DSL_GRAMMAR_REFERENCE } from '../dsl-grammar'

/**
 * qwen-max-7-21 · 预期能力测试 ②「AI 可驱动 · 文法侧」
 *
 * 转义承诺"任何 AI 读写一段文字就能操作画布"。这组用**真实风格的 LLM 输出样本**
 * (重排 / 分框 / 连线 / 关系式放置 / 带内容 / 夹带散文围栏)验证:AI 产出的 DSL 能被
 * parser **零诊断**接受、sanitize 永不抛错。这是"AI 驱动画布"契约的文法半边
 * (应用半边见 apps/web 的 qwen-max-7-21-ai-apply)。样本即回归集:LLM 友好性退化这里先红。
 */
const AI_SAMPLES: { name: string; dsl: string; minOps: number }[] = [
  {
    name: '分框 + 归位 + 上色',
    minOps: 4,
    dsl: [
      '[frame #fr-health] @pos(40,40) @size(360,520) @text("健康") @color(blue)',
      '[card #c1] @pos(80,80) @color(blue)',
      '[card #c2] @pos(80,320) @color(blue)',
      '[card #c3] @pos(480,80) @color(red)',
    ].join('\n'),
  },
  {
    name: '关系式放置(right-of / below)',
    minOps: 3,
    dsl: [
      '[card #a] @pos(0,0) @size(200,100)',
      '[card #b] right-of #a @gap(24) @size(200,100)',
      '[card #c] below #a @gap(16) @size(200,100)',
    ].join('\n'),
  },
  {
    name: '建关系箭头(带签名)',
    minOps: 1,
    dsl: '[arrow #a1] from #c1 to #c2 @label("相辅") @color(blue) @dash(dashed) @arrowhead(triangle)',
  },
  {
    name: 'v5 带内容建卡',
    minOps: 1,
    dsl: '[card #note1 create] @pos(100,100) @size(240,120) @color(yellow) @title("待办") @content("- 买牛奶\\n- 跑步")',
  },
  {
    name: 'LLM 常见:夹带散文/围栏(应被忽略,只取 DSL 行)',
    minOps: 2,
    dsl: [
      '好的,我来重排你的画布:',
      '```cys-dsl',
      '[card #c1] @pos(100,100)',
      '[card #c2] @pos(400,100)',
      '```',
      '已完成。',
    ].join('\n'),
  },
]

describe('qwen-max-7-21-ai-grammar · AI 输出零诊断可解析', () => {
  for (const s of AI_SAMPLES) {
    it(`${s.name}:parseDslWithDiagnostics 零错误 + ≥${s.minOps} ops`, () => {
      const { ops, errors } = parseDslWithDiagnostics(s.dsl)
      expect(errors).toEqual([])
      expect(ops.length).toBeGreaterThanOrEqual(s.minOps)
    })

    it(`${s.name}:sanitize 永不抛错 + ops 不增`, () => {
      const ops = parseDsl(s.dsl)
      const { ops: clean } = sanitizeDslOps(ops)
      expect(clean.length).toBeLessThanOrEqual(ops.length)
    })
  }

  it('语法参考向 AI 公示了 v5 内容 token(@title/@content)', () => {
    // 格式层支持内容(文法正确性);具体消费者是否"写"是适配层事(见 README 已知局限 A)。
    expect(DSL_GRAMMAR_REFERENCE).toContain('@title(')
    expect(DSL_GRAMMAR_REFERENCE).toContain('@content(')
  })
})
