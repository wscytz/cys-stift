import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOpenAIProvider, isDeepSeekEndpoint } from '../providers/openai'
import type { AIConfig } from '../types'

/**
 * openai provider — structuredOutput(思考模式适配)+ 错误消息友好化 单测。
 *
 * DeepSeek 等 OpenAI 兼容端点默认开「思考模式」,思考吃光 token 导致 DSL/JSON
 * 结构化输出被截断(实测根因)。structuredOutput:true 时对 deepseek baseUrl
 * 发 thinking:disabled 关思考;对真正 OpenAI 端点不发(不破坏兼容)。
 *
 * fetch 全 mock,不触网。观测发出去的 body 是否含 thinking 字段。
 */

function mockFetch(body: string, ok = true, status = 200) {
  const calls: { url: string; body: any }[] = []
  const encoder = new TextEncoder()
  const fakeFetch = async (url: string, init: any) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null })
    const res = {
      ok,
      status,
      body: new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(encoder.encode(body))
          ctrl.close()
        },
      }),
      text: async () => body,
    }
    return res
  }
  vi.stubGlobal('fetch', vi.fn(fakeFetch as any))
  return calls
}

const baseCfg = (baseUrl: string): AIConfig => ({
  provider: 'openai',
  apiKey: 'sk-test',
  baseUrl,
  model: 'deepseek-v4-flash',
  enabled: true,
})

describe('openai provider — structuredOutput 思考模式适配', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('DeepSeek 端点 + structuredOutput → body 含 thinking:disabled', async () => {
    const calls = mockFetch('data: [DONE]\n\n')
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1', model: 'm' })
    await p.streamText({ system: 's', user: 'u', structuredOutput: true }, () => {}, undefined)
    expect(calls[0]!.body.thinking).toEqual({ type: 'disabled' })
  })

  it('DeepSeek 端点 + 非 structuredOutput → body 不含 thinking(保留思考,如总结/改写)', async () => {
    const calls = mockFetch('data: [DONE]\n\n')
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1', model: 'm' })
    await p.streamText({ system: 's', user: 'u' }, () => {}, undefined)
    expect(calls[0]!.body.thinking).toBeUndefined()
  })

  it('真 OpenAI 端点 + structuredOutput → 不发 thinking(避免被端点拒绝)', async () => {
    const calls = mockFetch('data: [DONE]\n\n')
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
    await p.streamText({ system: 's', user: 'u', structuredOutput: true }, () => {}, undefined)
    expect(calls[0]!.body.thinking).toBeUndefined()
  })

  it('deepseek 子域也识别(如 api.deepseek.com 不带 /v1)', async () => {
    const calls = mockFetch('data: [DONE]\n\n')
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com', model: 'm' })
    await p.streamText({ system: 's', user: 'u', structuredOutput: true }, () => {}, undefined)
    expect(calls[0]!.body.thinking).toEqual({ type: 'disabled' })
  })

  // Fix 4a 拓宽:Volcano / SiliconFlow 等镜像走非 deepseek.com 域名,但模型名仍是
  // deepseek-chat / deepseek-reasoner 等。只靠 baseUrl 域名会漏 → thinking 不发 →
  // 思考吃光 token → DSL 截断 → 「排版从未生效」。模型名兜底检测覆盖这些镜像。
  it('SiliconFlow baseUrl + deepseek 模型名 → body 含 thinking:disabled(镜像兜底)', async () => {
    const calls = mockFetch('data: [DONE]\n\n')
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-chat' })
    await p.streamText({ system: 's', user: 'u', structuredOutput: true }, () => {}, undefined)
    expect(calls[0]!.body.thinking).toEqual({ type: 'disabled' })
  })

  it('Volcano baseUrl + deepseek 模型名 → body 含 thinking:disabled(镜像兜底)', async () => {
    const calls = mockFetch('data: [DONE]\n\n')
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'deepseek-v3-241226' })
    await p.streamText({ system: 's', user: 'u', structuredOutput: true }, () => {}, undefined)
    expect(calls[0]!.body.thinking).toEqual({ type: 'disabled' })
  })

  it('非 deepseek baseUrl + 非 deepseek 模型 + structuredOutput → 不发 thinking', async () => {
    const calls = mockFetch('data: [DONE]\n\n')
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.siliconflow.cn/v1', model: 'qwen2.5-72b' })
    await p.streamText({ system: 's', user: 'u', structuredOutput: true }, () => {}, undefined)
    expect(calls[0]!.body.thinking).toBeUndefined()
  })

  it('保留流末帧 finish_reason=length，避免上层把截断当普通格式错', async () => {
    const calls = mockFetch(
      'data: {"choices":[{"delta":{"content":"[card #a"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n' +
        'data: [DONE]\n\n',
    )
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
    const response = await p.streamText({ system: 's', user: 'u' }, () => {}, undefined)
    expect(response.content).toBe('[card #a')
    expect(response.finishReason).toBe('length')
    expect(response.stopReason).toBe('length')
    expect(calls).toHaveLength(1)
  })

  it('读取 OpenAI-compatible refusal delta，并保留 refusal 文本', async () => {
    const body =
      'data: {"choices":[{"delta":{"refusal":"不能处理"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
      'data: [DONE]\n\n'
    mockFetch(body)
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
    const response = await p.streamText({ system: 's', user: 'u' }, () => {}, undefined)
    expect(response.refusal).toBe('不能处理')
    expect(response.finishReason).toBe('refusal')
    expect(response.stopReason).toBe('refusal')
  })

  it('无换行的末帧也会被解析', async () => {
    mockFetch('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}')
    const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
    const response = await p.streamText({ system: 's', user: 'u' }, () => {}, undefined)
    expect(response.content).toBe('ok')
    expect(response.finishReason).toBe('stop')
  })
})

// isDeepSeekEndpoint 纯函数单测(Fix 4a 拓宽:baseUrl OR model)。
describe('isDeepSeekEndpoint', () => {
  it('deepseek baseUrl 命中', () => {
    expect(isDeepSeekEndpoint('https://api.deepseek.com/v1', 'whatever')).toBe(true)
  })

  it('deepseek 模型名命中(即使 baseUrl 非 deepseek.com)', () => {
    expect(isDeepSeekEndpoint('https://api.siliconflow.cn/v1', 'deepseek-chat')).toBe(true)
    expect(isDeepSeekEndpoint('https://ark.cn-beijing.volces.com/api/v3', 'deepseek-v3-241226')).toBe(true)
    expect(isDeepSeekEndpoint('https://api.openai.com/v1', 'deepseek-reasoner')).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(isDeepSeekEndpoint('https://API.DeepSeek.COM/v1', 'm')).toBe(true)
    expect(isDeepSeekEndpoint('https://api.x.com/v1', 'DeepSeek-Chat')).toBe(true)
  })

  it('两者都不是 deepseek → false', () => {
    expect(isDeepSeekEndpoint('https://api.openai.com/v1', 'gpt-4o-mini')).toBe(false)
    expect(isDeepSeekEndpoint('https://api.siliconflow.cn/v1', 'qwen2.5-72b')).toBe(false)
  })
})

describe('openai provider — 错误消息友好化', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('401 → 友好的 key 无效提示(而非整段 JSON)', async () => {
    const errBody = JSON.stringify({ error: { message: 'Authentication Fails, Your api key is invalid', type: 'authentication_error' } })
    const fakeFetch = async () => ({ ok: false, status: 401, body: null, text: async () => errBody })
    vi.stubGlobal('fetch', vi.fn(fakeFetch as any))
    const p = createOpenAIProvider({ apiKey: 'bad', baseUrl: 'https://api.deepseek.com/v1', model: 'm' })
    await expect(p.streamText({ system: 's', user: 'u' }, () => {}, undefined)).rejects.toThrow(/key 无效/)
  })

  it('404 → 端点/模型不存在提示', async () => {
    const fakeFetch = async () => ({ ok: false, status: 404, body: null, text: async () => '{"error":{"message":"model not found"}}' })
    vi.stubGlobal('fetch', vi.fn(fakeFetch as any))
    const p = createOpenAIProvider({ apiKey: 'sk', baseUrl: 'https://api.deepseek.com/v1', model: 'm' })
    await expect(p.streamText({ system: 's', user: 'u' }, () => {}, undefined)).rejects.toThrow(/端点或模型不存在/)
  })

  it('429 → 限额提示', async () => {
    const fakeFetch = async () => ({ ok: false, status: 429, body: null, text: async () => '{"error":{"message":"rate limited"}}' })
    vi.stubGlobal('fetch', vi.fn(fakeFetch as any))
    const p = createOpenAIProvider({ apiKey: 'sk', baseUrl: 'https://api.deepseek.com/v1', model: 'm' })
    await expect(p.streamText({ system: 's', user: 'u' }, () => {}, undefined)).rejects.toThrow(/过频或额度/)
  })

  it('testConnection 也返回友好错误', async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, body: null, text: async () => '{"error":{"message":"invalid key"}}' })
    vi.stubGlobal('fetch', vi.fn(fakeFetch as any))
    const p = createOpenAIProvider({ apiKey: 'bad', baseUrl: 'https://api.deepseek.com/v1', model: 'm' })
    const r = await p.testConnection()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/key 无效/)
  })
})
