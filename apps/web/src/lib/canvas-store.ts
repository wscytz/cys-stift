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

function saveSnapshot(snap: CanvasesSnapshot) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ snapshot: snap }))
  } catch {
    // quota / private mode — best effort.
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

function persist() {
  saveSnapshot(_snap)
  notify()
}

let _cached: CanvasesSnapshot = _snap
function getSnapshot(): CanvasesSnapshot {
  if (_cached !== _snap) _cached = _snap
  return _cached
}

function getServerSnapshot(): CanvasesSnapshot {
  return _cached
}

function subscribe(cb: () => void): () => void {
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
    _snap = { ..._snap, activeCanvasId: id }
    persist()
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
    _snap = {
      canvases: [..._snap.canvases, canvas],
      activeCanvasId: canvas.id,
    }
    persist()
    return canvas.id
  },
  /** Rename a canvas. No-op if id is unknown or name is empty. */
  rename(id: CanvasId, name: string): void {
    hydrateOnce()
    const trimmed = trimName(name)
    if (!trimmed) return
    _snap = {
      ..._snap,
      canvases: _snap.canvases.map((c) =>
        c.id === id ? { ...c, name: trimmed, updatedAt: new Date() } : c,
      ),
    }
    persist()
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
    const wasActive = _snap.activeCanvasId === id
    _snap = {
      canvases: _snap.canvases.filter((c) => c.id !== id),
      activeCanvasId: wasActive ? DEFAULT_CANVAS_ID : _snap.activeCanvasId,
    }
    persist()
    // B4 (v0.26.4): free the persisted freeform data — otherwise a canvas
    // deletion leaves its non-card elements (text / freedraw / arrows / rects)
    // stranded forever. Callers should have already moved cards back to inbox
    // before delete. canvasFreeformStore.remove also cleans up any leftover
    // pre-self-built tldraw snapshot for this canvas.
    canvasFreeformStore.remove(id).catch(() => {})
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
