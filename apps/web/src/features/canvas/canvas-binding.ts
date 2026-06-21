'use client'

/**
 * Canvas binding — the spec §6.11 contract: the SQLite `cards.canvasPosition`
 * column is the single source of truth, NOT tldraw's store.
 *
 *   load  : DB cards → tldraw shapes → editor   (mergeRemoteChanges so it
 *           doesn't trip our own 'user'-source writeback listener)
 *   write : editor.store.listen('user') → debounce ~300ms → moveToCanvas → DB
 *
 * The shape's id IS the domain CardId, so a shape round-trips to the same
 * card. z (stacking) is preserved per-card on drag; precise z-order syncing
 * with tldraw's internal page order is a Phase 5 refinement.
 */
import type { Editor, TLShapePartial, TLShapeId } from '@tldraw/tldraw'
import type {
  Card,
  CardId,
  CanvasId,
  CanvasPosition,
  CardService,
} from '@cys-stift/domain'
import type { CardShape } from './card-shape-util'

const WRITEBACK_DEBOUNCE_MS = 300
const DEFAULT_W = 240
const DEFAULT_H = 120

/** tldraw requires shape ids to be prefixed "shape:" — encode the card id after it. */
export function cardShapeIdOf(cardId: CardId): TLShapeId {
  return `shape:${cardId}` as unknown as TLShapeId
}

/** Inverse of cardShapeIdOf — recover the domain CardId from a tldraw shape id. */
export function cardIdFromShapeId(shapeId: string): CardId {
  return String(shapeId).replace(/^shape:/, '') as unknown as CardId
}

/** Push a single card's full state onto its editor shape (title/kind/size). */
function writeCardToShape(editor: Editor, card: Card): void {
  const p = card.canvasPosition
  editor.updateShape({
    id: cardShapeIdOf(card.id),
    type: 'card',
    props: {
      w: p?.w ?? DEFAULT_W,
      h: p?.h ?? DEFAULT_H,
    },
  })
}

/** Domain Card → tldraw card-shape partial. Shape id = card id. */
/** Domain Card → tldraw card-shape partial. Shape id = "shape:" + card id. */
export function cardToShape(card: Card): TLShapePartial {
  const p = card.canvasPosition
  return {
    id: cardShapeIdOf(card.id),
    type: 'card',
    x: p?.x ?? 0,
    y: p?.y ?? 0,
    rotation: p?.rotation ?? 0,
    props: {
      w: p?.w ?? DEFAULT_W,
      h: p?.h ?? DEFAULT_H,
    },
  }
}

/** tldraw card-shape → CanvasPosition, preserving the card's existing z. */
export function shapeToCardPosition(
  shape: CardShape,
  canvasId: CanvasId,
  existingZ: number,
): CanvasPosition {
  return {
    canvasId,
    x: shape.x,
    y: shape.y,
    w: shape.props.w,
    h: shape.props.h,
    z: existingZ,
    rotation: shape.rotation,
  }
}

/**
 * Load all cards on `canvasId` into the editor, oldest-z first so stacking
 * matches. Marked remote so it never re-triggers the writeback listener.
 */
export function loadCardsIntoEditor(
  editor: Editor,
  service: CardService,
  canvasId: CanvasId,
): void {
  // spec §1.4: archived + soft-deleted cards are hidden from the canvas.
  const cards = [...service.listOnCanvas(canvasId)]
    .filter((c) => !c.archived && !c.deletedAt)
    .sort((a, b) => (a.canvasPosition?.z ?? 0) - (b.canvasPosition?.z ?? 0))
  if (cards.length === 0) return
  editor.store.mergeRemoteChanges(() => {
    for (const card of cards) {
      // F1.5: skip cards already on the canvas (restored from the snapshot)
      // so we don't double-create or trip the writeback listener.
      if (editor.getShape(cardShapeIdOf(card.id))) continue
      editor.createShape(cardToShape(card))
    }
  })
}

/**
 * Subscribe to user-driven shape changes and debounce-write positions back to
 * the DB. Returns an unsubscribe (tldraw also tears this down with the editor).
 */
export function bindCardWriteback(
  editor: Editor,
  service: CardService,
  canvasId: CanvasId,
): () => void {
  const pending = new Map<string, CardShape>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    for (const shape of pending.values()) {
      const cardId = cardIdFromShapeId(String(shape.id))
      const card = service.get(cardId)
      if (!card) continue // card vanished (e.g. soft-deleted) — skip
      const z = card.canvasPosition?.z ?? 0
      service.moveToCanvas(cardId, shapeToCardPosition(shape, canvasId, z))
    }
    pending.clear()
  }

  const scheduleFlush = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, WRITEBACK_DEBOUNCE_MS)
  }

  return editor.store.listen(
    (entry) => {
      for (const change of Object.values(entry.changes.updated)) {
        // changes.updated values are [from, to] tuples; [1] is the new state.
        const after = change?.[1]
        if (after?.typeName === 'shape' && after.type === 'card') {
          pending.set(after.id as unknown as string, after as CardShape)
        }
      }
      if (pending.size > 0) scheduleFlush()
    },
    { source: 'user', scope: 'document' },
  )
}

/**
 * Add a card to the editor (e.g. just created via double-click). Marked remote
 * so it doesn't trip the writeback listener.
 */
export function addCardShape(editor: Editor, card: Card): void {
  if (editor.getShape(cardShapeIdOf(card.id))) return
  editor.store.mergeRemoteChanges(() => editor.createShape(cardToShape(card)))
}

/** Sync a card's content/size onto its editor shape (e.g. after a modal edit). */
export function updateCardShape(editor: Editor, card: Card): void {
  if (!editor.getShape(cardShapeIdOf(card.id))) return
  editor.store.mergeRemoteChanges(() => writeCardToShape(editor, card))
}

/** Remove a card's shape (e.g. after archive / soft-delete, both hide from canvas). */
export function removeCardShape(editor: Editor, cardId: CardId): void {
  if (!editor.getShape(cardShapeIdOf(cardId))) return
  editor.store.mergeRemoteChanges(() => editor.deleteShape(cardShapeIdOf(cardId)))
}
