/**
 * retryUntilValid — DSL 产出的自动重试闭环。
 *
 * AI 出坏 DSL 时,把 parse 的结构化错误喂回模型重试,而非 toast+fail / 用户手动重打。
 * retryUntilValid 拥有 messages 数组管理(每次失败追加 assistant 坏输出 + user 修正);
 * produce 无状态(给 messages → 返 content)。maxAttempts 默认 3。
 *
 * 两路径差异(canvas 单 shot 无 fence / ask 多轮 fenced)由各 call site 的 produce/
 * initialMessages 装配;retry 核心在此共享。
 */
import {
  normalizeAIFinishReason,
  type AIFinishReason,
} from './types'
import type { DslDiagnostic } from '@cys-stift/dsl'

export interface RetryMessage {
  role: 'user' | 'assistant'
  content: string
}
export interface RetryResult {
  text: string
  attempts: number
  accepted: boolean
  lastErrors?: DslDiagnostic[]
  /** Provider metadata from the last generation. */
  finishReason?: AIFinishReason
  stopReason?: string
  refusal?: string
  /** Why the retry loop stopped without an accepted result. */
  failureReason?: RetryFailureReason
}

export type RetryFailureReason =
  | 'truncated' | 'refusal' | 'content_filter' | 'network'
  | 'auth' | 'rate_limit' | 'model' | 'invalid'

/** Terminal provider failures that must not open a misleading format-retry UI. */
export function isTerminalRetryFailure(
  reason: RetryFailureReason | undefined,
): reason is 'truncated' | 'refusal' | 'content_filter' | 'network' | 'auth' | 'rate_limit' | 'model' {
  return reason === 'truncated' || reason === 'refusal' || reason === 'content_filter' ||
    reason === 'network' || reason === 'auth' || reason === 'rate_limit' || reason === 'model'
}

/** i18n keys for terminal failures; keeps all AI entry points on one vocabulary. */
export type RetryFailureMessageKey =
  | 'ai.outputTruncated'
  | 'ai.outputRefused'
  | 'ai.outputFiltered'
  | 'ai.outputNetwork'
  | 'ai.errorAuth'
  | 'ai.errorRateLimit'
  | 'ai.errorModel'

export function retryFailureMessageKey(reason: RetryFailureReason | undefined): RetryFailureMessageKey | undefined {
  switch (reason) {
    case 'truncated': return 'ai.outputTruncated'
    case 'refusal': return 'ai.outputRefused'
    case 'content_filter': return 'ai.outputFiltered'
    case 'network': return 'ai.outputNetwork'
    case 'auth': return 'ai.errorAuth'
    case 'rate_limit': return 'ai.errorRateLimit'
    case 'model': return 'ai.errorModel'
    default: return undefined
  }
}

/** Metadata-preserving alternative to the legacy string producer result. */
export interface RetryGeneration {
  content: string
  finishReason?: AIFinishReason
  stopReason?: string
  refusal?: string
}

export type RetryOutput = string | RetryGeneration
export interface RetryOptions {
  initialMessages: RetryMessage[]
  /**
   * 给 messages 调 streamText。旧调用方可继续返回 string；AI provider
   * 调用方应返回 `{content, finishReason, stopReason, refusal}` 以便区分
   * 截断/拒答与普通解析错误。attempt=0 首次(可流式),>0 重试(静默)。
   */
  produce: (messages: RetryMessage[], attempt: number) => Promise<RetryOutput>
  parse: (text: string) => { ok: boolean; errors: DslDiagnostic[] }
  buildCorrection: (errors: DslDiagnostic[]) => string
  maxAttempts?: number
}

export async function retryUntilValid(opts: RetryOptions): Promise<RetryResult> {
  const max = opts.maxAttempts ?? 3
  let messages = [...opts.initialMessages]
  let lastText = ''
  let lastErrors: DslDiagnostic[] | undefined
  let lastFinishReason: AIFinishReason | undefined
  let lastStopReason: string | undefined
  let lastRefusal: string | undefined
  let sawNetworkError = false
  let sawHttpStatus: number | undefined
  let sawTimeout = false
  let stopAttempt = max // 确定性失败 break 时记录实际 attempt(默认满打 max)
  for (let attempt = 0; attempt < max; attempt++) {
    let generation: RetryGeneration
    try {
      const output = await opts.produce(messages, attempt)
      generation =
        typeof output === 'string'
          ? { content: output }
          : output && typeof output === 'object'
            ? output
            : { content: '' }
    } catch (err) {
      // 用户取消(AbortError)→ 立即冒出,不重试。
      // 注意:DOMException 不继承 Error,不能用 instanceof Error 守卫(真实 streamText
      // abort 抛 DOMException)。按 name 判定,与 use-ai-action.ts 的范式一致。
      if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') throw err
      // 确定性失败(重试也不会变好):HTTP 状态错误与超时。立即终止循环而非重试
      // —— 401/429/500 重试 3× 白打请求且把错误类别全归成"网络错"(用户 key 错/
      // 限流却去查网络),超时重试 3× 把 60s 放大到 ~180s 页面不可用
      // (对抗测试 R3-D13 P2)。终止后 failureReason 映射正确文案,4 个调用方的
      // retryFailureMessageKey 自动生效。
      const name = (err as { name?: string })?.name
      const status = (err as { status?: number })?.status
      if (name === 'AIProviderHttpError' && typeof status === 'number') {
        sawHttpStatus = status
        stopAttempt = attempt + 1
        break
      }
      if (name === 'TimeoutError') {
        sawTimeout = true
        stopAttempt = attempt + 1
        break
      }
      // 真正的瞬时网络错(非 HTTP 状态、非超时)→ 计入 attempt,重试同 messages
      // (非 AI 输出错,不喂 correction)。
      console.warn('[retry-until-valid] network error, retrying', err)
      sawNetworkError = true
      continue
    }
    const text = typeof generation.content === 'string' ? generation.content : ''
    lastText = text
    lastFinishReason = generation.finishReason ?? normalizeAIFinishReason(generation.stopReason)
    lastStopReason = generation.stopReason
    lastRefusal = generation.refusal
    const { ok, errors } = opts.parse(text)
    lastErrors = errors

    // A length/refusal/content-filter response cannot be repaired by sending
    // the same request again. Stop now even if a permissive parser happened
    // to accept the partial text (for example, free-form Q&A). This prevents
    // silently presenting a truncated answer as complete.
    const terminalFailure =
      lastRefusal || lastFinishReason === 'refusal'
        ? 'refusal'
        : lastFinishReason === 'content_filter'
          ? 'content_filter'
          : lastFinishReason === 'length'
            ? 'truncated'
            : undefined
    if (terminalFailure) {
      return {
        text,
        attempts: attempt + 1,
        accepted: false,
        lastErrors,
        ...(lastFinishReason ? { finishReason: lastFinishReason } : {}),
        ...(lastStopReason ? { stopReason: lastStopReason } : {}),
        ...(lastRefusal ? { refusal: lastRefusal } : {}),
        failureReason: terminalFailure,
      }
    }
    if (ok) {
      return {
        text,
        attempts: attempt + 1,
        accepted: true,
        ...(lastFinishReason ? { finishReason: lastFinishReason } : {}),
        ...(lastStopReason ? { stopReason: lastStopReason } : {}),
        ...(lastRefusal ? { refusal: lastRefusal } : {}),
      }
    }
    if (attempt < max - 1) {
      messages = [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: opts.buildCorrection(errors) },
      ]
    }
  }
  return {
    text: lastText,
    attempts: stopAttempt,
    accepted: false,
    ...(lastErrors ? { lastErrors } : {}),
    ...(lastFinishReason ? { finishReason: lastFinishReason } : {}),
    ...(lastStopReason ? { stopReason: lastStopReason } : {}),
    ...(lastRefusal ? { refusal: lastRefusal } : {}),
    failureReason: terminalFailureReason(sawHttpStatus, sawTimeout, sawNetworkError, lastText),
  }
}

/**
 * 失败原因归类(R3-D13 P2 修复):HTTP 状态错误按 status 映射到用户可自救的
 * 类别(401/403→key、429→限流、404→模型),其余(5xx/超时/瞬时网络)归网络。
 * 旧行为把一切非 AbortError 都归 'network' → 401/429 显示成"检查网络"误导排查。
 */
function terminalFailureReason(
  sawHttpStatus: number | undefined,
  sawTimeout: boolean,
  sawNetworkError: boolean,
  lastText: string,
): RetryFailureReason {
  if (sawHttpStatus !== undefined) {
    if (sawHttpStatus === 401 || sawHttpStatus === 403) return 'auth'
    if (sawHttpStatus === 429) return 'rate_limit'
    if (sawHttpStatus === 404) return 'model'
    return 'network'
  }
  if (sawTimeout) return 'network'
  return sawNetworkError && !lastText ? 'network' : 'invalid'
}

/** 把 parse 错误格式化成模型可理解的修正提示(英文,给模型看不是用户)。取前 8 条防膨胀。 */
export function buildDslCorrection(errors: DslDiagnostic[]): string {
  const list = errors
    .slice(0, 8)
    .map((e) => `Line ${e.line}: "${e.text}" — ${e.message}`)
    .join('\n')
  return `Your previous output was invalid cys-dsl. Fix these errors and regenerate the FULL output (same format, ONLY dsl directives):\n${list}\nMost common cause: @title/@content/@code/@quote are string literals — never embed \`\`\` inside them (it breaks the cys-dsl fence), and escape " as \\" , \\ as \\\\ , newline as \\n , backtick as \\\` .`
}

export function buildIntentCorrection(errors: DslDiagnostic[]): string {
  const list = errors.slice(0, 8).map((error) => `${error.text || '$'}: ${error.message}`).join('\n')
  return `Your previous output was invalid CYS Intent IR v1. Fix these errors and regenerate the FULL JSON object. Return JSON only, without prose or markdown fences:\n${list}`
}
