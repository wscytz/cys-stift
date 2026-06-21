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
 *
 * ## Review #4 + #5 fix (Phase canvas-refactor, 2026-06-20)
 *
 * The previous implementation ran all side-effects inside `Tldraw.onMount`:
 *
 *   - view persistence (`editor.store.listen(...)` with NO filter → review #5:
 *     every store change, including card moves, triggered a debounced camera
 *     read; functional but wasteful)
 *   - monkey-patched `editor.dispose = () => { ... }` to ensure cleanup ran
 *     → review #4: assumed tldraw calls `editor.dispose` on unmount; if that
 *     path changes, the listener + pending timer leak.
 *
 * The refactor splits side-effects by lifetime:
 *
 *   - `Tldraw.onMount` → only one-shot setup: apply persisted view, load cards,
 *     bind card writeback, expose `window.__canvasEditor`, call `onEditorReady`.
 *   - `<ViewPersistenceBridge>` → React `useValue` + `useEffect`. Reads
 *     camera and `isGridMode` via tldraw's reactive system (same pattern as
 *     `ZoomGroup`); debounce-writes to `canvasViewStore`. Cleanup is React's
 *     own `clearTimeout` — no editor.dispose patching, no listen with no
 *     filter.
 *   - `<DoubleClickBridge>` → React `useEffect` on `editor.getContainer()`.
 *     `addEventListener` + cleanup `removeEventListener`. Replaces the
 *     previous `wireDoubleClick()` which had no cleanup hook.
 */
import { useEffect, useRef } from 'react'
import { Tldraw, useValue, getSnapshot, loadSnapshot, type Editor, defaultShapeUtils } from '@tldraw/tldraw'
import type { CanvasId, Card, CardService } from '@cys-stift/domain'
import { CardShapeUtil } from './card-shape-util'
import { CardServiceContext } from './card-service-context'
import {
  addCardShape,
  bindCardWriteback,
  cardIdFromShapeId,
  loadCardsIntoEditor,
} from './canvas-binding'
import { canvasViewStore } from '@/lib/canvas-view-store'
import { canvasSnapshotStore } from '@/lib/canvas-snapshot-store'
import { captureSinkRegistry } from '@/features/capture/capture-sink'
import { getDeviceId } from '@/lib/device-id'

const shapeUtils = [CardShapeUtil, ...defaultShapeUtils]
const DEVICE_ID = getDeviceId()
const DEFAULT_CARD_W = 240
const DEFAULT_CARD_H = 120
const VIEW_PERSIST_DEBOUNCE_MS = 500

export interface CanvasEditorProps {
  service: CardService
  canvasId: CanvasId
  /**
   * Editor handle lifted to page state. Page calls `onEditorReady(editor)` from
   * `Tldraw.onMount`; the same handle is then passed back here as `editor` so
   * the bridge components can subscribe via React `useEffect` instead of
   * monkey-patching `editor.dispose`. Null until first mount.
   */
  editor: Editor | null
  /** Open a card in the detail modal (freshly created or existing). */
  onOpenCard: (card: Card) => void
  /** Page lifts the editor handle so it can sync shapes after modal edits. */
  onEditorReady?: (editor: Editor) => void
}

export function CanvasEditor({
  service,
  canvasId,
  editor,
  onOpenCard,
  onEditorReady,
}: CanvasEditorProps) {
  return (
    <div className="cv-editor">
      {/* F1.1: provide CardService so the card ShapeUtil.component can render
          from the domain source of truth (title/body/type/pinned) instead of
          staling props in tldraw's store. */}
      <CardServiceContext.Provider value={service}>
        <Tldraw
        shapeUtils={shapeUtils}
        hideUi
        components={{
          // v0.22.0-ui-polish: hide tldraw's built-in chrome so the canvas
          // page renders as a single two-layer UI (AppMenu + page toolbar).
          // Our own SnapToggle / ZoomGroup cover snap + zoom; SharePanel and
          // the menu/nav panels are page-level concerns that live elsewhere.
          TopPanel: () => null,
          SharePanel: () => null,
          MenuPanel: () => null,
          NavigationPanel: () => null,
          PageMenu: () => null,
        }}
        onMount={(ed: Editor) => {
          // ── F1.5: restore the full document (cards + freeform elements)
          //    from the per-canvas snapshot BEFORE backfilling / view setup.
          //    Document only — camera stays governed by canvasViewStore
          //    below so pan/zoom persistence is unaffected.
          const restored = canvasSnapshotStore.load(canvasId)
          if (restored) {
            try {
              // round-tripped JSON → cast back to loadSnapshot's expected shape
              loadSnapshot(
                ed.store,
                restored as unknown as Parameters<typeof loadSnapshot>[1],
              )
            } catch (e) {
              console.warn('[canvas] snapshot load failed', e)
            }
          }

          // ── View persistence (Phase 6.5d): apply zoom/pan/gridMode BEFORE
          //    first paint. Per-canvas (v0.15+).
          const view = canvasViewStore.get(canvasId)
          ed.setCamera({ x: view.panX, y: view.panY, z: view.zoom })
          const isSnap = view.gridMode === 'snap'
          ed.updateInstanceState({ isGridMode: isSnap })
          ed.user.updateUserPreferences({ isSnapMode: isSnap })
          ed.updateDocumentSettings({ gridSize: view.gridSize })

          // Diagnostic hooks for devtools + e2e scripts. Always set —
          // the production bundle keeps them so existing e2e suites
          // (17 references across scripts/*.cjs) keep working. Cleared
          // in EditorBindingBridge's cleanup (B8) so a canvas switch
          // doesn't leave a stale editor reference on window. The
          // references are Editor + CardService handles only — no card
          // contents leak (use them via svc.get(id) for that).
          // M2.3 — also expose `__cardService` so relation-inference can
          // look up bound card titles/bodies when an arrow is selected.
          if (typeof window !== 'undefined') {
            ;(window as unknown as { __canvasEditor?: Editor }).__canvasEditor = ed
            ;(window as unknown as { __cardService?: typeof service }).__cardService = service
          }

          // One-shot backfill: cards in CardService but not in the snapshot
          // (new card since last visit, or first visit with no snapshot).
          loadCardsIntoEditor(ed, service, canvasId)

          onEditorReady?.(ed)
          // No listen() / no editor.dispose monkey-patch from here on;
          // subscriptions (writeback + snapshot persist) live in
          // EditorBindingBridge below so they get cleaned up on unmount.
        }}
      />
      </CardServiceContext.Provider>
      <ViewPersistenceBridge editor={editor} canvasId={canvasId} />
      <EditorBindingBridge editor={editor} canvasId={canvasId} service={service} />
      <DoubleClickBridge
        editor={editor}
        canvasId={canvasId}
        service={service}
        onOpenCard={onOpenCard}
      />
    </div>
  )
}

/**
 * ViewPersistenceBridge — closes review #5 + #4 for view persistence.
 *
 * Subscribes to `editor.getCamera()` and `editor.getInstanceState().isGridMode`
 * via tldraw's reactive `useValue` (same primitive `ZoomGroup` uses for its
 * zoom-percentage readout). When either changes, a 500ms debounce timer
 * writes to `canvasViewStore`. The timer is cancelled on cleanup via plain
 * React — no `editor.dispose` patch, no `editor.store.listen(callback)`
 * without a filter (review #5 root cause was that listen fires on EVERY
 * store change including card drags; here we only run when camera or
 * isGridMode actually change).
 */
function ViewPersistenceBridge({ editor, canvasId }: { editor: Editor | null; canvasId: CanvasId }) {
  const cam = useValue('cvp camera', () => editor?.getCamera(), [editor])
  const isGrid = useValue(
    'cvp isGridMode',
    () => editor?.getInstanceState().isGridMode,
    [editor],
  )
  useEffect(() => {
    if (!editor || !cam) return
    const id = setTimeout(() => {
      canvasViewStore.update(canvasId, {
        zoom: cam.z,
        panX: cam.x,
        panY: cam.y,
        gridMode: isGrid ? 'snap' : 'free',
      })
    }, VIEW_PERSIST_DEBOUNCE_MS)
    return () => clearTimeout(id)
    // deps: editor + canvasId + the three camera scalars + isGrid flag.
    // useValue returns a fresh reference on each tick; using scalar fields
    // keeps the effect from re-running on unrelated reactivity churn.
    // canvasId is in deps so switching canvases writes to the new id.
  }, [editor, canvasId, cam?.z, cam?.x, cam?.y, isGrid])
  return null
}

/**
 * EditorBindingBridge — owns the two editor subscriptions that previously
 * lived in onMount with no cleanup (writeback + snapshot persist), plus the
 * `window.__canvasEditor` diagnostic hook.
 *
 * onMount can't return a cleanup (tldraw owns that callback), so these were
 * betting entirely on tldraw tearing the listeners down with the editor. This
 * bridge makes cleanup explicit: on unmount (or editor/canvas change) we
 * unsubscribe both listeners, clear the pending snapshot timer, and delete
 * the `__canvasEditor` global (B8 — a stale editor reference otherwise
 * lingers on window after a canvas switch). Same pattern as the other two
 * bridges; the onMount now only does one-shot setup.
 *
 * `service` is stable (memoised in useDb), so it's safe in the dep array.
 */
function EditorBindingBridge({
  editor,
  canvasId,
  service,
}: {
  editor: Editor | null
  canvasId: CanvasId
  service: CardService
}) {
  useEffect(() => {
    if (!editor) return
    const unsubWriteback = bindCardWriteback(editor, service, canvasId)
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    const unsubPersist = editor.store.listen(
      () => {
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(() => {
          canvasSnapshotStore.save(canvasId, getSnapshot(editor.store))
        }, VIEW_PERSIST_DEBOUNCE_MS)
      },
      { source: 'user', scope: 'document' },
    )
    return () => {
      if (persistTimer) clearTimeout(persistTimer)
      unsubWriteback()
      unsubPersist()
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __canvasEditor?: Editor }).__canvasEditor
        delete (window as unknown as { __cardService?: typeof service }).__cardService
      }
    }
  }, [editor, canvasId, service])
  return null
}

/**
 * DoubleClickBridge — closes review #4 for double-click handling.
 *
 * Previously `wireDoubleClick()` was called from inside `onMount` and
 * `addEventListener`'d on `editor.getContainer()` with no matching
 * `removeEventListener`. It worked in practice because tldraw tears down the
 * container with the editor, but it relied on that implicit lifetime — a
 * brittle assumption.
 *
 * Now `useEffect([editor, ...])` adds the listener and the cleanup function
 * removes it. When the page unmounts (or the editor handle changes) the
 * listener is gone before the editor is dropped, so no phantom dblclick on
 * a stale container.
 *
 * The callback is stored in a ref so the effect doesn't depend on a fresh
 * `onOpenCard` identity every render — page-side `onOpenCard={(card) =>
 * setDetail({card})}` would otherwise re-subscribe on every render.
 */
function DoubleClickBridge({
  editor,
  canvasId,
  service,
  onOpenCard,
}: {
  editor: Editor | null
  canvasId: CanvasId
  service: CardService
  onOpenCard: (card: Card) => void
}) {
  const cbRef = useRef(onOpenCard)
  cbRef.current = onOpenCard
  const serviceRef = useRef(service)
  serviceRef.current = service

  useEffect(() => {
    if (!editor) return
    const container = editor.getContainer()
    // C3 (v0.23.3): captureSinkRegistry.submit() resolves on a microtask,
    // so a rapid second dblclick on the same blank spot hits the handler
    // again before the first card's shape is added to the editor. Without
    // this guard the second dblclick sees no shape at the point and
    // creates a duplicate card. We hold the flag from the create call
    // until the shape lands (or the promise rejects).
    let creating = false
    const onDbl = (e: MouseEvent) => {
      const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY })
      const hit = editor.getShapeAtPoint(pagePoint)
      if (hit && hit.type === 'card') {
        const card = serviceRef.current.get(cardIdFromShapeId(String(hit.id)))
        if (card) cbRef.current(card)
        return
      }
      if (creating) return
      // Blank dblclick → create via captureSinkRegistry (Phase plan:
      // unify all entry-points through the registry — manual sink
      // registered on inbox mount, registry falls back to
      // fallbackService when the sink isn't ready yet, so card is
      // never lost). We reuse `manual` source kind (same path as
      // the inbox form); the canvasPosition disambiguates the
      // resulting card from inbox-only manual creates.
      creating = true
      void captureSinkRegistry
        .submit({
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
        .then(({ cardId }) => {
          const card = serviceRef.current.get(cardId)
          if (card) {
            addCardShape(editor, card)
            cbRef.current(card)
          }
        })
        .catch((err: unknown) => {
          // surface in dev console; the registry itself only rejects
          // when neither a matching sink nor a fallback service is set,
          // which would be a wiring bug (CaptureHost / inbox mount
          // both set fallback).
          console.error('[canvas-editor] dblclick create failed', err)
        })
        .finally(() => {
          creating = false
        })
    }
    container.addEventListener('dblclick', onDbl)
    return () => container.removeEventListener('dblclick', onDbl)
  }, [editor, canvasId])
  return null
}