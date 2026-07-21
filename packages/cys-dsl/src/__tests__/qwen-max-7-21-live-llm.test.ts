import { describe, it, expect } from 'vitest'
import { parseDslWithDiagnostics } from '../dsl-parser'
import { DSL_GRAMMAR_REFERENCE } from '../dsl-grammar'

/**
 * qwen-max-7-21 · 预期能力测试 ③「AI 可驱动 · 实测」(live,env 门控)
 *
 * 真调 LLM,让它**只凭** DSL_GRAMMAR_REFERENCE + 一句排版指令产出一段 cys-dsl,
 * 再验证 parser **零诊断**接受 —— 这就是"任何 AI 读写一段文字就能驱动画布"的实弹验证。
 *
 * 模型(按可用性):
 *   - DeepSeek 两款:`deepseek-chat`(V3)+ `deepseek-reasoner`(R1)—— 需 DEEPSEEK_API_KEY。
 *   - GLM 兜底演示:`glm-5.2`(Anthropic 兼容端点)—— 需 GLM_API_KEY。
 *
 * 默认**跳过**(不进 pnpm test / CI,避免网络依赖与抖动)。启用:
 *   CYS_DSL_LIVE_LLM=1 DEEPSEEK_API_KEY=… pnpm --filter @cys-stift/dsl test qwen-max-7-21-live-llm
 *   (或 GLM_API_KEY=… 用 GLM 演示;两者可同时给)
 *
 * 隐私:prompt 只含**合成**画布(3 张假卡)+ 语法参考,不含任何真实用户内容;
 * key 只进 auth header,绝不入日志 / 断言 / 提交。
 */
const RUN = process.env.CYS_DSL_LIVE_LLM === '1'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? ''
const GLM_KEY = process.env.GLM_API_KEY ?? ''

const SYSTEM = [
  'You drive a canvas by emitting cys-dsl text ONLY. No prose, no code fences, no explanations.',
  'One element per line. Use exactly the grammar below.',
  '',
  DSL_GRAMMAR_REFERENCE,
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
    }),
  })
  if (!res.ok) throw new Error(`deepseek ${model} http ${res.status}`)
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return json.choices?.[0]?.message?.content ?? ''
}

async function askGLM(): Promise<string> {
  const res = await postWithRetry('https://open.bigmodel.cn/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': GLM_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'glm-5.2',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: TASK }],
    }),
  })
  if (!res.ok) throw new Error(`glm http ${res.status}`)
  const json = (await res.json()) as { content?: { text?: string }[] }
  return (json.content ?? []).map((b) => b.text ?? '').join('')
}

/** 能力断言:LLM 只凭语法参考就产出 parser 零诊断接受、且真在排 3 张卡的 DSL。 */
function assertDrivesCanvas(raw: string) {
  const { ops, errors } = parseDslWithDiagnostics(raw)
  expect(errors, `LLM 产出了 parser 不接受的行:\n${raw}`).toEqual([])
  const cards = ops.filter((o) => o.type === 'card')
  expect(cards.length, `LLM 没产出 3 张卡的重排 DSL:\n${raw}`).toBeGreaterThanOrEqual(3)
}

describe.runIf(RUN && (DEEPSEEK_KEY || GLM_KEY))('qwen-max-7-21-live-llm · LLM 实测驱动画布', () => {
  it.runIf(!!DEEPSEEK_KEY)(
    'deepseek-chat 只凭语法参考即可产出合法 DSL',
    async () => assertDrivesCanvas(await askDeepSeek('deepseek-chat')),
    90_000,
  )

  it.runIf(!!DEEPSEEK_KEY)(
    'deepseek-reasoner 只凭语法参考即可产出合法 DSL',
    async () => assertDrivesCanvas(await askDeepSeek('deepseek-reasoner')),
    120_000,
  )

  it.runIf(!!GLM_KEY)(
    'glm-5.2(兜底演示)只凭语法参考即可产出合法 DSL',
    async () => assertDrivesCanvas(await askGLM()),
    90_000,
  )
})

// 未启用时给个显式占位:普通 test 运行里可见地"跳过",而非文件凭空消失。
describe.skipIf(RUN && (DEEPSEEK_KEY || GLM_KEY))('qwen-max-7-21-live-llm · 跳过(未启用)', () => {
  it('设置 CYS_DSL_LIVE_LLM=1 + DEEPSEEK_API_KEY / GLM_API_KEY 以启用实测', () => {
    expect(true).toBe(true)
  })
})
