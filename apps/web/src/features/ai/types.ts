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
  /**
   * 多轮对话历史(可选)。提供时 provider 用 [system, ...messages] 替代单轮 system+user ——
   * 让 AI 有上下文记忆(/ask agent 的多轮)。role 仅 user/assistant(system 走 req.system 顶级)。
   * 不提供时(卡片动作/排版/cluster 等单轮任务)保持 system+user 向后兼容。
   */
  messages?: { role: 'user' | 'assistant'; content: string }[]
  model?: string
  maxTokens?: number
  temperature?: number
  /**
   * 结构化输出任务标志(排版 DSL / cluster 分组 / 关系候选推荐等)。
   *
   * 设 true 时,provider 会尽量抑制模型的「思考/推理」模式 —— 思考模式会吃掉
   * 大量 token(实测 DeepSeek-v4 思考把 1024~4096 token 全花在 reasoning,DSL
   * 输出 0 字 → 排版「未生效」),且让输出随机偷懒(只改部分卡)。结构化任务
   * 不需要推理,关掉思考后:不截断、省 ~75% token、快 2-3 倍、输出更完整。
   *
   * 实现是 provider 特定的(DeepSeek 走 thinking:disabled;OpenAI/Claude 无此
   * 字段则 no-op),非思考模型 no-op。不破坏现有兼容性。
   */
  structuredOutput?: boolean
  /**
   * 单次请求超时(ms)。不传则用 streamText 的 DEFAULT_TIMEOUT_MS(30s)。
   * 重型 DSL 产出任务(排版/cluster/对话 agent)产出长,传 60_000 防止中途
   * 因默认 30s 截断而输出不全;短任务(关系推荐/总结)留默认即可。
   */
  timeoutMs?: number
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
  /** Optional sampling temperature override (Task 2 default applies when unset). */
  temperature?: number
  /** Optional max output tokens override (Task 2 default applies when unset). */
  maxTokens?: number
}

/** Maker closure — factory stores these, not instances, because each
 *  provider bakes the API key (or local baseUrl) into its instance. */
export type AIProviderMaker = (cfg: AIConfig) => AIProvider | null