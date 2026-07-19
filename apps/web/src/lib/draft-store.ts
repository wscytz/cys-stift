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

function saveDrafts(map: DraftMap): boolean {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ drafts: map }))
    return true
  } catch {
    // Quota exceeded / private mode — drafts are best-effort. The user's
    // input still lives in component state for the current session. R2.10:
    // surface the failure (return false) instead of swallowing it silently
    // so the UI can warn that the draft may not survive a reload.
    return false
  }
}

// ── Module singleton ───────────────────────────────────────────────────────

let _drafts: DraftMap = {}
let _hydrated = false
const _subscribers = new Set<() => void>()

// R2.10: remember whether the last saveDrafts() call succeeded so the UI can
// warn when autosave is silently failing (quota exceeded). Defaults to true
// (no failure observed yet).
let _lastSaveOk = true

// 配额失败订阅(Task 6 镜像 db-client):saveDrafts 失败 → 回滚 + notifyQuota → AppMenu toast。
const _quotaSubscribers = new Set<() => void>()
function notifyQuota(): void { for (const cb of _quotaSubscribers) cb() }
export function onQuotaExceeded(cb: () => void): () => void {
  _quotaSubscribers.add(cb)
  return () => { _quotaSubscribers.delete(cb) }
}

/**
 * Returns whether the most recent draft write persisted to localStorage.
 * false means the last upsert/clear hit QuotaExceededError (or similar) —
 * the draft lives only in component state and will be lost on reload.
 */
export function isDraftPersistOk(): boolean {
  return _lastSaveOk
}

function notify() {
  for (const sub of _subscribers) sub()
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _drafts = loadDrafts()
  notify()
}

/**
 * Re-read drafts after an external storage restore/import.
 * Drafts are hydrate-once in normal operation, but importFromJson writes the
 * backing key directly. Replacing the module snapshot here prevents a stale
 * in-memory draft from being written back over the restored data.
 */
export function rehydrateDrafts(): void {
  if (typeof window === 'undefined') return
  _hydrated = true
  _drafts = loadDrafts()
  _lastSaveOk = true
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
  /** Re-read drafts after an external storage restore/import. */
  rehydrate(): void {
    rehydrateDrafts()
  },
  get<P = unknown>(kind: DraftKind): Draft & { payload: P } | null {
    hydrateOnce()
    const d = _drafts[kind]
    if (!d) return null
    return d as Draft & { payload: P }
  },
  upsert(kind: DraftKind, payload: unknown): void {
    hydrateOnce()
    const prev = _drafts
    const next: DraftMap = { ..._drafts }
    next[kind] = { kind, payload, updatedAt: new Date().toISOString() }
    _drafts = next
    const ok = saveDrafts(_drafts)
    if (!ok) { _drafts = prev; notifyQuota() }
    _lastSaveOk = ok
    notify()
  },
  clear(kind: DraftKind): void {
    hydrateOnce()
    if (!_drafts[kind]) return
    const prev = _drafts
    const next: DraftMap = { ..._drafts }
    delete next[kind]
    _drafts = next
    const ok = saveDrafts(_drafts)
    if (!ok) { _drafts = prev; notifyQuota() }
    _lastSaveOk = ok
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
