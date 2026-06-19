'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import type { Editor } from '@tldraw/tldraw'
import type { Card } from '@cys-stift/domain'
import { Toolbar, Tag } from '@cys-stift/ui'
import { useDb } from '@/lib/db-client'
import { TldrawCanvas } from '@/features/canvas/tldraw-canvas'
import { CardDetailModal } from '@/features/canvas/card-detail-modal'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import {
  addCardShape,
  removeCardShape,
  updateCardShape,
} from '@/features/canvas/canvas-binding'

/**
 * /canvas — Phase 4. A statically-exported route (no [id] segment, spec §6.12)
 * hosting the tldraw surface. Cards on the default canvas render as custom
 * tldraw shapes; the DB is the source of truth for positions (spec §6.11).
 *
 * The editor handle is lifted here (via onEditorReady) so the detail modal can
 * sync shapes back into tldraw after a save / archive / delete.
 */
export default function CanvasPage() {
  const { snap, service } = useDb()
  void snap // subscribe so the toolbar count re-renders on card changes
  const editorRef = useRef<Editor | null>(null)
  const [detail, setDetail] = useState<{ card: Card } | null>(null)

  const onCanvas = service.listOnCanvas(DEFAULT_CANVAS_ID).filter((c) => !c.archived && !c.deletedAt)
    .length

  return (
    <main className="page">
      <Toolbar region="canvas">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">canvas</span>
        <span className="crumb-spacer" />
        <span className="hint">double-click to create · drag to place</span>
        <Tag color="black">{onCanvas}</Tag>
        <Link href="/" className="crumb-link">← home</Link>
      </Toolbar>

      <div className="cv-host">
        <TldrawCanvas
          service={service}
          canvasId={DEFAULT_CANVAS_ID}
          onOpenCard={(card) => setDetail({ card })}
          onEditorReady={(editor) => {
            editorRef.current = editor
          }}
        />
      </div>

      {detail && (
        <CardDetailModal
          card={detail.card}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.card.id, {
              title: patch.title,
              body: patch.body,
            })
            if (updated && editorRef.current) updateCardShape(editorRef.current, updated)
            if (updated) setDetail({ card: updated })
          }}
          onArchive={() => {
            service.archive(detail.card.id)
            if (editorRef.current) removeCardShape(editorRef.current, detail.card.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(detail.card.id)
            const c = service.get(detail.card.id)
            if (c && editorRef.current) addCardShape(editorRef.current, c)
            setDetail(c ? { card: c } : null)
          }}
          onDelete={() => {
            service.softDelete(detail.card.id)
            if (editorRef.current) removeCardShape(editorRef.current, detail.card.id)
            setDetail(null)
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

const styles = `
.page { height: 100vh; display: flex; flex-direction: column; background: var(--color-white); color: var(--color-black); }
.crumb { font-family: var(--font-mono); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.crumb--here { color: var(--color-black); }
.crumb-sep { color: var(--color-gray); }
.crumb-spacer { flex: 1; }
.hint { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); text-transform: lowercase; }
.crumb-link { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
.cv-host { position: relative; flex: 1; min-height: 0; }
.cv-editor { position: absolute; inset: 0; }
.cv-state { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
.cv-state--err { color: var(--color-red); }
/* Bauhaus 8px dot grid on tldraw's background layer (spec §5.4). Screen-space
   for Phase 4; page-space grid lands with snapping in Phase 5. */
.tl-background {
  background-color: var(--color-white) !important;
  background-image: radial-gradient(var(--color-gray) 0.8px, transparent 0.8px) !important;
  background-size: 8px 8px !important;
  background-position: 0 0 !important;
}
`
