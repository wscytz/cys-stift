'use client'

/**
 * M3.3 — Ollama local provider. Hits the Ollama daemon at `baseUrl` (default
 * `http://localhost:11434`). Uses `/api/chat` with `stream: true`.
 *
 * CRITICAL: Ollama streams NDJSON, not SSE. Each line is a complete JSON
 * object, terminated by a line where `done: true`. We split the stream on
 * `\n` (not `\n\n` like SSE) and JSON.parse each line.
 *
 * Ollama's daemon blocks cross-origin requests by default — the UI prompts
 * the user to start it with `OLLAMA_ORIGINS=*` (or set the env in their
 * service file). The testConnection helper surfaces this hint in its
 * error message so users don't get a silent failure.
 */

import {
  normalizeAIFinishReason,
  type AIFinishReason,
  type AIProvider,
  type AIRequest,
  type AIResponse,
} from '../types'
import { consumeStream } from './stream-reader'

interface OllamaConfig {
  baseUrl: string
  model: string
}

export function createOllamaProvider(cfg: OllamaConfig): AIProvider {
  return {
    id: 'ollama',
    name: 'Ollama (local)',
    defaultBaseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2:3b',
    models: ['llama3.2:3b', 'llama3.1:8b', 'qwen2.5:7b', 'phi-3.5:3.8b'],
    async streamText(req, onDelta, signal) {
      const res = await fetch(`${cfg.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages: req.messages
            ? [{ role: 'system', content: req.system }, ...req.messages]
            : [
                { role: 'system', content: req.system },
                { role: 'user', content: req.user },
              ],
          stream: true,
          options: {
            num_predict: req.maxTokens ?? 1024,
            temperature: req.temperature ?? 0.7,
          },
        }),
        signal,
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Ollama ${res.status}: ${errText}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let buffer = ''
      let finishReason: AIFinishReason | undefined
      let stopReason: string | undefined
      let refusal = ''
      let promptTokens: number | undefined
      let completionTokens: number | undefined

      const processLine = (line: string) => {
        if (!line.trim()) return
        try {
          const json = JSON.parse(line)
          const delta = json.message?.content
          if (typeof delta === 'string' && delta.length > 0) {
            content += delta
            onDelta(delta)
          }
          const refusalChunk = json.message?.refusal ?? json.refusal
          if (typeof refusalChunk === 'string' && refusalChunk.length > 0) {
            refusal += refusalChunk
            finishReason = 'refusal'
            stopReason = 'refusal'
          }
          const rawDoneReason = json.done_reason
          if (typeof rawDoneReason === 'string' && !refusal) {
            stopReason = rawDoneReason
            finishReason = normalizeAIFinishReason(rawDoneReason)
          } else if (json.done === true) {
            // Older Ollama versions only expose `done: true`.
            stopReason ??= 'stop'
            finishReason ??= 'stop'
          }
          const prompt = Number(json.prompt_eval_count)
          const completion = Number(json.eval_count)
          if (Number.isFinite(prompt)) promptTokens = prompt
          if (Number.isFinite(completion)) completionTokens = completion
        } catch (e) {
          console.debug('[ollama] skipping unparseable NDJSON line', e)
        }
      }
      await consumeStream(
        reader,
        decoder,
        (chunk) => {
          buffer += chunk
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) processLine(line)
        },
        signal,
      )
      if (!signal?.aborted) {
        const decoderTail = decoder.decode()
        if (decoderTail) buffer += decoderTail
      }
      if (!signal?.aborted && buffer) processLine(buffer)
      const usage: AIResponse['usage'] | undefined =
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
        // /api/tags lists installed models — cheap health check that also
        // validates the model name the user configured.
        const res = await fetch(`${cfg.baseUrl}/api/tags`, { signal })
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
        const json = await res.json()
        const models: string[] = (json.models ?? []).map(
          (m: { name: string }) => m.name,
        )
        if (!models.includes(cfg.model)) {
          return {
            ok: false,
            error: `Model "${cfg.model}" not found. Run: ollama pull ${cfg.model}`,
          }
        }
        return { ok: true, latencyMs: Math.round(performance.now() - t0) }
      } catch (e) {
        return {
          ok: false,
          error: `${(e as Error).message} (Start Ollama + set OLLAMA_ORIGINS=*)`,
        }
      }
    },
  }
}
