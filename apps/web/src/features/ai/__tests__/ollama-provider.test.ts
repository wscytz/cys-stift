import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOllamaProvider } from '../providers/ollama'

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
  createOllamaProvider({
    baseUrl: 'http://localhost:11434',
    model: 'qwen2.5:7b',
  })

describe('ollama provider — NDJSON termination metadata', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads done_reason=length and token usage from the terminal line', async () => {
    mockFetch(
      '{"message":{"content":"partial"},"done":false}\n' +
        '{"message":{"content":""},"done":true,"done_reason":"length","prompt_eval_count":11,"eval_count":5}\n',
    )
    const response = await provider().streamText({ system: 's', user: 'u' }, () => {}, undefined)
    expect(response.content).toBe('partial')
    expect(response.finishReason).toBe('length')
    expect(response.stopReason).toBe('length')
    expect(response.usage).toEqual({ promptTokens: 11, completionTokens: 5 })
  })

  it('parses a terminal NDJSON line without a trailing newline', async () => {
    mockFetch('{"message":{"content":"ok"},"done":true,"done_reason":"stop"}')
    const response = await provider().streamText({ system: 's', user: 'u' }, () => {}, undefined)
    expect(response.content).toBe('ok')
    expect(response.finishReason).toBe('stop')
    expect(response.stopReason).toBe('stop')
  })
})
