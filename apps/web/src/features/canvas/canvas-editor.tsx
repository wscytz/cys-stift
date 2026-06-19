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
import { canvasViewStore } from '@/lib/canvas-view-store'

const shapeUtils = [CardShapeUtil]
const DEVICE_ID = 'web'
const DEFAULT_CARD_W = 240
const DEFAULT_CARD_H = 120
const VIEW_PERSIST_DEBOUNCE_MS = 500

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
          // ── View persistence (Phase 6.5d) ──────────────────────────
          // Load zoom/pan/gridMode from web-local store and apply before
          // any shapes render. Default fallback inside canvasViewStore.
          const view = canvasViewStore.get()
          editor.setCamera({ x: view.panX, y: view.panY, z: view.zoom })
          // spec §4.3 — gridMode + gridSize. isGridMode is the master
          // snap toggle; user.isSnapMode inverts ctrl-key behaviour. Both
          // must agree so toolbar state matches drag behaviour (Phase 5).
          const snap = view.gridMode === 'snap'
          editor.updateInstanceState({ isGridMode: snap })
          editor.user.updateUserPreferences({ isSnapMode: snap })
          editor.updateDocumentSettings({ gridSize: view.gridSize })
          // Diagnostic hook — lets the puppeteer scripts inspect live
          // editor state (isGridMode, gridSize, camera, etc.) without
          // monkey-patching internals. Cheap and only runs once at mount.
          if (typeof window !== 'undefined') {
            ;(window as unknown as { __canvasEditor?: Editor }).__canvasEditor = editor
          }
          loadCardsIntoEditor(editor, service, canvasId)
          bindCardWriteback(editor, service, canvasId)
          // ── Persist view changes (zoom/pan/gridMode) ────────────────
          // Debounce: 500ms of silence → write to store. Cleanup on
          // editor dispose (tldraw calls dispose when unmounted).
          let timer: ReturnType<typeof setTimeout> | null = null
          const unsub = editor.store.listen(
            () => {
              if (timer !== null) clearTimeout(timer)
              timer = setTimeout(() => {
                timer = null
                const cam = editor.getCamera()
                const inst = editor.getInstanceState()
                const isSnap = Boolean(inst.isGridMode)
                canvasViewStore.update({
                  zoom: cam.z,
                  panX: cam.x,
                  panY: cam.y,
                  gridMode: isSnap ? 'snap' : 'free',
                })
              }, VIEW_PERSIST_DEBOUNCE_MS)
            },
          )
          // tldraw exposes editor.dispose; call our cleanup alongside.
          const prevDispose = editor.dispose.bind(editor)
          editor.dispose = () => {
            if (timer !== null) clearTimeout(timer)
            unsub()
            prevDispose()
          }
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
