'use client'

/**
 * M2.1 — Edge connector helper. Provides the "create arrow from card edge"
 * flow that drives `CardShapeUtil.getHandles` and its drag callbacks.
 *
 * The implementation is a thin wrapper over the M1-verified two-step arrow
 * creation (M1 e2e scripts/m1-relations-shots.cjs:60-86):
 *   1) editor.createShape({ type: 'arrow', x, y, props: { kind:'arc',
 *      start:{x:0,y:0}, end:{x:dx,y:dy} } })
 *   2) editor.createBinding(...) × 2  (start + end)
 *
 * The M1 e2e confirms that putting binding props directly inside arrow.props
 * is rejected by tldraw's schema — the two-step path is the only correct one.
 *
 * Inline TLHandle-like type: tldraw 3.15.6 ships the `TLHandle` type from
 * `@tldraw/editor`, which isn't a direct web dependency. Mirroring the shape
 * inline keeps this file zero-new-dep and prevents drift if tldraw bumps
 * handle semantics — our usage is the minimal vertex-handle contract.
 */
import type { Editor, TLShapeId } from '@tldraw/tldraw'
import type { CardId } from '@cys-stift/domain'

export type HandleSide = 'top' | 'bottom' | 'left' | 'right'

/** Minimal vertex-handle shape. Mirrors tldraw's TLHandle (id, type, x, y,
 *  index). We only need vertex handles at edge midpoints, so we omit fields
 *  we don't read (label, canSnap, snapping). */
export interface CardHandle {
  id: string
  type: 'vertex'
  index: string
  x: number
  y: number
}

/** Build 4 vertex handles at the midpoints of a card's four edges.
 *  Handle (x, y) are shape-local coords (shape origin = top-left of card). */
export function getCardHandles(shape: { props: { w: number; h: number } }): CardHandle[] {
  const { w, h } = shape.props
  return [
    { id: 'top', type: 'vertex', index: 'a0', x: w / 2, y: 0 },
    { id: 'bottom', type: 'vertex', index: 'a1', x: w / 2, y: h },
    { id: 'left', type: 'vertex', index: 'a2', x: 0, y: h / 2 },
    { id: 'right', type: 'vertex', index: 'a3', x: w, y: h / 2 },
  ]
}

/** Create a binding arrow from the source card to whatever card (if any) the
 *  user dropped onto. Returns the arrow id, or null if drop missed any card.
 *
 *  tldraw 3.15.6's `editor.createShape()` returns the editor itself (chainable
 *  API), not the new shape id. We fetch the new arrow from the page state by
 *  diffing ids before/after (the only arrow on the page is the one we just
 *  created — user drag was the only mutation source). */
export function createArrowFromHandle(
  editor: Editor,
  sourceCardId: CardId,
  dropPage: { x: number; y: number },
): TLShapeId | null {
  // Hit-test: what's at the drop point? (tldraw returns topmost shape.)
  const target = editor.getShapeAtPoint(dropPage, { hitInside: true })
  if (!target || target.type !== 'card') return null
  const targetCardId = String(target.id).replace(/^shape:/, '')
  if (targetCardId === String(sourceCardId)) return null // can't arrow to self

  // Source card's page-space bounds
  const sourceBounds = editor.getShapePageBounds(
    `shape:${String(sourceCardId)}` as TLShapeId,
  )
  if (!sourceBounds) return null

  // Snapshot the page's arrow ids BEFORE createShape so we can identify the
  // newly created arrow (it's the only one not in the before-set).
  const idsBefore = new Set<string>(
    [...editor.getCurrentPageShapeIds()].map((id) => String(id)),
  )

  // M1-verified two-step: create plain arrow first…
  editor.createShape({
    type: 'arrow',
    x: sourceBounds.center.x,
    y: sourceBounds.center.y,
    props: {
      kind: 'arc',
      start: { x: 0, y: 0 },
      end: { x: target.x - sourceBounds.center.x, y: target.y - sourceBounds.center.y },
    },
  })

  const idsAfter = [...editor.getCurrentPageShapeIds()].map((id) => String(id))
  const arrowIdStr = idsAfter.find((id) => !idsBefore.has(id) && id !== String(target.id))
  if (!arrowIdStr) return null
  const arrowId = arrowIdStr as TLShapeId

  // …then bind both terminals via editor.createBinding.
  editor.createBinding({
    type: 'arrow',
    fromId: arrowId,
    toId: `shape:${sourceCardId}` as TLShapeId,
    props: {
      terminal: 'start',
      normalizedAnchor: { x: 0.5, y: 0.5 },
      isPrecise: false,
      isExact: false,
      snap: 'none',
    },
  })
  editor.createBinding({
    type: 'arrow',
    fromId: arrowId,
    toId: target.id as TLShapeId,
    props: {
      terminal: 'end',
      normalizedAnchor: { x: 0.5, y: 0.5 },
      isPrecise: false,
      isExact: false,
      snap: 'none',
    },
  })
  return arrowId
}

/**
 * Module-level editor ref. tldraw's onHandleDragStart/End callbacks receive
 * (shape, info) but NOT the editor handle, and are invoked outside React
 * render context so useEditor() can't be called. The CardShapeUtil.component
 * writes the live editor into `_currentEditor` on every render; the handle
 * callbacks read from it. Set to null on unmount by the same component.
 */
let _currentEditor: Editor | null = null
export function setCurrentCardEditor(ed: Editor | null): void {
  _currentEditor = ed
}
export function getCurrentCardEditor(): Editor | null {
  return _currentEditor
}

/** Read the current pointer position in page-space. */
export function getCurrentPointerPage(): { x: number; y: number } | null {
  const ed = _currentEditor
  if (!ed) return null
  const p = ed.inputs.currentPagePoint
  return { x: p.x, y: p.y }
}