'use client'

/**
 * M3.3 — OpenAI chat completions provider. Uses the `/v1/chat/completions`
 * endpoint with `stream: true`. SSE format: `data: {json}\n\n` terminated by
 * `data: [DONE]`. We hand-roll the SSE parser (per-line buffer + JSON parse)
 * because the data format is simple and we want the accumulator visible.
 */

import {
  AIProviderHttpError,
  normalizeAIFinishReason,
  parseRetryAfterMs,
  type AIFinishReason,
  type AIProvider,
  type AIRequest,
  type AIResponse,
} from '../types'
import { consumeStream } from './stream-reader'

interface OpenAIConfig {
  apiKey: string
  baseUrl: string
  model: string
}

/**
 * 是否为 DeepSeek 系端点(需关思考)。纯函数,可单测。
 *
 * 检测逻辑(拓宽):Volcano / SiliconFlow / 其他 DeepSeek 镜像走非 deepseek.com 域名,
 * 但模型名仍是 deepseek-chat / deepseek-reasoner / deepseek-v3 / deepseek-v4 等。
 * 只靠 baseUrl 域名正则会漏掉这些镜像 → thinking:disabled 不发 → 思考吃光 token →
 * DSL 截断。改为 baseUrl OR model 任一含 deepseek(大小写不敏感)即判定。
 */
export function isDeepSeekEndpoint(baseUrl: string, model: string): boolean {
  return /deepseek/i.test(baseUrl) || /deepseek/i.test(model)
}

export function createOpenAIProvider(cfg: OpenAIConfig): AIProvider {
  const jsonSchemaResponse = /^https:\/\/api\.openai\.com(?:\/|$)/i.test(cfg.baseUrl)
  return {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    capabilities: { jsonSchemaResponse },
    async streamText(req, onDelta, signal) {
      // 结构化输出任务(排版/cluster/关系推荐):对支持「思考模式」的 OpenAI 兼容
      // 端点(DeepSeek 及其镜像)发 thinking:disabled,避免思考吃光 token 导致 DSL
      // 输出被截断(实测根因)。真正的 OpenAI 端点不认此字段 → 只对 deepseek 端点发,
      // 其他端点 no-op,不破坏兼容。思考是 DeepSeek 专有扩展,靠 isDeepSeekEndpoint
      // 检测(baseUrl OR model,见下方纯函数)而非 provider id(DeepSeek 走 openai provider)。
      const isDeepSeek = isDeepSeekEndpoint(cfg.baseUrl, cfg.model)
      const extraBody =
        req.structuredOutput && isDeepSeek ? { thinking: { type: 'disabled' } } : {}
      const responseFormat = req.responseSchema && jsonSchemaResponse
        ? { response_format: { type: 'json_schema', json_schema: { name: req.responseSchema.name, strict: req.responseSchema.strict ?? true, schema: req.responseSchema.schema } } }
        : {}
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: req.messages
            ? [{ role: 'system', content: req.system }, ...req.messages]
            : [
                { role: 'system', content: req.system },
                { role: 'user', content: req.user },
              ],
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.7,
          stream: true,
          ...extraBody,
          ...responseFormat,
        }),
        signal,
      })
      if (!res.ok || !res.body) {
        throw new AIProviderHttpError(
          openAiErrorMessage(res.status, await res.text().catch(() => '')),
          res.status,
          parseRetryAfterMs(res.headers?.get?.('Retry-After')),
        )
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let buffer = ''
      let finishReason: AIFinishReason | undefined
      let stopReason: string | undefined
      let refusal = ''
      let usage: AIResponse['usage'] | undefined

      const processLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]' || data === '') return
        try {
          const json = JSON.parse(data)
          const choice = json.choices?.[0]
          const rawFinish = choice?.finish_reason
          if (typeof rawFinish === 'string' && !refusal) {
            stopReason = rawFinish
            finishReason = normalizeAIFinishReason(rawFinish)
          }
          const refusalChunk = choice?.delta?.refusal ?? choice?.message?.refusal
          if (typeof refusalChunk === 'string' && refusalChunk.length > 0) {
            refusal += refusalChunk
            // Some OpenAI-compatible endpoints provide refusal text without a
            // separate finish_reason. Treat the signal as authoritative.
            finishReason = 'refusal'
            stopReason = 'refusal'
          }
          const delta = choice?.delta?.content
          if (typeof delta === 'string' && delta.length > 0) {
            content += delta
            onDelta(delta)
          }
          const u = json.usage
          if (u && typeof u === 'object') {
            const promptTokens = Number(u.prompt_tokens)
            const completionTokens = Number(u.completion_tokens)
            if (Number.isFinite(promptTokens) || Number.isFinite(completionTokens)) {
              usage = {
                promptTokens: Number.isFinite(promptTokens) ? promptTokens : usage?.promptTokens ?? 0,
                completionTokens: Number.isFinite(completionTokens) ? completionTokens : usage?.completionTokens ?? 0,
              }
            }
          }
        } catch (e) {
          // Partial JSON mid-stream is normal (a line split across
          // chunks is held in buffer); a genuinely malformed line is
          // rare — log at debug rather than swallow silently.
          console.debug('[openai] skipping unparseable SSE line', e)
        }
      }
      await consumeStream(
        reader,
        decoder,
        (chunk) => {
          buffer += chunk
          const lines = buffer.split('\n')
          // Keep the trailing partial line in the buffer; emit full lines.
          buffer = lines.pop() ?? ''
          for (const line of lines) processLine(line)
        },
        signal,
      )
      // A few OpenAI-compatible gateways omit the final newline. Process the
      // residual line after the reader closes, but never emit post-abort data.
      if (!signal?.aborted) {
        const decoderTail = decoder.decode()
        if (decoderTail) buffer += decoderTail
      }
      if (!signal?.aborted && buffer) processLine(buffer)
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
