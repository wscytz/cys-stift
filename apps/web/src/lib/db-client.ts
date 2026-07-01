'use client'

import { useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import {
  CardService,
  type Card,
  type CardId,
  type CanvasId,
  StorageQuotaError,
} from '@cys-stift/domain'

// ── Storage adapter (localStorage on web; Tauri fs in Phase 6/8) ─────────────

const STORAGE_KEY = 'cys-stift.cards.v1'

interface Snapshot {
  cards: Card[]
}

function loadSnapshot(): Snapshot {
  if (typeof window === 'undefined') return { cards: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { cards: [] }
    const parsed = JSON.parse(raw) as { cards: Card[] }
    for (const c of parsed.cards) {
      c.capturedAt = new Date(c.capturedAt)
      c.createdAt = new Date(c.createdAt)
      c.updatedAt = new Date(c.updatedAt)
      c.deletedAt = c.deletedAt ? new Date(c.deletedAt) : undefined
      // 数组字段防御性归一化(导入坏数据/旧版迁移/解析异常):非数组 → 空数组,
      // 防后续渲染 .map 崩(tags 非数组时 card-detail (card.tags ?? []).map 仍炸)。
      if (!Array.isArray(c.tags)) c.tags = []
      if (c.media != null && !Array.isArray(c.media)) c.media = []
      if (c.links != null && !Array.isArray(c.links)) c.links = []
      if (c.codeSnippets != null && !Array.isArray(c.codeSnippets)) c.codeSnippets = []
      if (c.quotes != null && !Array.isArray(c.quotes)) c.quotes = []
    }
    return parsed
  } catch {
    return { cards: [] }
  }
}

/**
 * 写快照到 localStorage。返回 true=成功,false=配额满(QuotaExceeded)
 * 或其他写入异常——吞错而非抛,让调用方(insert/update/delete)决定回滚。
 *
 * 为什么吞:配额满是用户可感知的运行时状态(存储计量会警告),不该让一次
 * setItem 抛错炸掉整个卡片操作链路。调用方拿到 false 后回滚内存数组,
 * 保证「内存 = localStorage」一致性,避免「用户看到卡但 reload 丢」的
 * 静默数据丢失(审计 H1)。
 */
function saveSnapshot(snap: Snapshot): boolean {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap))
    return true
  } catch (e) {
    // QuotaExceededError 或 SecurityError(隐私模式)——吞,返回 false。
    console.warn('[db-client] persist failed (quota?)', e)
    return false
  }
}

// ── In-memory + localStorage-backed CardRepository ──────────────────────────

let _cards: Card[] = []
let _hydrated = false
const _subscribers = new Set<() => void>()

function notify() {
  for (const sub of _subscribers) sub()
}

// ── Quota 失败回调(审计 H1)─────────────────────────────────────────────────
// db-client 是非 React 模块(无 hook 上下文),不能直接 pushToast/i18n。
// 暴露订阅点:React 层(如 AppMenu,全局挂载的 'use client' 组件)订阅一次,
// 收到配额失败时展示 toast。
type QuotaCallback = () => void
const _quotaSubscribers = new Set<QuotaCallback>()

function notifyQuota(): void {
  for (const cb of _quotaSubscribers) cb()
}

/** StorageQuotaError 现定义在 domain(packages/domain/src/errors.ts)——CardRepository
 *  契约的失败模式,domain 的 CardService 要 instanceof 捕获。此处 import 用于抛。 */

/** 订阅配额写入失败事件(卡片操作无法持久化时触发)。返回取消订阅。 */
export function onQuotaExceeded(cb: QuotaCallback): () => void {
  _quotaSubscribers.add(cb)
  return () => {
    _quotaSubscribers.delete(cb)
  }
}

function persist(): boolean {
  const ok = saveSnapshot({ cards: _cards })
  notify()
  return ok
}

// B1 (v0.26.4): cross-tab sync. localStorage 'storage' events fire in OTHER
// tabs/windows when a key changes — we notify our own subscribers so they
// re-read the snapshot. Without this, two tabs editing the same data
// silently overwrite each other until manual reload. The 'cards' key is the
// only one we care about for now; canvas snapshots and other stores keep
// their own sync (or not — out of scope here).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue && e.oldValue && e.newValue !== e.oldValue) {
      // Re-hydrate from the new value (only if hydration already happened;
      // a fresh tab still relies on its own first-mount hydrate).
      if (_hydrated) {
        rehydrateCards()
      }
    }
  })
}

/**
 * Re-read cards from localStorage and replace the in-memory cache. Used
 * after an import (settings/page.tsx) so the post-import localStorage
 * state is reflected in subscribers BEFORE the page reloads. The page
 * reloads 400ms after import anyway, so this is a belt-and-braces
 * safeguard against a same-tab mutation during the reload window
 * overwriting the import (the cross-tab 'storage' event doesn't fire
 * in the tab that wrote the data).
 */
export function rehydrateCards(): void {
  if (typeof window === 'undefined') return
  const next = loadSnapshot()
  // loadSnapshot() always returns a fresh array, so an identity check
  // (`next.cards !== _cards`) would ALWAYS fire — causing every cross-tab
  // storage event to notify every useDb() consumer, even when the parsed
  // content is identical. Compare a cheap signature instead. (v0.37.0 review.)
  //
  // R2.5: the old signature (length + first/last id) missed cross-tab edits to
  // a MIDDLE card — same length, same endpoints, but a middle card's content
  // changed. Summing every card's updatedAt timestamp catches any content
  // change (any card mutation bumps its updatedAt) while staying a pure cheap
  // string that does not false-fire on the fresh array identity.
  const sig = (cs: Card[]): string => {
    let sum = 0
    for (const c of cs) sum += c.updatedAt.getTime()
    return `${cs.length}:${sum}`
  }
  if (sig(next.cards) !== sig(_cards)) {
    _cards = next.cards
    notify()
  }
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _cards = loadSnapshot().cards
  notify()
}

const cardRepo = {
  insert(card: Card) {
    const prev = _cards
    _cards = [..._cards, card]
    if (!persist()) {
      _cards = prev // 回滚:内存与 localStorage 一致,不留孤儿
      notifyQuota()
      // H2 fix: 配额满时必须 throw,否则 CardService.create 照常返回卡片,
      // CaptureSink.submit resolve 成功,MiniInput 清空草稿 → 用户输入静默丢失。
      // 抛 StorageQuotaError 让 promise 链路 reject,上层据此保留草稿 + 报错。
      throw new StorageQuotaError()
    }
  },
  update(card: Card) {
    const prev = _cards
    _cards = _cards.map((c) => (c.id === card.id ? card : c))
    if (!persist()) {
      _cards = prev
      notifyQuota()
    }
  },
  delete(id: CardId) {
    const prev = _cards
    _cards = _cards.filter((c) => c.id !== id)
    if (!persist()) {
      _cards = prev
      notifyQuota()
    }
  },
  getById(id: CardId) {
    return _cards.find((c) => c.id === id) ?? null
  },
  listInbox() {
    return _cards
      .filter((c) => !c.canvasPosition && !c.archived && !c.deletedAt)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
  },
  listOnCanvas(canvasId: CanvasId) {
    return _cards.filter((c) => c.canvasPosition?.canvasId === canvasId)
  },
  listAll() {
    return _cards
  },
}

// ── React hooks ─────────────────────────────────────────────────────────────
// The snapshot object identity MUST be stable when nothing has changed, or
// useSyncExternalStore will throw. We cache the snapshot and only allocate a
// new one when the array reference changes.

let _cachedSnapshot: Snapshot = { cards: _cards }
function getSnapshot(): Snapshot {
  // The array reference is the source of truth — when _cards is replaced, we
  // also replace the snapshot object so React knows to re-render.
  if (_cachedSnapshot.cards !== _cards) {
    _cachedSnapshot = { cards: _cards }
  }
  return _cachedSnapshot
}

function getServerSnapshot(): Snapshot {
  return _cachedSnapshot // same stable empty ref on the server
}

function subscribe(cb: () => void) {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

/**
 * useDb — client-only hook. SSR returns an empty, stable snapshot; after
 * mount we hydrate from localStorage and the snapshot updates.
 */
export function useDb() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateOnce()
    setReady(true)
  }, [])
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const service = useMemo(() => new CardService(cardRepo), [])
  return { snap, service, repo: cardRepo, ready }
}

export function resetDb() {
  _cards = []
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY)
  }
  notify()
}

// ── 测试导出(仅 __tests__ 用;非公开 API)──────────────────────────────────
export const __test__ = {
  saveSnapshot,
  cardRepo,
}
