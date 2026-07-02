/**
 * ask-history — /ask 全局对话历史的 localStorage 持久化(单全局 key,不分画布)。
 *
 * 镜像 companion-chat-history 的范式(SSR-safe / quota-safe / streaming 复活守卫),
 * 但 key 是全局单例(/ask 不按画布分,跟 companion 的 per-canvas 区别在此)。
 * 提取成纯函数模块便于单测(见 __tests__/ask-history.test.ts)。
 */
import type { CanvasId } from '@cys-stift/domain'

/** /ask 持久化的消息契约(含 targetCanvasId,确认门 reload 后仍落对画布)。 */
export interface PersistedAskMessage {
  role: 'user' | 'assistant'
  content: string
  dslBlocks?: string[]
  streaming?: boolean
  targetCanvasId?: CanvasId
}

export const ASK_CHAT_KEY = 'cys-stift.ask-chat.v1'

/** 读取 /ask 对话历史。SSR / 无 key / parse 失败 → 返回空数组(绝不抛)。 */
export function loadAskHistory(): PersistedAskMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ASK_CHAT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 宽松校验:只留形如 { role, content } 的项,丢弃畸形数据(防坏数据炸 UI)。
    const filtered = parsed.filter(
      (m): m is PersistedAskMessage =>
        m != null &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
    // 流式 flag 复活守卫:持久化的 streaming 永远陈旧(reload 后 stream 早已死,不该再显流式光标)。
    return filtered.map((m) => (m.streaming === true ? { ...m, streaming: false } : m))
  } catch {
    return []
  }
}

/** 写入 /ask 对话历史(封顶最近 100 条)。quota 超 / 异常 → 静默跳过。返回 true=写入成功。 */
export function saveAskHistory(messages: PersistedAskMessage[]): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(ASK_CHAT_KEY, JSON.stringify(messages.slice(-100)))
    return true
  } catch {
    // QuotaExceededError 或隐私模式禁用 storage —— 跳过,不阻塞对话。
    return false
  }
}

/** 清空 /ask 对话历史。SSR / 异常静默。 */
export function clearAskHistory(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ASK_CHAT_KEY)
  } catch {
    // 隐私模式禁用 storage 等 —— 跳过
  }
}
