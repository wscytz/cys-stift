'use client'

/**
 * M3.3 — OpenAI chat completions provider. Uses the `/v1/chat/completions`
 * endpoint with `stream: true`. SSE format: `data: {json}\n\n` terminated by
 * `data: [DONE]`. We hand-roll the SSE parser (per-line buffer + JSON parse)
 * because the data format is simple and we want the accumulator visible.
 */

import type { AIProvider, AIRequest, AIResponse } from '../types'

interface OpenAIConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export function createOpenAIProvider(cfg: OpenAIConfig): AIProvider {
  return {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    async streamText(req, onDelta, signal) {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.7,
          stream: true,
        }),
        signal,
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        throw new Error(`OpenAI ${res.status}: ${errText}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the trailing partial line in the buffer; emit full lines.
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const chunk = json.choices?.[0]?.delta?.content
            if (chunk) {
              content += chunk
              onDelta(chunk)
            }
          } catch {
            /* skip partial JSON */
          }
        }
      }
      return { content }
    },
    async testConnection(signal) {
      const t0 = performance.now()
      try {
        const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: cfg.model,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
            stream: false,
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