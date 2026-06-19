'use client'

import { useEffect, useMemo, useSyncExternalStore, useState } from 'react'

// ── Canvas view persistence (spec §4.3 gridMode / Phase 5 closeout) ────────
// Web-local view state backed by localStorage. Single canvas in MVP
// (DEFAULT_CANVAS_ID), so we don't key by canvas id. When Phase 8
// introduces Tauri fs, this moves to Tauri fs + canvases.viewJson
// (schema already has the column, spec §4.9).

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

function isValid(v: unknown): v is CanvasView {
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

function loadView(): CanvasView {
  if (typeof window === 'undefined') return DEFAULT_VIEW
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VIEW
    const parsed = JSON.parse(raw) as { view?: unknown }
    return isValid(parsed.view) ? parsed.view : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

function saveView(view: CanvasView) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ view }))
  } catch {
    // Quota / private mode — best-effort.
  }
}

// ── Module singleton ───────────────────────────────────────────────────────

let _view: CanvasView = DEFAULT_VIEW
let _hydrated = false
const _subscribers = new Set<() => void>()

function notify() {
  for (const sub of _subscribers) sub()
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _view = loadView()
  notify()
}

// Stable snapshot cache — only reallocate when _view changes.
let _cachedSnapshot: CanvasView = _view
function getSnapshot(): CanvasView {
  if (_cachedSnapshot !== _view) {
    _cachedSnapshot = _view
  }
  return _cachedSnapshot
}

function getServerSnapshot(): CanvasView {
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
  /** Synchronous read — calls hydrateOnce() so the first read reflects
   * localStorage. After that, repeated reads are cheap (just returns _view). */
  get(): CanvasView {
    hydrateOnce()
    return _view
  },
  update(patch: Partial<CanvasView>): void {
    hydrateOnce()
    const next: CanvasView = { ..._view, ...patch }
    _view = next
    saveView(_view)
    notify()
  },
  reset(): void {
    hydrateOnce()
    _view = DEFAULT_VIEW
    saveView(_view)
    notify()
  },
}

/**
 * useCanvasView — read the persisted view. After hydration the snapshot
 * reflects localStorage; before that, the defaults are returned (safe
 * for SSR / first client paint).
 */
export function useCanvasView(): { view: CanvasView; ready: boolean } {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateOnce()
    setReady(true)
  }, [])
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => ({ view, ready }), [view, ready])
}