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
import type { DslDiagnostic } from './dsl-parser'

export interface RetryMessage {
  role: 'user' | 'assistant'
  content: string
}
export interface RetryResult {
  text: string
  attempts: number
  accepted: boolean
  lastErrors?: DslDiagnostic[]
}
export interface RetryOptions {
  initialMessages: RetryMessage[]
  /** 给 messages 调 streamText 返回 content。attempt=0 首次(可流式),>0 重试(静默)。 */
  produce: (messages: RetryMessage[], attempt: number) => Promise<string>
  parse: (text: string) => { ok: boolean; errors: DslDiagnostic[] }
  buildCorrection: (errors: DslDiagnostic[]) => string
  maxAttempts?: number
}

export async function retryUntilValid(opts: RetryOptions): Promise<RetryResult> {
  const max = opts.maxAttempts ?? 3
  let messages = [...opts.initialMessages]
  let lastText = ''
  let lastErrors: DslDiagnostic[] | undefined
  for (let attempt = 0; attempt < max; attempt++) {
    let text: string
    try {
      text = await opts.produce(messages, attempt)
    } catch (err) {
      // 用户取消(AbortError)→ 立即冒出,不重试。
      // 注意:DOMException 不继承 Error,不能用 instanceof Error 守卫(真实 streamText
      // abort 抛 DOMException)。按 name 判定,与 use-ai-action.ts 的范式一致。
      if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') throw err
      // 网络错(非取消)→ 计入 attempt,重试同 messages(非 AI 输出错,不喂 correction)。
      console.warn('[retry-until-valid] network error, retrying', err)
      continue
    }
    lastText = text
    const { ok, errors } = opts.parse(text)
    if (ok) return { text, attempts: attempt + 1, accepted: true }
    lastErrors = errors
    if (attempt < max - 1) {
      messages = [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: opts.buildCorrection(errors) },
      ]
    }
  }
  return { text: lastText, attempts: max, accepted: false, lastErrors }
}

/** 把 parse 错误格式化成模型可理解的修正提示(英文,给模型看不是用户)。取前 8 条防膨胀。 */
export function buildDslCorrection(errors: DslDiagnostic[]): string {
  const list = errors
    .slice(0, 8)
    .map((e) => `Line ${e.line}: "${e.text}" — ${e.message}`)
    .join('\n')
  return `Your previous output was invalid cys-dsl. Fix these errors and regenerate the FULL output (same format, ONLY dsl directives):\n${list}`
}

export function buildIntentCorrection(errors: DslDiagnostic[]): string {
  const list = errors.slice(0, 8).map((error) => `${error.text || '$'}: ${error.message}`).join('\n')
  return `Your previous output was invalid CYS Intent IR v1. Fix these errors and regenerate the FULL JSON object. Return JSON only, without prose or markdown fences:\n${list}`
}
