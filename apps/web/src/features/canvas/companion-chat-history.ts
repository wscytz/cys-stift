/**
 * companion-chat-history — 对话历史的 localStorage 持久化(per-canvas)。
 *
 * 设计:
 *  - key 按 canvasId 隔离 —— 每个画布有自己的对话上下文。
 *  - SSR-safe:getItem 在 typeof window === 'undefined' 时返回空(静态导出,
 *    'use client' 但 Next 仍可能预渲染,守卫一把)。
 *  - quota-safe:setItem 抛 QuotaExceeded 时 catch + 不崩(对话内容含 DSL 块可能较大)。
 *
 * 提取成纯函数模块便于单测(见 __tests__/companion-chat-history.test.ts)。
 */
import type { CanvasId } from '@cys-stift/domain'

/** 对话历史条目的最小契约(只持久化 UI 历史需要的字段;streaming 也会写,无妨)。 */
export interface PersistedChatMessage {
  role: 'user' | 'assistant'
  content: string
  dslBlocks?: string[]
  streaming?: boolean
}

const KEY_PREFIX = 'cys-stift.companion-chat.'
const KEY_SUFFIX = '.v1'

/** 构造 per-canvas 的 localStorage key。 */
export function chatHistoryKey(canvasId: CanvasId): string {
  return `${KEY_PREFIX}${String(canvasId)}${KEY_SUFFIX}`
}

/**
 * 读取某画布的对话历史。SSR / 无 key / parse 失败 → 返回空数组(绝不抛)。
 */
export function loadChatHistory(canvasId: CanvasId): PersistedChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(chatHistoryKey(canvasId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 宽松校验:只留形如 { role, content } 的项,丢弃畸形数据(防坏数据炸 UI)。
    const filtered = parsed.filter(
      (m): m is PersistedChatMessage =>
        m != null &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
    // 流式 flag 复活守卫:若上次保存发生在流式中途(debounce 400ms 可能在 streaming:true
    // 时触发),persisted 会带 streaming:true。reload 后那条消息会永远显示流式光标 ▋
    // (stream 早已随页面卸载而死)。加载时把 streaming:true 清为 false —— 持久化的
    // streaming 永远是陈旧的;无该字段的消息不动(保 round-trip 形状)。
    return filtered.map((m) => (m.streaming === true ? { ...m, streaming: false } : m))
  } catch {
    return []
  }
}

/**
 * 写入某画布的对话历史。quota 超 / 任何存储异常 → 静默跳过(不崩聊天)。
 * 返回 true=写入成功,false=跳过(调用方可忽略)。
 */
export function saveChatHistory(canvasId: CanvasId, messages: PersistedChatMessage[]): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(chatHistoryKey(canvasId), JSON.stringify(messages))
    return true
  } catch {
    // QuotaExceededError 或隐私模式禁用 storage —— 跳过,不阻塞对话。
    return false
  }
}
