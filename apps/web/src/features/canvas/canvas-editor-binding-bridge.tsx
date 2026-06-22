'use client'

/**
 * M1 + v0.31.0 (P1.3): EditorBindingBridge — owns the two editor subscriptions
 * that previously lived in onMount with no cleanup (writeback + snapshot
 * persist). Extracted from canvas-editor.tsx as part of the file-split
 * refactor.
 *
 * onMount can't return a cleanup (tldraw owns that callback), so these were
 * betting entirely on tldraw tearing the listeners down with the editor. This
 * bridge makes cleanup explicit: on unmount (or editor/canvas change) we
 * unsubscribe both listeners, clear the pending snapshot timer, and clear
 * the `__canvasEditor` / `__cardService` diagnostics (B8 — a stale editor
 * reference otherwise lingers on window after a canvas switch). Same pattern
 * as the other two bridges; the onMount now only does one-shot setup.
 *
 * `service` is stable (memoised in useDb), so it's safe in the dep array.
 */
import { useEffect } from 'react'
import { getSnapshot, type Editor } from '@tldraw/tldraw'
import type { CanvasId, CardService } from '@cys-stift/domain'
import { bindCardWriteback } from './canvas-binding'
import { TldrawAdapter } from './host/tldraw-adapter'
import { canvasSnapshotStore } from '@/lib/canvas-snapshot-store'

const VIEW_PERSIST_DEBOUNCE_MS = 500

export function EditorBindingBridge({
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
    // Phase 0 / T2: card writeback goes through the host; snapshot persist
    // stays on editor.store for now (no host snapshot API yet — Phase 1/2).
    const unsubWriteback = bindCardWriteback(new TldrawAdapter(editor), service, canvasId)
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    const unsubPersist = editor.store.listen(
      () => {
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(() => {
          void canvasSnapshotStore.save(canvasId, getSnapshot(editor.store))
        }, VIEW_PERSIST_DEBOUNCE_MS)
      },
      { source: 'user', scope: 'document' },
    )
    return () => {
      // Review fix (v0.37.0): the 500ms snapshot debounce meant freeform
      // strokes drawn then immediately followed by a canvas switch / route
      // change / tab close were lost — the teardown only cleared the timer.
      // If a save was pending, flush it once before tearing down listeners.
      if (persistTimer) {
        clearTimeout(persistTimer)
        void canvasSnapshotStore.save(canvasId, getSnapshot(editor.store))
      }
      unsubWriteback()
      unsubPersist()
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __canvasEditor?: Editor }).__canvasEditor
        delete (window as unknown as { __cardService?: CardService }).__cardService
      }
    }
  }, [editor, canvasId, service])
  return null
}