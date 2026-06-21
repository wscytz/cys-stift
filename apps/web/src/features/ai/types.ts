'use client'

/**
 * M3.3 — AI provider types. Mirrors AFFiNE's CopilotProvider interface
 * (ProviderFactory.register/get/list) but simplified to a Maker pattern:
 * the factory stores `(cfg) => AIProvider` closures, not provider instances,
 * because OpenAI/Anthropic require apiKey baked into the instance.
 *
 * Stream protocol is opaque to consumers — they only see deltas via the
 * onDelta callback. Each provider handles its own SSE/NDJSON parsing
 * internally (OpenAI: hand-rolled SSE; Anthropic: eventsource-parser;
 * Ollama: NDJSON).
 */

export type ProviderId = 'openai' | 'anthropic' | 'ollama'

export interface AIRequest {
  system: string
  user: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export interface AIResponse {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
}

export interface AIProvider {
  readonly id: ProviderId
  readonly name: string
  readonly defaultBaseUrl: string
  readonly defaultModel: string
  readonly models: readonly string[]
  streamText(
    req: AIRequest,
    onDelta: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<AIResponse>
  testConnection(
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; latencyMs?: number; error?: string }>
}

export interface AIConfig {
  provider: ProviderId
  apiKey: string
  baseUrl: string
  model: string
  enabled: boolean
}

/** Maker closure — factory stores these, not instances, because each
 *  provider bakes the API key (or local baseUrl) into its instance. */
export type AIProviderMaker = (cfg: AIConfig) => AIProvider | null