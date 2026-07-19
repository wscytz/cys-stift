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
})
