'use client'

import { useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import {
  CardService,
  type Card,
  type CardId,
  type CanvasId,
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
    }
    return parsed
  } catch {
    return { cards: [] }
  }
}

function saveSnapshot(snap: Snapshot) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap))
}

// ── In-memory + localStorage-backed CardRepository ──────────────────────────

let _cards: Card[] = []
let _hydrated = false
const _subscribers = new Set<() => void>()

function notify() {
  for (const sub of _subscribers) sub()
}

function persist() {
  saveSnapshot({ cards: _cards })
  notify()
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
        try {
          const parsed = JSON.parse(e.newValue) as { cards: Card[] }
          if (Array.isArray(parsed.cards)) {
            _cards = parsed.cards
            notify()
          }
        } catch {
          // ignore malformed payload from a concurrent import/save
        }
      }
    }
  })
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _cards = loadSnapshot().cards
  notify()
}

const cardRepo = {
  insert(card: Card) {
    _cards = [..._cards, card]
    persist()
  },
  update(card: Card) {
    _cards = _cards.map((c) => (c.id === card.id ? card : c))
    persist()
  },
  delete(id: CardId) {
    _cards = _cards.filter((c) => c.id !== id)
    persist()
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
