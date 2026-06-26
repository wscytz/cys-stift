'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  toCanvasId,
  toWorkspaceId,
  type Canvas,
  type CanvasId,
} from '@cys-stift/domain'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { canvasFreeformStore } from './canvas-freeform-store'

// ── Multi-canvas store (spec §4.9, Phase multi-canvas 2026-06-20) ──────────
// Web-local canvas list + active selection. The Canvas type already
// exists in domain (Phase 2) and the CardService's moveToCanvas /
// removeFromCanvas / listOnCanvas take any CanvasId — we just need a
// web-side list to switch between and a remembered "active" id.
//
// MVP scope: list + switch + create + rename + delete from the canvas
// page. Inbox "Send to canvas" still targets DEFAULT_CANVAS_ID; view
// persistence (zoom/pan/gridMode) is still single-value — both stay
// post-MVP. Both are explicitly out-of-scope here (see plan §范围).

const STORAGE_KEY = 'cys-stift.canvases.v1'
const WORKSPACE_ID = toWorkspaceId('default')

const DEFAULT_VIEW = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  gridMode: 'snap' as const,
  gridSize: 8 as const,
}

const SEED_CANVAS: Canvas = {
  id: DEFAULT_CANVAS_ID,
  workspaceId: WORKSPACE_ID,
  name: 'default canvas',
  view: DEFAULT_VIEW,
  // sentinel epoch (0) so seed always sorts first by createdAt
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

export interface CanvasesSnapshot {
  canvases: Canvas[]
  activeCanvasId: CanvasId
}

function isCanvas(x: unknown): x is Canvas {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.workspaceId === 'string' &&
    typeof o.name === 'string' &&
    o.view != null &&
    typeof o.view === 'object' &&
    typeof o.createdAt === 'string' &&
    typeof o.updatedAt === 'string'
  )
}

function isSnapshot(x: unknown): x is CanvasesSnapshot {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    Array.isArray(o.canvases) &&
    o.canvases.every(isCanvas) &&
    typeof o.activeCanvasId === 'string'
  )
}

function loadSnapshot(): CanvasesSnapshot {
  if (typeof window === 'undefined') {
    return { canvases: [SEED_CANVAS], activeCanvasId: DEFAULT_CANVAS_ID }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedFresh()
    const parsed = JSON.parse(raw) as { snapshot?: unknown }
    const snap = parsed.snapshot
    if (!isSnapshot(snap)) return seedFresh()
    // Always ensure the default canvas exists — older stores without
    // it would otherwise leave the system with no canvas to fall back
    // to.
    const hasDefault = snap.canvases.some((c) => c.id === DEFAULT_CANVAS_ID)
    const canvases = hasDefault ? snap.canvases : [SEED_CANVAS, ...snap.canvases]
    const activeInList = canvases.some((c) => c.id === snap.activeCanvasId)
    return {
      canvases: canvases.map(reviveDates),
      activeCanvasId: activeInList ? snap.activeCanvasId : DEFAULT_CANVAS_ID,
    }
  } catch {
    return seedFresh()
  }
}

function seedFresh(): CanvasesSnapshot {
  return { canvases: [SEED_CANVAS], activeCanvasId: DEFAULT_CANVAS_ID }
}

function reviveDates(c: Canvas): Canvas {
  return {
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  }
}

/**
 * 写快照到 localStorage。返回 true=成功,false=配额满(QuotaExceeded)
 * 或其他写入异常——吞错而非抛,让调用方(create/rename/delete)决定回滚。
 *
 * 镜像 db-client.ts 的模式(审计 H1 / quota-silence fix):配额满时回滚
 * 内存 _snap + _cached,保证「内存 = localStorage」一致性,避免「用户看到
 * 画布创建/改名/删除成功,reload 后却消失」的静默数据丢失。同时 notifyQuota,
 * 让 AppMenu 订阅的 toast 提示用户。
 */
function saveSnapshot(snap: CanvasesSnapshot): boolean {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ snapshot: snap }))
    return true
  } catch (e) {
    // QuotaExceededError / SecurityError(隐私模式)——吞,返回 false。
    console.warn('[canvas-store] persist failed (quota?)', e)
    return false
  }
}

// ── Quota 失败回调(镜像 db-client / media-store / canvas-freeform-store)──────
// canvas-store 是非 React 模块(无 hook 上下文),不能直接 pushToast/i18n。
// 暴露订阅点:React 层(AppMenu)订阅一次,收到配额失败时展示 toast。
type QuotaCallback = () => void
const _quotaSubscribers = new Set<QuotaCallback>()

function notifyQuota(): void {
  for (const cb of _quotaSubscribers) cb()
}

/** 订阅配额写入失败事件(画布列表无法持久化时触发)。返回取消订阅。 */
export function onQuotaExceeded(cb: QuotaCallback): () => void {
  _quotaSubscribers.add(cb)
  return () => {
    _quotaSubscribers.delete(cb)
  }
}

// ── Module singleton ────────────────────────────────────────────────────────

let _snap: CanvasesSnapshot = seedFresh()
let _hydrated = false
const _subscribers = new Set<() => void>()

function notify() {
  for (const sub of _subscribers) sub()
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _snap = loadSnapshot()
  notify()
}

/**
 * 持久化当前 _snap 到 localStorage。返回 true=写入成功,false=配额满
 * (此时调用方负责回滚 _snap 到写入前的值,否则内存与 localStorage
 * 不一致——UI 显示了改动,reload 后消失)。
 *
 * 不在这里回滚:persist 不知道「写入前」的快照(它只看到当前的 _snap)。
 * 调用方(create/rename/delete/setActive)在改 _snap 前先存 prev,失败时恢复 prev。
 *
 * 不在这里 notify:notify 必须在回滚决策 *之后* 才能触发,否则失败路径下
 * persist() 会先以 newSnap notify 一次,调用方回滚到 prev 后又得再 notify 一次
 * 来让订阅者看到回滚后的状态——既冗余(两次渲染)又易漏(早期 return 路径
 * 漏掉第二次 notify 就会让 useSyncExternalStore 订阅者卡在失败的改动上)。
 * 因此每个 mutator 在 if (!persist()) { 回滚 } 之后,无条件 notify() 一次:
 * 成功→notify(newSnap),失败→notify(prev)。每个 mutation 恰好一次 notify。
 */
function persist(): boolean {
  return saveSnapshot(_snap)
}

let _cached: CanvasesSnapshot = _snap
export function getSnapshot(): CanvasesSnapshot {
  if (_cached !== _snap) _cached = _snap
  return _cached
}

function getServerSnapshot(): CanvasesSnapshot {
  return _cached
}

/**
 * Subscribe to canvas-store changes (mirrors settingsStore.subscribe /
 * canvasViewStore.subscribe). Exported both for non-React consumers and
 * so tests can assert the subscriber-visible state after a rollback —
 * useSyncExternalStore only re-reads getSnapshot() when notify() fires,
 * so a rollback that skips notify() leaves subscribers stuck on the
 * failed mutation (the Bug 1 regression we guard against in tests).
 */
export function subscribe(cb: () => void): () => void {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

// Stable id generator. Avoids importing the domain codec on the web side
// (domain has generateId but it's not exported from the barrel).
function newCanvasId(): CanvasId {
  // crypto.randomUUID is available in modern browsers + Node 19+.
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return toCanvasId(`canvas-${uuid}`)
}

function trimName(name: string): string {
  return name.trim().slice(0, 60)
}

// ── Public API ─────────────────────────────────────────────────────────────

export const canvasStore = {
  /** Synchronous read; calls hydrateOnce() on first call. */
  get(): CanvasesSnapshot {
    hydrateOnce()
    return _snap
  },
  /** Switch the active canvas. No-op if id is unknown. */
  setActive(id: CanvasId): void {
    hydrateOnce()
    if (!_snap.canvases.some((c) => c.id === id)) return
    if (_snap.activeCanvasId === id) return
    const prev = _snap
    _snap = { ..._snap, activeCanvasId: id }
    if (!persist()) {
      _snap = prev // 回滚:内存与 localStorage 一致
      notifyQuota()
    }
    notify() // 回滚后必须 notify,订阅者才能看到回退后的 activeCanvasId
  },
  /**
   * Create a new canvas and make it active. Trims the name, dedupes
   * by appending " (N)" on collision. Returns the new id.
   */
  create(name: string): CanvasId {
    hydrateOnce()
    const now = new Date()
    let final = trimName(name) || 'untitled canvas'
    const existing = new Set(_snap.canvases.map((c) => c.name.toLowerCase()))
    let n = 2
    while (existing.has(final.toLowerCase())) {
      final = `${trimName(name) || 'untitled canvas'} (${n++})`
    }
    const canvas: Canvas = {
      id: newCanvasId(),
      workspaceId: WORKSPACE_ID,
      name: final,
      view: DEFAULT_VIEW,
      createdAt: now,
      updatedAt: now,
    }
    const prev = _snap
    _snap = {
      canvases: [..._snap.canvases, canvas],
      activeCanvasId: canvas.id,
    }
    if (!persist()) {
      // 回滚:创建的画布未持久化。恢复 prev,不返回新 id(返回空串让调用方
      // 知道失败——实际调用方只用于 setActive,空串在 setActive 里 no-op)。
      _snap = prev
      notifyQuota()
      notify() // 回滚后 notify,订阅者看到「画布并未新增」
      return '' as CanvasId
    }
    notify()
    return canvas.id
  },
  /** Rename a canvas. No-op if id is unknown or name is empty. */
  rename(id: CanvasId, name: string): void {
    hydrateOnce()
    const trimmed = trimName(name)
    if (!trimmed) return
    const prev = _snap
    _snap = {
      ..._snap,
      canvases: _snap.canvases.map((c) =>
        c.id === id ? { ...c, name: trimmed, updatedAt: new Date() } : c,
      ),
    }
    if (!persist()) {
      _snap = prev // 回滚:改名未持久化
      notifyQuota()
    }
    notify() // 回滚后必须 notify,订阅者才能看到回退后的名字
  },
  /**
   * Delete a canvas. Refuses the default canvas (it's the seed).
   * If the deleted canvas was active, falls back to the default canvas.
   * Idempotent: no-op if id is unknown. Returns true on success.
   */
  delete(id: CanvasId): boolean {
    hydrateOnce()
    if (id === DEFAULT_CANVAS_ID) return false
    if (!_snap.canvases.some((c) => c.id === id)) return false
    const prev = _snap
    const wasActive = _snap.activeCanvasId === id
    _snap = {
      canvases: _snap.canvases.filter((c) => c.id !== id),
      activeCanvasId: wasActive ? DEFAULT_CANVAS_ID : _snap.activeCanvasId,
    }
    if (!persist()) {
      // 回滚:删除未持久化。报告失败(返回 false),不清理 freeform 数据。
      _snap = prev
      notifyQuota()
      notify() // 回滚后 notify,订阅者看到「画布并未删除」
      return false
    }
    // B4 (v0.26.4): free the persisted freeform data — otherwise a canvas
    // deletion leaves its non-card elements (text / freedraw / arrows / rects)
    // stranded forever. Callers should have already moved cards back to inbox
    // before delete. canvasFreeformStore.remove also cleans up any leftover
    // pre-self-built tldraw snapshot for this canvas.
    canvasFreeformStore.remove(id).catch(() => {})
    notify() // 删除成功:通知订阅者画布列表已变
    return true
  },
}

export function useCanvases(): {
  snapshot: CanvasesSnapshot
  ready: boolean
} {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateOnce()
    setReady(true)
  }, [])
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
  return useMemo(() => ({ snapshot, ready }), [snapshot, ready])
}
