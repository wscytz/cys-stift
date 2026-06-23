'use client'

/**
 * Canvas binding — spec §6.11 contract: the SQLite `cards.canvasPosition`
 * column is the single source of truth, NOT the engine's store.
 *
 *   load  : DB cards → host elements → host   (applyWithoutEcho so it
 *           doesn't trip our own 'user'-source writeback listener)
 *   write : host.onUserChange('user') → debounce ~300ms → moveToCanvas → DB
 *
 * The element id IS the domain CardId; the engine-specific id format
 * (tldraw 'shape:' prefix) is handled inside the adapter.
 *
 * Phase 0 / T2 (2026-06-22): refactored to depend on CanvasHost instead of
 * the tldraw Editor directly. Behaviour identical to the pre-refactor version
 * (mergeRemoteChanges→applyWithoutEcho, store.listen→onUserChange, etc.).
 */
import type {
  Card,
  CardId,
  CanvasId,
  CanvasPosition,
  CardService,
} from '@cys-stift/domain'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'

const WRITEBACK_DEBOUNCE_MS = 300
const DEFAULT_W = 240
const DEFAULT_H = 120

// ── id helpers (pure; kept for double-click-bridge + tests) ──────────────────
// The 'shape:' prefix is a tldraw convention; these stay as pure string ops so
// callers that hold a raw tldraw shape id (e.g. a hit-test result) can recover
// the card id without going through the host.

/** tldraw shape ids are prefixed 'shape:' — encode the card id after it. */
export function cardShapeIdOf(cardId: CardId): string {
  return `shape:${cardId}`
}

/** Inverse of cardShapeIdOf — recover the domain CardId from a shape id. */
export function cardIdFromShapeId(shapeId: string): CardId {
  return String(shapeId).replace(/^shape:/, '') as unknown as CardId
}

// ── domain Card ↔ host element ───────────────────────────────────────────────

/** Domain Card → host CanvasElement (geometry only; content lives in CardService). */
export function cardToElement(card: Card): CanvasElement {
  const p = card.canvasPosition
  return {
    id: String(card.id),
    kind: 'card',
    x: p?.x ?? 0,
    y: p?.y ?? 0,
    w: p?.w ?? DEFAULT_W,
    h: p?.h ?? DEFAULT_H,
    rotation: p?.rotation ?? 0,
  }
}

/** host element (a card) → CanvasPosition, preserving the card's existing z. */
export function elementToCardPosition(
  el: CanvasElement,
  canvasId: CanvasId,
  existingZ: number,
): CanvasPosition {
  return {
    canvasId,
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    z: existingZ,
    rotation: el.rotation,
  }
}

// ── load / sync ──────────────────────────────────────────────────────────────

/**
 * Load all cards on `canvasId` into the host, oldest-z first so stacking
 * matches. Marked no-echo so it never re-triggers the writeback listener.
 */
export function loadCardsIntoEditor(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
): void {
  // spec §1.4: archived + soft-deleted cards are hidden from the canvas.
  const cards = [...service.listOnCanvas(canvasId)]
    .filter((c) => !c.archived && !c.deletedAt)
    .sort((a, b) => (a.canvasPosition?.z ?? 0) - (b.canvasPosition?.z ?? 0))
  if (cards.length === 0) return
  host.applyWithoutEcho(() => {
    for (const card of cards) {
      // B3 (v0.26.4): the DB is the source of truth. If the element already
      // exists (restored from the snapshot) but its position/z/rotation drifted
      // from the DB, reconcile to the DB position rather than skipping.
      const existing = host.getElement(String(card.id))
      const db = card.canvasPosition
      if (existing) {
        const drift =
          existing.x !== db?.x ||
          existing.y !== db?.y ||
          existing.w !== (db?.w ?? DEFAULT_W) ||
          existing.h !== (db?.h ?? DEFAULT_H) ||
          existing.rotation !== (db?.rotation ?? 0)
        if (drift) host.upsert(cardToElement(card))
      } else {
        host.upsert(cardToElement(card))
      }
    }
  })
}

/**
 * Subscribe to user-driven element changes and debounce-write positions back to
 * the DB. Returns an unsubscribe.
 */
export function bindCardWriteback(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
): () => void {
  const pending = new Map<string, CanvasElement>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    for (const el of pending.values()) {
      const cardId = el.id as CardId
      const card = service.get(cardId)
      // B5 (v0.26.4): guard against clobbering a concurrent restore / move.
      if (!card) continue
      if (card.deletedAt) continue
      if (card.archived) continue
      if (card.canvasPosition?.canvasId !== canvasId) continue
      const z = card.canvasPosition?.z ?? 0
      service.moveToCanvas(cardId, elementToCardPosition(el, canvasId, z))
    }
    pending.clear()
  }

  const scheduleFlush = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, WRITEBACK_DEBOUNCE_MS)
  }

  const unsub = host.onUserChange(({ updated, removed }) => {
    for (const el of updated) {
      if (el.kind === 'card') pending.set(el.id, el)
    }
    // Eraser-on-card interaction (v0.37.0 dev-feedback fix): a user-source
    // removal of a card element soft-deletes the underlying card (→ /trash,
    // recoverable) — matching the card-detail modal's delete semantics.
    // Programmatic removals (load/sync) run under applyWithoutEcho so they're
    // NOT 'user'-source and won't trigger this.
    for (const id of removed) {
      const card = service.get(id as CardId)
      if (card && !card.deletedAt && card.canvasPosition?.canvasId === canvasId) {
        service.softDelete(id as CardId)
      }
    }
    if (pending.size > 0) scheduleFlush()
  })

  // Review fix (v0.37.0): flush synchronously before unsubscribing so a card
  // dragged then immediately followed by a canvas switch / route change / tab
  // close doesn't lose its last position.
  return () => {
    if (timer) {
      clearTimeout(timer)
      flush()
    }
    unsub()
  }
}

/**
 * Sync CardService → host: add elements missing from the host (e.g. sent to
 * canvas from inbox), remove elements no longer on this canvas (sent back to
 * inbox / archived / soft-deleted). No-echo so the writeback listener ignores.
 */
export function syncCardsToEditor(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
): void {
  host.applyWithoutEcho(() => {
    const wanted = service
      .listOnCanvas(canvasId)
      .filter((c) => !c.archived && !c.deletedAt)
    const wantedIds = new Set(wanted.map((c) => String(c.id)))
    // Add missing.
    for (const card of wanted) {
      if (host.getElement(String(card.id))) continue
      host.upsert(cardToElement(card))
    }
    // Remove orphaned card elements (on canvas but no longer in CardService here).
    for (const el of host.getElements()) {
      if (el.kind !== 'card') continue
      if (!wantedIds.has(el.id)) host.remove(el.id)
    }
  })
}

/**
 * Add a card to the host (e.g. just created via double-click). No-echo so it
 * doesn't trip the writeback listener.
 */
export function addCardShape(host: CanvasHost, card: Card): void {
  if (host.getElement(String(card.id))) return
  host.applyWithoutEcho(() => host.upsert(cardToElement(card)))
}

/** Sync a card's size onto its host element (e.g. after a modal edit). */
export function updateCardShape(host: CanvasHost, card: Card): void {
  if (!host.getElement(String(card.id))) return
  host.applyWithoutEcho(() => host.upsert(cardToElement(card)))
}

/** Remove a card's element (e.g. after archive / soft-delete, both hide it). */
export function removeCardShape(host: CanvasHost, cardId: CardId): void {
  if (!host.getElement(String(cardId))) return
  host.applyWithoutEcho(() => host.remove(String(cardId)))
}
