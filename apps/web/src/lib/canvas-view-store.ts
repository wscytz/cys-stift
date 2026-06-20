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

function saveViewMap(views: ViewMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ views }))
  } catch {
    // quota / private mode — best-effort.
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

function persist() {
  saveViewMap(_views)
  notify()
}

// Stable snapshot cache — only reallocate when _views changes.
let _cachedSnapshot: ViewMap = _views
function getSnapshot(): ViewMap {
  if (_cachedSnapshot !== _views) {
    _cachedSnapshot = _views
  }
  return _cachedSnapshot
}

function getServerSnapshot(): ViewMap {
  return _cachedSnapshot
}

function subscribe(cb: () => void) {
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
    _views = { ..._views, [id]: next }
    persist()
  },
  /** Reset a single canvas's view to defaults. */
  reset(id: CanvasId): void {
    hydrateOnce()
    if (!(id in _views)) return
    const next = { ..._views }
    delete next[id]
    _views = next
    persist()
  },
  /** Reset every canvas's view (used by "Reset view" UI in the future). */
  resetAll(): void {
    hydrateOnce()
    if (Object.keys(_views).length === 0) return
    _views = {}
    persist()
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
