/**
 * conversation-store — 统一 per-canvas 对话 store(/ask + companion 共用)。
 *
 * 泛化自旧 companion-chat-history:SSR-safe / quota-safe / streaming 复活守卫 +
 * lazy 迁移旧 companion v1 + 旧 ask 全局(按 targetCanvasId 拆)。
 *
 * - key 按 canvasId 隔离 —— 每个画布有自己的对话上下文。
 * - SSR-safe:getItem 在 typeof window === 'undefined' 时返回空(静态导出,
 *   'use client' 但 Next 仍可能预渲染,守卫一把)。
 * - quota-safe:setItem 抛 QuotaExceeded 时 catch + 不崩(对话内容含 DSL 块可能较大)。
 * - streaming 复活守卫:持久化的 streaming:true 永远陈旧(reload 后 stream 已死),
 *   加载时清为 false。
 *
 * Task 2/3 已把 companion-chat.tsx + ask/page.tsx 切到这个 store,并删除了旧
 * companion-chat-history.ts / ask-history.ts(本 store 的 migrateLegacy 直接读
 * 旧 key 字符串,不依赖旧模块)。
 */
import type { CanvasId } from '@cys-stift/domain'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'

/** 持久化的对话消息(无 targetCanvasId —— per-canvas key 已隔离画布)。 */
export interface PersistedConversationMessage {
  role: 'user' | 'assistant'
  content: string
  dslBlocks?: string[]
  streaming?: boolean
}

const KEY_PREFIX = 'cys-stift.conversation.'
const KEY_SUFFIX = '.v2'
const COMPANION_OLD_PREFIX = 'cys-stift.companion-chat.'
const COMPANION_OLD_SUFFIX = '.v1'
const ASK_OLD_KEY = 'cys-stift.ask-chat.v1'
const CAP = 100

/** 构造 per-canvas 的 localStorage key。 */
export function conversationKey(canvasId: CanvasId): string {
  return `${KEY_PREFIX}${String(canvasId)}${KEY_SUFFIX}`
}

/** 宽松校验:只留形如 { role, content } 的项,丢弃畸形数据(防坏数据炸 UI)。 */
function isValidMessage(m: unknown): m is PersistedConversationMessage {
  if (m == null || typeof m !== 'object') return false
  const msg = m as Record<string, unknown>
  return (
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string'
  )
}

/**
 * 读取某画布的对话历史。SSR / 无 key / parse 失败 → 返回空数组(绝不抛)。
 * 新 key 空时 lazy 迁移旧 companion v1 + 旧 ask 全局(按 targetCanvasId)。
 */
export function loadConversation(canvasId: CanvasId): PersistedConversationMessage[] {
  if (typeof window === 'undefined') return []
  const key = conversationKey(canvasId)
  let raw = window.localStorage.getItem(key)
  // lazy 迁移:新 key 空时合并旧 companion + 旧 ask(按 targetCanvasId)
  if (!raw) {
    const migrated = migrateLegacy(canvasId)
    if (migrated.length > 0) {
      saveConversation(canvasId, migrated) // 写新 key(封顶 CAP)
      raw = window.localStorage.getItem(key)
    }
  }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const filtered = parsed.filter(isValidMessage)
    // 流式 flag 复活守卫:持久化的 streaming:true 永远陈旧 —— reload 后那条消息
    // 会永远显示流式光标(stream 早已随页面卸载而死)。加载时清为 false。
    return filtered.map((m) => (m.streaming === true ? { ...m, streaming: false } : m))
  } catch {
    return []
  }
}

/**
 * 合并旧 companion v1 + 旧 ask 全局(过滤本画布)。
 * 合并顺序:companion-first,然后 ask-global-filtered-by-targetCanvasId。
 * 坏数据静默跳过(不抛)。
 */
function migrateLegacy(canvasId: CanvasId): PersistedConversationMessage[] {
  const out: PersistedConversationMessage[] = []
  const cid = String(canvasId)

  // 旧 companion per-canvas
  try {
    const c = window.localStorage.getItem(`${COMPANION_OLD_PREFIX}${cid}${COMPANION_OLD_SUFFIX}`)
    if (c) {
      const p = JSON.parse(c)
      if (Array.isArray(p)) out.push(...p.filter(isValidMessage))
    }
  } catch {
    /* 坏数据跳过 */
  }

  // 旧 ask 全局:按 targetCanvasId 过滤;无 targetCanvasId 的只归 DEFAULT_CANVAS_ID
  try {
    const a = window.localStorage.getItem(ASK_OLD_KEY)
    if (a) {
      const p = JSON.parse(a)
      if (Array.isArray(p)) {
        for (const item of p) {
          if (
            item == null ||
            typeof item !== 'object' ||
            ((item as Record<string, unknown>).role !== 'user' &&
              (item as Record<string, unknown>).role !== 'assistant') ||
            typeof (item as Record<string, unknown>).content !== 'string'
          ) {
            continue
          }
          const obj = item as Record<string, unknown>
          const target = obj.targetCanvasId
          const matches =
            (typeof target === 'string' && target === cid) ||
            (target == null && cid === String(DEFAULT_CANVAS_ID))
          if (matches) {
            // 去 targetCanvasId 字段(新 store 不需要)
            out.push({
              role: obj.role as 'user' | 'assistant',
              content: obj.content as string,
              ...(Array.isArray(obj.dslBlocks) ? { dslBlocks: obj.dslBlocks as string[] } : {}),
              ...(typeof obj.streaming === 'boolean' ? { streaming: obj.streaming } : {}),
            })
          }
        }
      }
    }
  } catch {
    /* 坏数据跳过 */
  }

  return out
}

/**
 * 写入某画布的对话历史(封顶最近 100 条,对齐旧 ask-history)。
 * quota 超 / 任何存储异常 → 静默跳过(不崩聊天)。返回 true=写入成功,false=跳过。
 */
export function saveConversation(
  canvasId: CanvasId,
  messages: PersistedConversationMessage[],
): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(
      conversationKey(canvasId),
      JSON.stringify(messages.slice(-CAP)),
    )
    return true
  } catch {
    // QuotaExceededError 或隐私模式禁用 storage —— 跳过,不阻塞对话。
    return false
  }
}

/** 清空某画布的对话历史。SSR / 异常静默。 */
export function clearConversation(canvasId: CanvasId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(conversationKey(canvasId))
  } catch {
    // 隐私模式禁用 storage 等 —— 跳过
  }
}
