import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnthropicProvider } from '../providers/anthropic'

function mockFetch(body: string) {
  const encoder = new TextEncoder()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }),
    text: async () => body,
  })))
}

const provider = () =>
  createAnthropicProvider({
    apiKey: 'sk-test',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-haiku-4-5',
  })

describe('anthropic provider — stream termination metadata', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps stop_reason=max_tokens to finishReason=length and keeps usage', async () => {
    mockFetch(
      'event: message_start\n' +
        'data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n' +
        'event: content_block_delta\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n' +
        'event: message_delta\n' +
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":7}}\n\n' +
        'event: message_stop\n' +
        'data: {"type":"message_stop"}\n\n',
    )
    const response = await provider().streamText({ system: 's', user: 'u' }, () => {}, undefined)
    expect(response.content).toBe('partial')
    expect(response.finishReason).toBe('length')
    expect(response.stopReason).toBe('max_tokens')
    expect(response.usage).toEqual({ promptTokens: 12, completionTokens: 7 })
  })

  it('maps refusal stop reason without treating it as a retryable format error', async () => {
    mockFetch(
      'event: message_start\n' +
        'data: {"type":"message_start","message":{"usage":{"input_tokens":1}}}\n\n' +
        'event: message_delta\n' +
        'data: {"type":"message_delta","delta":{"stop_reason":"refusal"},"usage":{"output_tokens":0}}\n\n',
    )
    const response = await provider().streamText({ system: 's', user: 'u' }, () => {}, undefined)
    expect(response.finishReason).toBe('refusal')
    expect(response.stopReason).toBe('refusal')
  })

  it('declares prompt plus local decode fallback for JSON Schema', () => {
    expect(provider().capabilities).toEqual({ jsonSchemaResponse: false })
  })
})

describe('anthropic provider — 错误消息友好化(对齐 openai)', () => {
  afterEach(() => vi.unstubAllGlobals())

  // 此前直接把整段 errText 塞进 AIProviderHttpError;现走 anthropicErrorMessage
  // 提取 error.message + 按 status 给中文提示。
  it('401 → 友好的 key 无效提示(而非整段 JSON)', async () => {
    const errBody = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, body: null, text: async () => errBody }) as any))
    await expect(provider().streamText({ system: 's', user: 'u' }, () => {}, undefined)).rejects.toThrow(/key 无效/)
  })

  it('404 → 端点/模型不存在提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, body: null, text: async () => '{"type":"error","error":{"message":"model not found"}}' }) as any))
    await expect(provider().streamText({ system: 's', user: 'u' }, () => {}, undefined)).rejects.toThrow(/端点或模型不存在/)
  })

  it('429 → 限额提示 + retryAfterMs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, body: null, headers: new Headers({ 'Retry-After': '2' }), text: async () => '{"type":"error","error":{"message":"rate limited"}}' }) as any))
    await expect(provider().streamText({ system: 's', user: 'u' }, () => {}, undefined)).rejects.toMatchObject({ message: expect.stringMatching(/过频或额度/), status: 429, retryAfterMs: 2_000 })
  })

  it('其它 status → 提取 error.message(不塞整段 JSON)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, body: null, text: async () => '{"type":"error","error":{"message":"internal boom"}}' }) as any))
    await expect(provider().streamText({ system: 's', user: 'u' }, () => {}, undefined)).rejects.toThrow(/internal boom/)
  })
})
