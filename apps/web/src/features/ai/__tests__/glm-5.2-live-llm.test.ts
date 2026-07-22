import { describe, expect, it } from 'vitest'
import { parseDsl, sanitizeDslOps, DSL_GRAMMAR_REFERENCE } from '@cys-stift/dsl'

/**
 * glm-5.2 独立交叉验证(live LLM,默认跳过)—— 真实模型输出可被吃下。
 *
 * 独立角度:合成 AI 样本(file glm-5.2-ai-samples)只证"照 grammar 写能过";本测试
 * 证"真实 LLM 输出(可能带散文/代码围栏)经 graceful parser 不崩、sanitize 不抛"。
 *
 * 门控(严):
 * - 仅当 process.env.CYS_DSL_LIVE_LLM === '1' 时跑,否则整体 skip。
 * - key 从 process.env.GLM_API_KEY 或 process.env.DEEPSEEK_API_KEY 读,**只进 Authorization header**,
 *   绝不写进 prompt / 日志 / 断言 / 错误信息。
 * - prompt 仅含**合成画布**(两张假卡),无任何真实数据。
 * - 断言只看结构(解析出 ≥1 op、sanitize 不抛),不 echo 模型原文(可能含反射回的 prompt)。
 */
const RUN_LIVE = process.env.CYS_DSL_LIVE_LLM === '1'

// 合成画布(无任何真实数据;key 永不进 prompt)。
const SYNTHETIC_CANVAS = [
  '[card #syn-a create] @pos(0, 0) @size(240, 120) @color(blue) @title("种子 A") @content("这是合成种子卡")',
  '[card #syn-b create] @pos(400, 0) @size(240, 120) @color(yellow) @title("种子 B")',
].join('\n')

const SYNTHETIC_INSTRUCTION =
  '在种子 A 与种子 B 之间新增一张卡,标题"桥梁",内容写一句话,并用一条 dashed 箭头从 syn-a 指向 syn-b。只输出 cys-dsl 指令。'

interface ProviderCfg {
  name: string
  baseUrl: string
  model: string
  apiKey: string | undefined
}

/** 选择 provider:GLM 优先(与测试前缀呼应),回退 DeepSeek。env 可覆盖 baseUrl/model。 */
function pickProvider(): ProviderCfg | undefined {
  const glmKey = process.env.GLM_API_KEY
  if (glmKey) {
    return {
      name: 'glm',
      baseUrl: process.env.GLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.GLM_MODEL ?? 'glm-4-flash',
      apiKey: glmKey,
    }
  }
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  if (deepseekKey) {
    return {
      name: 'deepseek',
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      apiKey: deepseekKey,
    }
  }
  return undefined
}

async function callModel(cfg: ProviderCfg): Promise<string> {
  // key 只进 header;失败抛通用错误,不回显 body 里可能含的反射 prompt 也不含 key。
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      max_tokens: 512,
      messages: [
        { role: 'system', content: DSL_GRAMMAR_REFERENCE },
        { role: 'user', content: `当前画布:\n${SYNTHETIC_CANVAS}\n\n任务:${SYNTHETIC_INSTRUCTION}` },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`live-llm ${cfg.name} HTTP ${res.status}(不回显响应体,防泄露)`)
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`live-llm ${cfg.name} 返回空 content`)
  }
  return content
}

describe.skipIf(!RUN_LIVE)('glm-5.2 live LLM —— 真实模型输出可被吃下(默认跳过)', { timeout: 90000 }, () => {
  it('模型输出经 graceful parser 产出 ≥1 op,sanitize 不抛(不断言原文)', async () => {
    const cfg = pickProvider()
    // 双重门控:即使 RUN_LIVE 开了但没配 key,也给出明确跳过信号而非暴露在断言里。
    if (!cfg) {
      console.warn('live-llm: CYS_DSL_LIVE_LLM=1 但未配 GLM_API_KEY/DEEPSEEK_API_KEY,跳过')
      return
    }

    let raw: string
    try {
      raw = await callModel(cfg)
    } catch (e) {
      // 网络/鉴权失败不判 fail 测试(本测试关注 parser/sanitize 健壮性,不是模型可用性)。
      console.warn(`live-llm: 调用失败,跳过 — ${(e as Error).name}`)
      return
    }

    // 直接喂 graceful parser(模型输出常带围栏/散文,strict 会报;真实 AI 路径走 graceful)。
    const ops = parseDsl(raw)
    expect(ops.length, '模型输出应至少解析出 1 条 op').toBeGreaterThanOrEqual(1)

    // sanitize 永不抛,且不丢数据。
    const { ops: clean, diagnostics } = sanitizeDslOps(ops)
    expect(clean.length).toBe(ops.length)
    // diagnostics 可能存在(模型编不存在的 id 等)——这是允许的;关键是不抛。
    void diagnostics
  })
})
