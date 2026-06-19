'use client'

/**
 * CanvasEditor — the real tldraw surface.
 *
 * This module statically imports `@tldraw/tldraw`, which touches `window` at
 * module load. It is NEVER imported at the top level of a module that runs
 * during the static-export prerender — `tldraw-canvas.tsx` loads it via dynamic
 * import() inside useEffect, so this code only runs in the browser after mount.
 * (Phase 4 spike verified this pattern; spec §6.11 / §12.)
 *
 * T3 wires the spec §6.11 binding (load DB cards → shapes; debounce-write shape
 * moves back to DB). T4 adds double-click: blank → create a card at the point;
 * card → open it. Single-click stays tldraw's selection/drag.
 */
import { Tldraw, type Editor } from '@tldraw/tldraw'
import type { CanvasId, Card, CardService } from '@cys-stift/domain'
import { CardShapeUtil } from './card-shape-util'
import {
  addCardShape,
  bindCardWriteback,
  cardIdFromShapeId,
  loadCardsIntoEditor,
} from './canvas-binding'

const shapeUtils = [CardShapeUtil]
const DEVICE_ID = 'web'
const DEFAULT_CARD_W = 240
const DEFAULT_CARD_H = 120

export interface CanvasEditorProps {
  service: CardService
  canvasId: CanvasId
  /** Open a card in the detail modal (freshly created or existing). */
  onOpenCard: (card: Card) => void
  /** Page lifts the editor handle so it can sync shapes after modal edits. */
  onEditorReady?: (editor: Editor) => void
}

export function CanvasEditor({
  service,
  canvasId,
  onOpenCard,
  onEditorReady,
}: CanvasEditorProps) {
  return (
    <div className="cv-editor">
      <Tldraw
        shapeUtils={shapeUtils}
        hideUi
        onMount={(editor: Editor) => {
          loadCardsIntoEditor(editor, service, canvasId)
          bindCardWriteback(editor, service, canvasId)
          onEditorReady?.(editor)
          wireDoubleClick(editor, service, canvasId, onOpenCard)
        }}
      />
    </div>
  )
}

/**
 * Double-click → create-on-canvas (spec §1.4) or open. Hit-testing tells blank
 * (create) from card (open). Listener lives on the editor container; tldraw
 * tears it down with the editor.
 */
function wireDoubleClick(
  editor: Editor,
  service: CardService,
  canvasId: CanvasId,
  onOpenCard: (card: Card) => void,
): void {
  const onDbl = (e: MouseEvent) => {
    const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY })
    const hit = editor.getShapeAtPoint(pagePoint)
    if (hit && hit.type === 'card') {
      const card = service.get(cardIdFromShapeId(String(hit.id)))
      if (card) onOpenCard(card)
      return
    }
    const card = service.create({
      title: '',
      source: { kind: 'manual', deviceId: DEVICE_ID },
      canvasPosition: {
        canvasId,
        x: Math.round(pagePoint.x),
        y: Math.round(pagePoint.y),
        w: DEFAULT_CARD_W,
        h: DEFAULT_CARD_H,
        z: Date.now(),
      },
    })
    addCardShape(editor, card)
    onOpenCard(card)
  }
  editor.getContainer().addEventListener('dblclick', onDbl)
}
