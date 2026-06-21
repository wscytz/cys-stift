'use client'

/**
 * M1 + v0.31.0 (P1.3): ViewPersistenceBridge — closes review #5 + #4 for
 * view persistence. Extracted from canvas-editor.tsx in v0.31.0 as part
 * of the file-split refactor; same behaviour, separate file.
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
import { useEffect } from 'react'
import { useValue, type Editor } from '@tldraw/tldraw'
import type { CanvasId } from '@cys-stift/domain'
import { canvasViewStore } from '@/lib/canvas-view-store'

const VIEW_PERSIST_DEBOUNCE_MS = 500

export function ViewPersistenceBridge({
  editor,
  canvasId,
}: {
  editor: Editor | null
  canvasId: CanvasId
}) {
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