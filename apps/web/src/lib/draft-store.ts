'use client'

import { useEffect, useMemo, useSyncExternalStore, useState } from 'react'

// ── Draft autosave (spec §5.5 "输入即保存草稿") ────────────────────────────
// Web-local store backed by localStorage, independent of the cards store
// (cys-stift.cards.v1). Draft changes must NOT trigger card list re-renders,
// so drafts live under their own key. On Tauri (Phase 8) drafts move to
// Tauri fs; this abstraction keeps the call sites unchanged.

const STORAGE_KEY = 'cys-stift.drafts.v1'

export type DraftKind = 'capture' | 'manual'

/**
 * A persisted draft. `payload` is intentionally `unknown` so each consumer
 * (Mini Input / CreateCardForm) can cast its own shape without polluting
 * the type system or the domain layer. Drafts are web-local UI state, not
 * core business entities — they never enter packages/domain.
 */
export interface Draft {
  kind: DraftKind
  payload: unknown
  updatedAt: string // ISO string (serialisable)
}

type DraftMap = Partial<Record<DraftKind, Draft>>

function loadDrafts(): DraftMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { drafts?: DraftMap }
    return parsed.drafts ?? {}
  } catch {
    return {}
  }
}

function saveDrafts(map: DraftMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ drafts: map }))
  } catch {
    // Quota exceeded / private mode — drafts are best-effort. The user's
    // input still lives in component state for the current session.
  }
}

// ── Module singleton ───────────────────────────────────────────────────────

let _drafts: DraftMap = {}
let _hydrated = false
const _subscribers = new Set<() => void>()

function notify() {
  for (const sub of _subscribers) sub()
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _drafts = loadDrafts()
  notify()
}

// Stable snapshot cache — only reallocate when _drafts reference changes,
// mirroring the pattern in db-client.ts so useSyncExternalStore stays happy.
let _cachedSnapshot: DraftMap = _drafts
function getSnapshot(): DraftMap {
  if (_cachedSnapshot !== _drafts) {
    _cachedSnapshot = _drafts
  }
  return _cachedSnapshot
}

function getServerSnapshot(): DraftMap {
  return _cachedSnapshot
}

function subscribe(cb: () => void) {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export const draftStore = {
  get<P = unknown>(kind: DraftKind): Draft & { payload: P } | null {
    const d = _drafts[kind]
    if (!d) return null
    return d as Draft & { payload: P }
  },
  upsert(kind: DraftKind, payload: unknown): void {
    const next: DraftMap = { ..._drafts }
    next[kind] = { kind, payload, updatedAt: new Date().toISOString() }
    _drafts = next
    saveDrafts(_drafts)
    notify()
  },
  clear(kind: DraftKind): void {
    if (!_drafts[kind]) return
    const next: DraftMap = { ..._drafts }
    delete next[kind]
    _drafts = next
    saveDrafts(_drafts)
    notify()
  },
}

/**
 * useDraft — client-only hook. SSR returns `{ draft: null, ready: false }`;
 * after mount we hydrate from localStorage. Subscribes to draft changes so
 * the consumer re-renders when a draft is updated/cleared elsewhere.
 */
export function useDraft<P = unknown>(kind: DraftKind): {
  draft: (Draft & { payload: P }) | null
  ready: boolean
} {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateOnce()
    setReady(true)
  }, [])
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const draft = useMemo(() => {
    const d = snap[kind]
    if (!d) return null
    return d as Draft & { payload: P }
  }, [snap, kind])
  return { draft, ready }
}
