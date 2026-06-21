'use client'

/**
 * CanvasEditor — the real tldraw surface (slim shell).
 *
 * This module statically imports `@tldraw/tldraw`, which touches `window` at
 * module load. It is NEVER imported at the top level of a module that runs
 * during the static-export prerender — `tldraw-canvas.tsx` loads it via dynamic
 * import() inside useEffect, so this code only runs in the browser after mount.
 * (Phase 4 spike verified this pattern; spec §6.11 / §12.)
 *
 * ## v0.31.0 (P1.3) refactor — file split
 *
 * Pre-refactor this file was 347 lines and contained 4 components:
 *   - `CanvasEditor` (this shell)
 *   - `ViewPersistenceBridge` (now `canvas-view-persistence-bridge.tsx`)
 *   - `EditorBindingBridge`   (now `canvas-editor-binding-bridge.tsx`)
 *   - `DoubleClickBridge`     (now `canvas-double-click-bridge.tsx`)
 *
 * The bridges were extracted because:
 *   - canvas-editor.tsx was hard to scan at a glance (4 unrelated concerns)
 *   - the bridges have independent lifetimes and are unit-testable in
 *     isolation (none yet — see roadmap P2 for the test-coverage phase)
 *   - future bridge additions (e.g. an AI DSL preview overlay) belong in
 *     their own file
 *
 * Each bridge is now an independent `null`-returning component that
 * subscribes via its own `useEffect`; the JSX below just composes them.
 * Behaviour is identical to the pre-refactor monolith.
 *
 * ## Review #4 + #5 history (Phase canvas-refactor, 2026-06-20)
 *
 * The original pre-canvas-refactor implementation ran all side-effects
 * inside `Tldraw.onMount`:
 *   - view persistence with NO filter → every store change (incl. card
 *     moves) triggered a debounced camera read; wasteful
 *   - monkey-patched `editor.dispose = () => { ... }` to ensure cleanup
 *     ran → review #4: assumed tldraw calls `editor.dispose` on unmount;
 *     if that path changes, the listener + pending timer leak.
 *
 * Phase canvas-refactor split side-effects by lifetime:
 *   - `Tldraw.onMount` → one-shot setup (apply persisted view, load cards,
 *     bind card writeback, expose diagnostics, call onEditorReady)
 *   - The three bridges handle the lifetime-tricky work.
 */
import {
  Tldraw,
  loadSnapshot,
  type Editor,
  defaultShapeUtils,
} from '@tldraw/tldraw'
import type { CanvasId, Card, CardService } from '@cys-stift/domain'
import { CardShapeUtil } from './card-shape-util'
import { CardServiceContext } from './card-service-context'
import { loadCardsIntoEditor } from './canvas-binding'
import { canvasViewStore } from '@/lib/canvas-view-store'
import { canvasSnapshotStore } from '@/lib/canvas-snapshot-store'
import { ViewPersistenceBridge } from './canvas-view-persistence-bridge'
import { EditorBindingBridge } from './canvas-editor-binding-bridge'
import { DoubleClickBridge } from './canvas-double-click-bridge'

const shapeUtils = [CardShapeUtil, ...defaultShapeUtils]

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
            //    P3: load is async (OPFS). We fire-and-forget the non-critical
            //    bits (snapshot restore + card backfill) so onMount returns
            //    synchronously; tldraw TypeScript typing doesn't accept an
            //    async onMount handler.
            void canvasSnapshotStore.load(canvasId).then((restored) => {
            if (restored) {
              try {
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
            // (v0.31.0 P1.2 note: relation-panel now reads from
            // CardServiceContext directly; the global is kept only for e2e.)
            if (typeof window !== 'undefined') {
              ;(window as unknown as { __canvasEditor?: Editor }).__canvasEditor = ed
              ;(window as unknown as { __cardService?: CardService }).__cardService = service
            }

            // One-shot backfill: cards in CardService but not in the snapshot
            // (new card since last visit, or first visit with no snapshot).
            loadCardsIntoEditor(ed, service, canvasId)

            onEditorReady?.(ed)
            })
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