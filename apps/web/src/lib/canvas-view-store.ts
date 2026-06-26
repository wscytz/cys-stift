'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { CanvasId } from '@cys-stift/domain'

// ── Canvas view persistence per-canvas (spec §4.3 + §4.9, v0.15 follow-up) ─
// Up to v0.15 the view was a single value (no per-canvas split). With
// multi-canvas UI shipped, each canvas now keeps its own zoom / pan /
// gridMode so switching canvases preserves how you left it. The store
// shape is now `Record<CanvasId, CanvasView>` keyed by canvas id. Public
// API is the same set / get / update / reset shape, scoped to a canvas
// id; useCanvasView(canvasId) replaces the canvasId-less hook.

const STORAGE_KEY = 'cys-stift.canvas-view.v1'

export interface CanvasView {
  zoom: number
  panX: number
  panY: number
  gridMode: 'snap' | 'free'
  gridSize: number
}

const DEFAULT_VIEW: CanvasView = {
  zoom: 1,
  panX: 0,
  panY: 0,
  gridMode: 'snap',
  gridSize: 8,
}

function isValidView(v: unknown): v is CanvasView {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.zoom === 'number' &&
    typeof o.panX === 'number' &&
    typeof o.panY === 'number' &&
    (o.gridMode === 'snap' || o.gridMode === 'free') &&
    typeof o.gridSize === 'number'
  )
}

type ViewMap = Record<string, CanvasView>

function loadViewMap(): ViewMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { views?: unknown; view?: unknown }
    // Back-compat: previous shape was { view: CanvasView } (single value).
    // If we see the old shape, treat it as the default canvas's view.
    if (parsed.view && isValidView(parsed.view)) {
      // The legacy store had no canvasId dimension — we still don't know
      // which canvas it belonged to, so we drop it. The legacy single
      // value was effectively unused after v0.15 (canvas page reads
      // canvasViewStore.get(activeCanvasId) and DEFAULT returns the
      // default). Users would have to re-pan/zoom once on upgrade.
      // Worth the migration simplicity.
      return {}
    }
    if (parsed.views && typeof parsed.views === 'object') {
      const out: ViewMap = {}
      for (const [id, v] of Object.entries(parsed.views)) {
        if (isValidView(v)) out[id] = v
      }
      return out
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * 写视图 map 到 localStorage。返回 true=成功,false=配额满(QuotaExceeded)
 * 或其他写入异常——吞错而非抛,让调用方(update/reset/resetAll)决定回滚。
 *
 * 镜像 db-client.ts(审计 H1 / quota-silence fix):配额满时回滚内存 _views,
 * 保证「内存 = localStorage」一致性,避免「用户改了 zoom/pan/gridMode,reload
 * 后却消失」的静默数据丢失。同时 notifyQuota,让 AppMenu 订阅的 toast 提示。
 */
function saveViewMap(views: ViewMap): boolean {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ views }))
    return true
  } catch (e) {
    // QuotaExceededError / SecurityError(隐私模式)——吞,返回 false。
    console.warn('[canvas-view-store] persist failed (quota?)', e)
    return false
  }
}

// ── Quota 失败回调(镜像 db-client / media-store / canvas-freeform-store)──────
// canvas-view-store 是非 React 模块(无 hook 上下文),不能直接 pushToast/i18n。
// 暴露订阅点:React 层(AppMenu)订阅一次,收到配额失败时展示 toast。
type QuotaCallback = () => void
const _quotaSubscribers = new Set<QuotaCallback>()

function notifyQuota(): void {
  for (const cb of _quotaSubscribers) cb()
}

/** 订阅配额写入失败事件(画布视图无法持久化时触发)。返回取消订阅。 */
export function onQuotaExceeded(cb: QuotaCallback): () => void {
  _quotaSubscribers.add(cb)
  return () => {
    _quotaSubscribers.delete(cb)
  }
}

// ── Module singleton ────────────────────────────────────────────────────────

let _views: ViewMap = {}
let _hydrated = false
const _subscribers = new Set<() => void>()

function notify() {
  for (const sub of _subscribers) sub()
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _views = loadViewMap()
  notify()
}

/**
 * 持久化当前 _views 到 localStorage。返回 true=写入成功,false=配额满。
 * 调用方负责在失败时回滚 _views 到写入前的值(否则内存与 localStorage
 * 不一致——UI 显示了改动,reload 后消失)。
 *
 * 不在这里 notify:notify 必须在回滚决策 *之后* 触发(见 canvas-store
 * persist() 的同一处说明)。每个 mutator 在 if (!persist()) { 回滚 } 之后
 * 无条件 notify() 一次:成功→notify(newViews),失败→notify(prev)。
 */
function persist(): boolean {
  return saveViewMap(_views)
}

// Stable snapshot cache — only reallocate when _views changes.
let _cachedSnapshot: ViewMap = _views
export function getSnapshot(): ViewMap {
  if (_cachedSnapshot !== _views) {
    _cachedSnapshot = _views
  }
  return _cachedSnapshot
}

function getServerSnapshot(): ViewMap {
  return _cachedSnapshot
}

/**
 * Subscribe to canvas-view-store changes. Exported for non-React consumers
 * and so tests can assert the subscriber-visible state after a rollback —
 * a rollback that skips notify() leaves useSyncExternalStore subscribers
 * stuck on the failed mutation (Bug 1 regression guarded in tests).
 */
export function subscribe(cb: () => void) {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export const canvasViewStore = {
  /** Read a canvas's view (default view if the canvas has none yet). */
  get(id: CanvasId): CanvasView {
    hydrateOnce()
    return _views[id] ?? DEFAULT_VIEW
  },
  /** Patch a canvas's view. */
  update(id: CanvasId, patch: Partial<CanvasView>): void {
    hydrateOnce()
    const current = _views[id] ?? DEFAULT_VIEW
    const next: CanvasView = { ...current, ...patch }
    if (next.zoom === current.zoom &&
        next.panX === current.panX &&
        next.panY === current.panY &&
        next.gridMode === current.gridMode &&
        next.gridSize === current.gridSize) {
      return
    }
    const prev = _views
    _views = { ..._views, [id]: next }
    if (!persist()) {
      _views = prev // 回滚:内存与 localStorage 一致
      notifyQuota()
    }
    notify() // 回滚后必须 notify,订阅者才能看到回退后的视图
  },
  /** Reset a single canvas's view to defaults. */
  reset(id: CanvasId): void {
    hydrateOnce()
    if (!(id in _views)) return
    const prev = _views
    const next = { ..._views }
    delete next[id]
    _views = next
    if (!persist()) {
      _views = prev
      notifyQuota()
    }
    notify() // 回滚后必须 notify,订阅者才能看到回退后的视图
  },
  /** Reset every canvas's view (used by "Reset view" UI in the future). */
  resetAll(): void {
    hydrateOnce()
    if (Object.keys(_views).length === 0) return
    const prev = _views
    _views = {}
    if (!persist()) {
      _views = prev
      notifyQuota()
    }
    notify() // 回滚后必须 notify,订阅者才能看到回退后的视图
  },
}

/**
 * useCanvasView — read a canvas's persisted view. After hydration the
 * snapshot reflects localStorage; before that, the defaults are returned
 * (safe for SSR / first client paint).
 */
export function useCanvasView(canvasId: CanvasId): {
  view: CanvasView
  ready: boolean
} {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateOnce()
    setReady(true)
  }, [])
  const views = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const view = useMemo(() => views[canvasId] ?? DEFAULT_VIEW, [views, canvasId])
  return useMemo(() => ({ view, ready }), [view, ready])
}
