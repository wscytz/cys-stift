'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

// ── Graph view + node position persistence(全局,不分 canvas — 图谱是全局的)─
// 照搬 canvas-view-store 范式:localStorage + 配额回滚 + useSyncExternalStore。
// 存:视口 {zoom,panX,panY} + 节点坐标 Record<nodeId,{x,y,fx?,fy?}>。
// v0.40 手测反馈:/graph 每次打开重跑 force 布局,丢掉上次状态。

const STORAGE_KEY = 'cys-stift.graph-view.v1'

export interface GraphView {
  zoom: number
  panX: number
  panY: number
}

export interface NodePosition {
  x: number
  y: number
  fx?: number
  fy?: number
}

interface GraphState {
  view: GraphView
  positions: Record<string, NodePosition>
}

const DEFAULT_VIEW: GraphView = { zoom: 1, panX: 0, panY: 0 }

function isValidView(v: unknown): v is GraphView {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  // Number.isFinite 而非 typeof === 'number':NaN 会通过 typeof 但让整张图爆炸不可恢复。
  return finiteNumber(o.zoom) && finiteNumber(o.panX) && finiteNumber(o.panY)
}

function isValidPosition(v: unknown): v is NodePosition {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (!finiteNumber(o.x) || !finiteNumber(o.y)) return false
  // A half-fixed node is not a valid d3-force position. Optional fixed
  // coordinates are accepted only as a finite pair; malformed values are
  // dropped during hydration rather than reaching the simulation.
  return (
    (o.fx === undefined && o.fy === undefined) ||
    (finiteNumber(o.fx) && finiteNumber(o.fy))
  )
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function sanitizePosition(pos: NodePosition): NodePosition | null {
  if (!finiteNumber(pos.x) || !finiteNumber(pos.y)) return null
  const next: NodePosition = { x: pos.x, y: pos.y }
  if (finiteNumber(pos.fx) && finiteNumber(pos.fy)) {
    next.fx = pos.fx
    next.fy = pos.fy
  }
  return next
}

function loadState(): GraphState {
  if (typeof window === 'undefined') return { view: DEFAULT_VIEW, positions: {} }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { view: DEFAULT_VIEW, positions: {} }
    const parsed = JSON.parse(raw) as { view?: unknown; positions?: unknown }
    const view = isValidView(parsed.view) ? parsed.view : DEFAULT_VIEW
    const positions: Record<string, NodePosition> = {}
    if (parsed.positions && typeof parsed.positions === 'object') {
      for (const [id, p] of Object.entries(parsed.positions as Record<string, unknown>)) {
        if (isValidPosition(p)) {
          const position = sanitizePosition(p)
          if (position) positions[id] = position
        } else if (p && typeof p === 'object') {
          // Preserve valid x/y from a legacy half-fixed record, but never its
          // malformed fx/fy values.
          const position = sanitizePosition(p as NodePosition)
          if (position) positions[id] = position
        }
      }
    }
    return { view, positions }
  } catch {
    return { view: DEFAULT_VIEW, positions: {} }
  }
}

function saveState(state: GraphState): boolean {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch (e) {
    console.warn('[graph-view-store] persist failed (quota?)', e)
    return false
  }
}

type QuotaCallback = () => void
const _quotaSubscribers = new Set<QuotaCallback>()
function notifyQuota(): void {
  for (const cb of _quotaSubscribers) cb()
}
export function onQuotaExceeded(cb: QuotaCallback): () => void {
  _quotaSubscribers.add(cb)
  return () => {
    _quotaSubscribers.delete(cb)
  }
}

let _state: GraphState = { view: DEFAULT_VIEW, positions: {} }
let _hydrated = false
const _subscribers = new Set<() => void>()
function notify() {
  for (const sub of _subscribers) sub()
}
function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _state = loadState()
  notify()
}
function persist(): boolean {
  return saveState(_state)
}

let _cachedSnapshot: GraphState = _state
function getSnapshot(): GraphState {
  if (_cachedSnapshot !== _state) _cachedSnapshot = _state
  return _cachedSnapshot
}
function getServerSnapshot(): GraphState {
  return _cachedSnapshot
}
export function subscribe(cb: () => void) {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

export const graphViewStore = {
  getView(): GraphView {
    hydrateOnce()
    return _state.view
  },
  updateView(patch: Partial<GraphView>): void {
    hydrateOnce()
    const current = _state.view
    // Public store callers include pointer/AI code, so validate writes too;
    // checking only localStorage on the next reload leaves the live graph
    // poisoned for the rest of the current session.
    const view: GraphView = {
      zoom: finiteNumber(patch.zoom) ? patch.zoom : current.zoom,
      panX: finiteNumber(patch.panX) ? patch.panX : current.panX,
      panY: finiteNumber(patch.panY) ? patch.panY : current.panY,
    }
    const next = { ..._state, view }
    const prev = _state
    _state = next
    if (!persist()) {
      _state = prev
      notifyQuota()
    }
    notify()
  },
  getPosition(id: string): NodePosition | null {
    hydrateOnce()
    return _state.positions[id] ?? null
  },
  getAllPositions(): Record<string, NodePosition> {
    hydrateOnce()
    return _state.positions
  },
  setPosition(id: string, pos: NodePosition): void {
    hydrateOnce()
    const safe = sanitizePosition(pos)
    if (!safe) return
    const prev = _state
    _state = { ..._state, positions: { ..._state.positions, [id]: safe } }
    if (!persist()) {
      _state = prev
      notifyQuota()
    }
    notify()
  },
  setPositions(positions: Record<string, NodePosition>): void {
    hydrateOnce()
    const safePositions: Record<string, NodePosition> = {}
    for (const [id, pos] of Object.entries(positions)) {
      const safe = sanitizePosition(pos)
      if (safe) safePositions[id] = safe
    }
    const prev = _state
    _state = { ..._state, positions: safePositions }
    if (!persist()) {
      _state = prev
      notifyQuota()
    }
    notify()
  },
  /** 清掉不在 knownIds 里的节点缓存(节点删除后淘汰旧坐标)。 */
  prunePositions(knownIds: Set<string>): void {
    hydrateOnce()
    const next: Record<string, NodePosition> = {}
    for (const [id, p] of Object.entries(_state.positions)) {
      if (knownIds.has(id)) next[id] = p
    }
    const prev = _state
    _state = { ..._state, positions: next }
    if (!persist()) {
      _state = prev
      notifyQuota()
    }
    notify()
  },
  resetAll(): void {
    hydrateOnce()
    const prev = _state
    _state = { view: DEFAULT_VIEW, positions: {} }
    if (!persist()) {
      _state = prev
      notifyQuota()
    }
    notify()
  },
}

export function useGraphView(): { view: GraphView; ready: boolean } {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateOnce()
    setReady(true)
  }, [])
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const view = useMemo(() => snap.view, [snap])
  return useMemo(() => ({ view, ready }), [view, ready])
}
