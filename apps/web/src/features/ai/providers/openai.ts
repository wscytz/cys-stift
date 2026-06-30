'use client'

/**
 * M3.3 — OpenAI chat completions provider. Uses the `/v1/chat/completions`
 * endpoint with `stream: true`. SSE format: `data: {json}\n\n` terminated by
 * `data: [DONE]`. We hand-roll the SSE parser (per-line buffer + JSON parse)
 * because the data format is simple and we want the accumulator visible.
 */

import type { AIProvider, AIRequest, AIResponse } from '../types'
import { consumeStream } from './stream-reader'

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
      // 结构化输出任务(排版/cluster/关系推荐):对支持「思考模式」的 OpenAI 兼容
      // 端点(DeepSeek)发 thinking:disabled,避免思考吃光 token 导致 DSL 输出被
      // 截断(实测根因)。真正的 OpenAI 端点不认此字段 → 只对 deepseek baseUrl 发,
      // 其他端点 no-op,不破坏兼容。思考是 DeepSeek 专有扩展,靠 baseUrl 检测而非
      // provider id(DeepSeek 走 openai provider)。
      const isDeepSeek = /(^|\.)deepseek\.com/.test(cfg.baseUrl)
      const extraBody =
        req.structuredOutput && isDeepSeek ? { thinking: { type: 'disabled' } } : {}
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
          ...extraBody,
        }),
        signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(openAiErrorMessage(res.status, await res.text().catch(() => '')))
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let buffer = ''
      await consumeStream(
        reader,
        decoder,
        (chunk) => {
          buffer += chunk
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
              const delta = json.choices?.[0]?.delta?.content
              if (delta) {
                content += delta
                onDelta(delta)
              }
            } catch (e) {
              // Partial JSON mid-stream is normal (a line split across
              // chunks is held in buffer); a genuinely malformed line is
              // rare — log at debug rather than swallow silently.
              console.debug('[openai] skipping unparseable SSE line', e)
            }
          }
        },
        signal,
      )
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
        if (!res.ok) {
          return { ok: false, error: openAiErrorMessage(res.status, await res.text().catch(() => '')) }
        }
        await res.json()
        return { ok: true, latencyMs: Math.round(performance.now() - t0) }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  }
}

/**
 * 把 OpenAI 兼容端点的错误响应解析成用户可读消息。这些端点(OpenAI / DeepSeek /
 * 其他兼容)错误体通常是 `{error:{message, type, code}}`。直接抛整段 JSON 对用户
 * 不友好(一堆转义符)。提取 message + 按 status 给中文提示。
 */
function openAiErrorMessage(status: number, body: string): string {
  let apiMsg = ''
  try {
    const parsed = JSON.parse(body)
    apiMsg = parsed?.error?.message ?? ''
  } catch {
    apiMsg = body.slice(0, 200)
  }
  // 常见 status 的友好提示(覆盖用户最常踩的:key 错 / 限额 / 模型名错)。
  if (status === 401) return `API key 无效或未授权(${apiMsg || 'authentication failed'})`
  if (status === 403) return `无访问权限(${apiMsg || 'forbidden'})`
  if (status === 404) return `端点或模型不存在 — 检查 baseUrl 和 model(${apiMsg || 'not found'})`
  if (status === 429) return `请求过频或额度用尽(${apiMsg || 'rate limited'})`
  return `OpenAI ${status}: ${apiMsg || body.slice(0, 120)}`
}