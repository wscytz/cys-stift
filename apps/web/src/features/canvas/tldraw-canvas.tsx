'use client'

import { useEffect, useState } from 'react'
import '@tldraw/tldraw/tldraw.css'
import type { CanvasEditorProps } from './canvas-editor'

type EditorComponent = React.ComponentType<CanvasEditorProps>

/**
 * TldrawCanvas — client-only mount guard + dynamic loader for the tldraw
 * surface. tldraw's module touches `window`, so we defer loading it until
 * after mount (browser only). This keeps the static-export prerender safe and
 * code-splits tldraw into its own lazy chunk (~2 MB, spec §12 / ADR-0005).
 */
export function TldrawCanvas(props: CanvasEditorProps) {
  const [Editor, setEditor] = useState<EditorComponent | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    import('./canvas-editor')
      .then((m) => {
        if (alive) setEditor(() => m.CanvasEditor)
      })
      .catch((e: unknown) => {
        if (alive) setErr(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [])

  if (err) return <div className="cv-state cv-state--err">canvas load error: {err}</div>
  if (!Editor) return <div className="cv-state">loading canvas…</div>
  return <Editor {...props} />
}
