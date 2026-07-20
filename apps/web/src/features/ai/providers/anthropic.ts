'use client'

/**
 * M3.3 — Anthropic messages provider. Uses the `/v1/messages` endpoint with
 * `stream: true`. SSE format: `event: <type>\ndata: <json>\n\n`. The relevant
 * event is `content_block_delta`, whose `delta.text` holds the text chunk.
 * No `[DONE]` sentinel — we drain the stream until reader.read() returns done.
 *
 * Uses `eventsource-parser` to handle the dual `event:`/`data:` lines
 * (hand-rolling this is error-prone — OpenAI's single-line SSE is fine to
 * parse by hand, but Anthropic's two-line format has too many edge cases).
 */

import { createParser, type ParseEvent } from 'eventsource-parser'
import { consumeStream } from './stream-reader'
import {
  AIProviderHttpError,
  normalizeAIFinishReason,
  parseRetryAfterMs,
  type AIFinishReason,
  type AIProvider,
  type AIRequest,
  type AIResponse,
} from '../types'

interface AnthropicConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export function createAnthropicProvider(cfg: AnthropicConfig): AIProvider {
  return {
    id: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5',
    models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'],
    capabilities: { jsonSchemaResponse: false },
    async streamText(req, onDelta, signal) {
      const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-09',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: cfg.model,
          system: req.system,
          messages: req.messages ?? [{ role: 'user', content: req.user }],
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.7,
          stream: true,
          // Anthropic 扩展思考默认就是关闭的(只有显式发 thinking:{type:'enabled',
          // budget_tokens} 才开启,我们从不发)。因此 req.structuredOutput 在此为 no-op:
          // 结构化输出任务无需关思考 —— 思考本来就没开,不会吃 token。刻意不发送
          // thinking:{type:'disabled'} 字段:Anthropic Messages API 不认该值,会 400。
        }),
        signal,
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        throw new AIProviderHttpError(`Anthropic ${res.status}: ${errText}`, res.status, parseRetryAfterMs(res.headers?.get?.('Retry-After')))
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let finishReason: AIFinishReason | undefined
      let stopReason: string | undefined
      let refusal = ''
      let promptTokens: number | undefined
      let completionTokens: number | undefined
      const parser = createParser((ev: ParseEvent) => {
        if (ev.type !== 'event') return
        try {
          const json = JSON.parse(ev.data)
          if (ev.event === 'content_block_delta') {
            const delta = json.delta ?? {}
            const chunk = delta.text
            if (typeof chunk === 'string' && chunk.length > 0) {
              content += chunk
              onDelta(chunk)
            }
            const refusalChunk = delta.refusal ?? delta.reason
            if (typeof refusalChunk === 'string' && refusalChunk.length > 0) {
              refusal += refusalChunk
              finishReason = 'refusal'
              stopReason = 'refusal'
            }
          } else if (ev.event === 'message_start') {
            const n = Number(json.message?.usage?.input_tokens)
            if (Number.isFinite(n)) promptTokens = n
          } else if (ev.event === 'message_delta') {
            const rawStop = json.delta?.stop_reason
            if (typeof rawStop === 'string' && !refusal) {
              stopReason = rawStop
              finishReason = normalizeAIFinishReason(rawStop)
            }
            const n = Number(json.usage?.output_tokens)
            if (Number.isFinite(n)) completionTokens = n
          } else if (ev.event === 'error') {
            const rawError = json.error?.type ?? json.type
            if (typeof rawError === 'string') {
              stopReason = rawError
              finishReason = 'error'
            }
          } else if (ev.event === 'message_stop' && !finishReason) {
            // Older Anthropic gateways omit message_delta.stop_reason but
            // still emit message_stop; treat a clean stream close as stop.
            stopReason = 'stop'
            finishReason = 'stop'
          }
        } catch (e) {
          console.debug('[anthropic] skipping unparseable SSE event', e)
        }
      })
      await consumeStream(
        reader,
        decoder,
        (chunk) => parser.feed(chunk),
        signal,
      )
      if (!signal?.aborted) {
        const decoderTail = decoder.decode()
        if (decoderTail) parser.feed(decoderTail)
      }
      const usage =
        promptTokens !== undefined || completionTokens !== undefined
          ? {
              promptTokens: promptTokens ?? 0,
              completionTokens: completionTokens ?? 0,
            }
          : undefined
      return {
        content,
        ...(usage ? { usage } : {}),
        ...(finishReason ? { finishReason } : {}),
        ...(stopReason ? { stopReason } : {}),
        ...(refusal ? { refusal } : {}),
      }
    },
    async testConnection(signal) {
      const t0 = performance.now()
      try {
        const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': cfg.apiKey,
            'anthropic-version': '2023-06-09',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: cfg.model,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal,
        })
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
        await res.json()
        return { ok: true, latencyMs: Math.round(performance.now() - t0) }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  }
}
