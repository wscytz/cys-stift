import { describe, it, expect } from 'vitest'
import { parseDslWithDiagnostics } from '../dsl-parser'
import { DSL_GRAMMAR_REFERENCE } from '../dsl-grammar'

/**
 * qwen-max-7-21 · 预期能力测试 ③「AI 可驱动 · 实测」(live,env 门控)
 *
 * 真调 LLM,让它**只凭** DSL_GRAMMAR_REFERENCE + 一句排版指令产出一段 cys-dsl,
 * 再验证 parser **零诊断**接受 —— 这就是"任何 AI 读写一段文字就能驱动画布"的实弹验证。
 *
 * 模型:DeepSeek 两款 `deepseek-v4-flash`(快)/ `deepseek-v4-pro`(强,需 `thinking:disabled`)。
 *
 * 默认**跳过**(不进 pnpm test / CI,避免网络依赖与抖动)。启用:
 *   CYS_DSL_LIVE_LLM=1 DEEPSEEK_API_KEY=… pnpm --filter @cys-stift/dsl test qwen-max-7-21-live-llm
 *
 * 隐私:prompt 只含**合成**画布(3 张假卡)+ 语法参考,不含任何真实用户内容;
 * key 只进 auth header,绝不入日志 / 断言 / 提交。
 */
const RUN = process.env.CYS_DSL_LIVE_LLM === '1'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? ''

const SYSTEM = [
  'You drive a canvas by emitting cys-dsl text ONLY. No prose, no code fences, no explanations.',
  'One element per line. EVERY line MUST start with `[` and be `[<kind> #<id>]` — no bare `card #x`.',
  'Use exactly the grammar below.',
  '',
  DSL_GRAMMAR_REFERENCE,
  '',
  'Valid example (note the square brackets on every line):',
  '[card #x1] @pos(100,100) @size(200,100)',
  '[card #x2] right-of #x1 @gap(24)',
  '[arrow #a1] from #x1 to #x2 @label("next")',
].join('\n')

const TASK = [
  'A canvas already has three cards: #c1 at (100,100), #c2 at (600,100), #c3 at (100,500).',
  'Rearrange them into a tidy horizontal row: keep #c1 at (100,100); put #c2 to the right of #c1',
  'with a 24px gap; put #c3 to the right of #c2 with a 24px gap. Then add an arrow from #c1 to #c2',
  'labeled "next". Emit only the cys-dsl lines.',
].join('\n')

async function postWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | undefined
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init)
    if (res.ok) return res
    last = res
    // 429(限流)/ 5xx 可重试:指数退避(5s → 15s)。其余 4xx(认证/参数)不重试,直接抛。
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, i === 0 ? 5000 : 15000))
      continue
    }
    return res
  }
  return last!
}

async function askDeepSeek(model: string): Promise<string> {
  const res = await postWithRetry('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: TASK },
      ],
      max_tokens: 1024,
      // DeepSeek 结构化输出关思考(与 apps/web openai-provider 一致):v4-pro 思考会吃光
      // token 导致 content 空、DSL 被截断。这是 app 已实测的根因修复,这里镜像之。
      thinking: { type: 'disabled' },
    }),
  })
  if (!res.ok) throw new Error(`deepseek ${model} http ${res.status}`)
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return json.choices?.[0]?.message?.content ?? ''
}

/** 能力断言:LLM 只凭语法参考就产出 parser 零诊断接受、且真驱动了画布的合法 DSL。
 *  门槛是"合法 DSL"(0 解析错 + ≥2 op),不是"完整执行 3 卡指令"——好模型可能只 emit 改动
 *  (如 c1 已在位就不重发),指令完整度是模型质量轴,非格式能力轴。 */
function assertDrivesCanvas(raw: string) {
  const { ops, errors } = parseDslWithDiagnostics(raw)
  expect(errors, `LLM 产出了 parser 不接受的行:\n${raw}`).toEqual([])
  expect(ops.length, `LLM 没产出有效 DSL(≥2 op):\n${raw}`).toBeGreaterThanOrEqual(2)
  expect(ops.some((o) => o.type === 'card'), `LLM 没产出任何 card op:\n${raw}`).toBe(true)
}

describe.runIf(RUN && DEEPSEEK_KEY)('qwen-max-7-21-live-llm · LLM 实测驱动画布', () => {
  it.runIf(!!DEEPSEEK_KEY)(
    'deepseek-v4-flash 只凭语法参考即可产出合法 DSL',
    async () => assertDrivesCanvas(await askDeepSeek('deepseek-v4-flash')),
    90_000,
  )

  it.runIf(!!DEEPSEEK_KEY)(
    'deepseek-v4-pro 只凭语法参考即可产出合法 DSL',
    async () => assertDrivesCanvas(await askDeepSeek('deepseek-v4-pro')),
    150_000,
  )
})

// 未启用时给个显式占位:普通 test 运行里可见地"跳过",而非文件凭空消失。
describe.skipIf(RUN && DEEPSEEK_KEY)('qwen-max-7-21-live-llm · 跳过(未启用)', () => {
  it('设置 CYS_DSL_LIVE_LLM=1 + DEEPSEEK_API_KEY 以启用实测', () => {
    expect(true).toBe(true)
  })
})
