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
import type { AIProvider, AIRequest, AIResponse } from '../types'

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
          messages: [{ role: 'user', content: req.user }],
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.7,
          stream: true,
        }),
        signal,
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Anthropic ${res.status}: ${errText}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let content = ''
      const parser = createParser((ev: ParseEvent) => {
        if (ev.type !== 'event') return
        if (ev.event !== 'content_block_delta') return
        try {
          const json = JSON.parse(ev.data)
          const chunk = json.delta?.text
          if (chunk) {
            content += chunk
            onDelta(chunk)
          }
        } catch {
          /* skip */
        }
      })
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value, { stream: true }))
      }
      return { content }
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