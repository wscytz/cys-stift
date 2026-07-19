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

/** 持久化的对话消息。通常按画布分 key；targetCanvasId 仍保留作消息级
 * provenance，避免切换画布的过渡 render 把旧提议应用到新画布。 */
export interface PersistedConversationMessage {
  role: 'user' | 'assistant'
  content: string
  dslBlocks?: string[]
  streaming?: boolean
  targetCanvasId?: string
  /** Local RAG accounting only: counts + source ids, never card content. */
  contextMeta?: ConversationContextMeta
}

export interface ConversationContextMeta {
  retrievedCount: number
  sentCount: number
  cardIds: string[]
}

const KEY_PREFIX = 'cys-stift.conversation.'
const KEY_SUFFIX = '.v2'
const COMPANION_OLD_PREFIX = 'cys-stift.companion-chat.'
const COMPANION_OLD_SUFFIX = '.v1'
const ASK_OLD_KEY = 'cys-stift.ask-chat.v1'
const CAP = 100

// Conversation history is persisted under one key per canvas and is read on
// demand, so it has no message cache to invalidate. We still expose a small
// change signal: consumers that keep a local React message array (ask and
// companion) can re-read after an import/restore instead of waiting for a full
// page reload.
let _conversationVersion = 0
const _conversationSubscribers = new Set<() => void>()

function notifyConversationChange(): void {
  _conversationVersion += 1
  for (const cb of _conversationSubscribers) cb()
}

/** Subscribe to conversation persistence/import changes. */
export function subscribeConversationChanges(cb: () => void): () => void {
  _conversationSubscribers.add(cb)
  return () => {
    _conversationSubscribers.delete(cb)
  }
}

/** Stable monotonically increasing snapshot for external-store consumers. */
export function getConversationVersion(): number {
  return _conversationVersion
}

/**
 * Notify conversation consumers after an external storage restore/import.
 * Conversation messages are loaded per canvas, so there is no in-memory map
 * to replace; the signal is the invalidation contract.
 */
export function rehydrateConversations(): void {
  if (typeof window === 'undefined') return
  notifyConversationChange()
}

/** 构造 per-canvas 的 localStorage key。 */
export function conversationKey(canvasId: CanvasId): string {
  return `${KEY_PREFIX}${String(canvasId)}${KEY_SUFFIX}`
}

// Keep the invalidation signal consistent across tabs. localStorage does not
// dispatch a `storage` event in the tab that performed the write, so imports
// call rehydrateConversations() explicitly; this listener covers writes made
// by another tab/window.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === null ||
      (typeof event.key === 'string' &&
        event.key.startsWith(KEY_PREFIX) &&
        event.key.endsWith(KEY_SUFFIX))
    ) {
      notifyConversationChange()
    }
  })
}

/** 宽松校验:只留形如 { role, content } 的项,丢弃畸形数据(防坏数据炸 UI)。 */
function isValidMessage(m: unknown): m is PersistedConversationMessage {
  if (m == null || typeof m !== 'object') return false
  const msg = m as Record<string, unknown>
  return (
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string' &&
    (msg.targetCanvasId === undefined || typeof msg.targetCanvasId === 'string') &&
    (msg.contextMeta === undefined || isValidContextMeta(msg.contextMeta))
  )
}

function isValidContextMeta(value: unknown): value is ConversationContextMeta {
  if (!value || typeof value !== 'object') return false
  const meta = value as Record<string, unknown>
  return typeof meta.retrievedCount === 'number' && Number.isFinite(meta.retrievedCount) && meta.retrievedCount >= 0 &&
    typeof meta.sentCount === 'number' && Number.isFinite(meta.sentCount) && meta.sentCount >= 0 &&
    Array.isArray(meta.cardIds) && meta.cardIds.length <= 8 &&
    meta.cardIds.every((id) => typeof id === 'string' && id.length <= 200)
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
 *
 * 性能:migrateAllLegacyConversations 会对 N 个 canvasId 调本函数。若每次都
 * 读 + parse 同一个 ASK_OLD_KEY → N 次重复 parse(同一份 JSON)。boot 一次性 +
 * μs 级,但工程上可避免。opts.askGlobal 允许调用方预 parse 一次后传入;不传
 * (lazy migrate 路径 / loadConversation)则内部自取,行为不变。
 *
 * @param opts.askGlobal 预 parsed 的 ASK_OLD_KEY 内容(已通过 Array.isArray 校验)。
 *                       传入时直接用,不再读 localStorage;不传时内部读 + parse。
 */
function migrateLegacy(
  canvasId: CanvasId,
  opts?: { askGlobal?: unknown[] },
): PersistedConversationMessage[] {
  const out: PersistedConversationMessage[] = []
  const cid = String(canvasId)

  // 旧 companion per-canvas(companion key 总是按 canvas 隔离,无法预 parse 共享)
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
  // opts.askGlobal 传入 → 直接用(避免 N canvas = N 次 parse 同一 key);否则自取(lazy)
  let askItems: unknown[] | undefined = opts?.askGlobal
  if (askItems === undefined) {
    try {
      const a = window.localStorage.getItem(ASK_OLD_KEY)
      if (a) {
        const p = JSON.parse(a)
        if (Array.isArray(p)) askItems = p
      }
    } catch {
      /* 坏数据跳过 */
    }
  }
  if (askItems) {
    for (const item of askItems) {
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

  return out
}

/**
 * 全量迁移所有遗留 v1 conversation key → v2,并删除 v1 key。
 *
 * 为什么需要:loadConversation 的 lazy migrate 只在「打开某画布」时迁该画布。
 * 未打开过的画布的 v1 conversation 永远不迁 → export-service 只枚举 v2 key
 * → 备份漏掉未打开画布的对话。本函数枚举 localStorage 所有 v1 key,一次性
 * 迁完 + 删旧 key,使全应用进入纯 v2 状态(所有读路径只看 v2 即可)。
 *
 * 幂等:已迁(或 v2 已有数据)的画布不重写 v2;所有 v1 key 无论是否已迁都
 * 删除(v1 是 v2 的子集/等价 —— lazy migrate 写 v2 不删 v1,残留 v1 是 stale)。
 *
 * SSR / 异常静默。返回成功迁移(首次写新 v2 key)的画布数。
 */
export function migrateAllLegacyConversations(): number {
  if (typeof window === 'undefined') return 0

  // 1. 收集所有需要处理的 canvasId + 记下所有 companion v1 key(后面删)
  const canvasIds = new Set<string>()
  const companionOldKeys: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key) continue
    if (key.startsWith(COMPANION_OLD_PREFIX) && key.endsWith(COMPANION_OLD_SUFFIX)) {
      const cid = key.slice(
        COMPANION_OLD_PREFIX.length,
        key.length - COMPANION_OLD_SUFFIX.length,
      )
      if (cid) {
        canvasIds.add(cid)
        companionOldKeys.push(key)
      }
    }
  }

  // 2. ask 全局:key 存在 → 无 target 的消息归 DEFAULT_CANVAS_ID;扫显式 target。
  //    parse 一次:后续 migrateLegacy 直接复用 opts.askGlobal(避免 N canvas = N 次
  //    parse 同一份 JSON —— boot 一次性 + μs 级,但工程上更干净)。
  let hasAskGlobal = false
  let askGlobalItems: unknown[] | undefined
  try {
    const a = window.localStorage.getItem(ASK_OLD_KEY)
    if (a) {
      hasAskGlobal = true
      const p = JSON.parse(a)
      if (Array.isArray(p)) {
        askGlobalItems = p
        // 无 target 的消息只归 DEFAULT_CANVAS_ID(migrateLegacy 的路由规则)
        canvasIds.add(String(DEFAULT_CANVAS_ID))
        for (const item of p) {
          if (item == null || typeof item !== 'object') continue
          const obj = item as Record<string, unknown>
          if (typeof obj.targetCanvasId === 'string') {
            canvasIds.add(obj.targetCanvasId)
          }
        }
      }
    }
  } catch {
    /* 坏 JSON 跳过;opts.askGlobal 不传 → migrateLegacy 内部自取(再 parse 仍坏,静默) */
  }

  // 3. 对每个 canvasId:若 v2 空 → migrateLegacy + save;若 v2 已有 → 跳过(幂等)。
  //    成功 parsed 时传 opts.askGlobal 复用(parse 一次);坏 JSON 时退化到自取路径。
  let migratedCount = 0
  for (const cid of canvasIds) {
    const v2Key = conversationKey(cid as CanvasId)
    if (window.localStorage.getItem(v2Key)) continue // v2 已有(lazy 已迁 / 用户新对话)
    const msgs = migrateLegacy(
      cid as CanvasId,
      askGlobalItems !== undefined ? { askGlobal: askGlobalItems } : undefined,
    )
    if (msgs.length > 0) {
      saveConversation(cid as CanvasId, msgs)
      migratedCount++
    }
  }

  // 4. 删除所有 v1 key(companion per-canvas + ask global)。v1 已全量迁入 v2
  //    (或 v2 已有更新数据),v1 是 stale 子集,删除安全。
  for (const key of companionOldKeys) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* 隐私模式等 —— 跳过 */
    }
  }
  if (hasAskGlobal) {
    try {
      window.localStorage.removeItem(ASK_OLD_KEY)
    } catch {
      /* 同上 */
    }
  }

  return migratedCount
}

// 配额失败订阅(Task 6):saveConversation 写失败 → notifyQuota → AppMenu toast。
const _quotaSubscribers = new Set<() => void>()
function notifyQuota(): void { for (const cb of _quotaSubscribers) cb() }
export function onQuotaExceeded(cb: () => void): () => void {
  _quotaSubscribers.add(cb)
  return () => { _quotaSubscribers.delete(cb) }
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
    // Persist only the conversation contract. Components may attach
    // ephemeral render/sample fields (for example `sampleContext`); letting
    // those leak into the store would bloat exports and expose prompt text.
    const persisted = messages.slice(-CAP).map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.dslBlocks ? { dslBlocks: message.dslBlocks } : {}),
      ...(message.streaming ? { streaming: true } : {}),
      ...(message.targetCanvasId ? { targetCanvasId: message.targetCanvasId } : {}),
      ...(message.contextMeta ? { contextMeta: message.contextMeta } : {}),
    }))
    window.localStorage.setItem(conversationKey(canvasId), JSON.stringify(persisted))
    notifyConversationChange()
    return true
  } catch {
    // QuotaExceededError 或隐私模式禁用 storage —— 跳过,不阻塞对话 + 提示配额。
    notifyQuota()
    return false
  }
}

/** 清空某画布的对话历史。SSR / 异常静默。 */
export function clearConversation(canvasId: CanvasId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(conversationKey(canvasId))
    notifyConversationChange()
  } catch {
    // 隐私模式禁用 storage 等 —— 跳过
  }
}
