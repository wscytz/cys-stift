'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useValue } from '@tldraw/tldraw'
import type { Editor } from '@tldraw/tldraw'
import type { Card } from '@cys-stift/domain'
import { Button, Toolbar, Tag } from '@cys-stift/ui'
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
 * /canvas — Phase 4 + Phase 5. A statically-exported route (no [id] segment,
 * spec §6.12) hosting the tldraw surface. Cards on the default canvas render
 * as custom tldraw shapes; the DB is the source of truth for positions
 * (spec §6.11).
 *
 * The editor handle is lifted here (via onEditorReady) so the detail modal can
 * sync shapes back into tldraw after a save / archive / delete.
 *
 * Phase 5 adds the snap/free toggle + zoom controls to the right side of the
 * toolbar (spec §8 line "网格 / 自由模式、缩放、对齐"). All UI is local state
 * (no DB persistence — view persistence is Phase 5+).
 */
export default function CanvasPage() {
  const { snap, service } = useDb()
  void snap // subscribe so the toolbar count re-renders on card changes
  // Phase 5: editor is now held in state (not a ref) so consumers re-render
  // when the Tldraw onMount fires. useRef would not trigger a re-render and
  // would leave toolbar buttons disabled forever.
  const [editor, setEditor] = useState<Editor | null>(null)
  const [detail, setDetail] = useState<{ card: Card } | null>(null)
  const [snapMode, setSnapMode] = useState<'snap' | 'free'>('snap')

  const onCanvas = service.listOnCanvas(DEFAULT_CANVAS_ID).filter((c) => !c.archived && !c.deletedAt)
    .length

  const toggleSnap = useCallback(() => {
    if (!editor) return
    const next = snapMode === 'snap' ? 'free' : 'snap'
    // tldraw v3's `editor.user.isSnapMode` only flips the ctrl-key inversion
    // (true = default-on, ctrl toggles off). The actual snap-to-grid total
    // switch is `editor.getInstanceState().isGridMode` (DefaultCanvas /
    // Pointing / Translating all read it). Toggle both so the visible state
    // and the snap behaviour stay in lockstep.
    editor.updateInstanceState({ isGridMode: next === 'snap' })
    editor.user.updateUserPreferences({ isSnapMode: next === 'snap' })
    setSnapMode(next)
  }, [editor, snapMode])

  const zoomBy = useCallback(
    (op: 'in' | 'out' | 'fit') => {
      if (!editor) return
      if (op === 'in') editor.zoomIn()
      else if (op === 'out') editor.zoomOut()
      else editor.zoomToFit()
    },
    [editor],
  )

  // Keyboard shortcuts: + - 0 1 g. Phase 5: 4 zoom keys + snap toggle. Skip when
  // typing into an input / textarea / contenteditable so we don't break the
  // detail modal's title and body fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
      }
      // Ignore if a modifier is held — leave browser / tldraw shortcuts alone.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key
      if (key === '+' || key === '=') {
        e.preventDefault()
        zoomBy('in')
      } else if (key === '-' || key === '_') {
        e.preventDefault()
        zoomBy('out')
      } else if (key === '0' || key === '1') {
        e.preventDefault()
        zoomBy('fit')
      } else if (key === 'g' || key === 'G') {
        e.preventDefault()
        toggleSnap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomBy, toggleSnap])

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
        <span className="tb-divider" aria-hidden="true" />
        <SnapToggle mode={snapMode} onToggle={toggleSnap} disabled={!editor} />
        <span className="tb-divider" aria-hidden="true" />
        <ZoomGroup editor={editor} onZoom={zoomBy} />
      </Toolbar>

      <div className="cv-host">
        <TldrawCanvas
          service={service}
          canvasId={DEFAULT_CANVAS_ID}
          editor={editor}
          onOpenCard={(card) => setDetail({ card })}
          onEditorReady={(ed) => setEditor(ed)}
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
            if (updated && editor) updateCardShape(editor, updated)
            if (updated) setDetail({ card: updated })
          }}
          onArchive={() => {
            service.archive(detail.card.id)
            if (editor) removeCardShape(editor, detail.card.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(detail.card.id)
            const c = service.get(detail.card.id)
            if (c && editor) addCardShape(editor, c)
            setDetail(c ? { card: c } : null)
          }}
          onDelete={() => {
            service.softDelete(detail.card.id)
            if (editor) removeCardShape(editor, detail.card.id)
            setDetail(null)
          }}
          onSendToInbox={() => {
            // Phase UX #2: clear canvasPosition, shape disappears, card
            // reappears in /inbox via listInbox (which excludes cards
            // with canvasPosition per spec §6.11).
            service.removeFromCanvas(detail.card.id)
            if (editor) removeCardShape(editor, detail.card.id)
            setDetail(null)
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

/**
 * Snap / free toggle. Lives outside the main render so it can subscribe to
 * `editor.user.isSnapMode` reactively once the editor mounts (via useValue).
 * Before the editor is ready the toggle is disabled but renders the default.
 */
function SnapToggle({
  mode,
  onToggle,
  disabled,
}: {
  mode: 'snap' | 'free'
  onToggle: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      className={`tb-snap tb-snap--${mode}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={mode === 'snap'}
      title="Toggle snap / free (G)"
    >
      {mode === 'snap' ? 'SNAP 8' : 'FREE'}
    </button>
  )
}

/**
 * Zoom controls — three ghost buttons (out, in, fit) + a live percentage that
 * subscribes to the camera via tldraw's useValue. The percentage is intentionally
 * a tspan element with var(--font-mono) so it matches the existing mono caps
 * typography on the toolbar.
 */
function ZoomGroup({
  editor,
  onZoom,
}: {
  editor: Editor | null
  onZoom: (op: 'in' | 'out' | 'fit') => void
}) {
  const z = useValue('canvas zoom', () => editor?.getCamera().z ?? 1, [editor])
  const pct = Math.round((z ?? 1) * 100)
  return (
    <span className="tb-zoom">
      <button
        type="button"
        className="tb-icon-btn"
        onClick={() => onZoom('out')}
        disabled={!editor}
        aria-label="Zoom out"
        title="Zoom out (−)"
      >
        −
      </button>
      <span className="tb-zoom-pct" aria-live="polite">{pct}%</span>
      <button
        type="button"
        className="tb-icon-btn"
        onClick={() => onZoom('in')}
        disabled={!editor}
        aria-label="Zoom in"
        title="Zoom in (+)"
      >
        +
      </button>
      <button
        type="button"
        className="tb-icon-btn tb-icon-btn--fit"
        onClick={() => onZoom('fit')}
        disabled={!editor}
        aria-label="Zoom to fit"
        title="Fit content (0)"
      >
        FIT
      </button>
    </span>
  )
}

const styles = `
.page { height: 100vh; display: flex; flex-direction: column; background: var(--color-white); color: var(--color-black); }
.crumb { font-family: var(--font-mono); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.crumb--here { color: var(--color-black); }
.crumb-sep { color: var(--color-gray); }
.crumb-spacer { flex: 1; }
.hint { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); text-transform: lowercase; }
/* Hide the inline hint on narrow viewports — the toolbar is tight on mobile
   and the hint crowds out the snap/zoom controls. Users on touch devices
   discover "double-click" via the empty-canvas prompt (rendered by the
   editor itself on wide screens anyway) and via the dblclick affordance
   on long-press. */
@media (max-width: 720px) {
  .hint { display: none; }
  /* Tighten the toolbar: drop dividers and the percentage readout so the
     snap tag + − % + FIT fit in 390px without wrapping. */
  .tb-divider { display: none; }
  .tb-zoom-pct { display: none; }
  .crumb { white-space: nowrap; }
}
.crumb-link { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
.cv-host { position: relative; flex: 1; min-height: 0; }
.cv-editor { position: absolute; inset: 0; }
.cv-state { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
.cv-state--err { color: var(--color-red); }
/* Bauhaus 8px dot grid on tldraw's background layer (spec §5.4). Page-space
   grid lines arrive with tldraw's snap mode (SnapManager). */
.tl-background {
  background-color: var(--color-white) !important;
  background-image: radial-gradient(var(--color-gray) 0.8px, transparent 0.8px) !important;
  background-size: 8px 8px !important;
  background-position: 0 0 !important;
}

/* Phase 5 — snap toggle + zoom controls, right side of the canvas toolbar. */
.tb-divider { width: 1px; height: 24px; background: var(--color-gray); margin: 0 var(--space-2); flex: 0 0 auto; }
.tb-snap {
  display: inline-flex; align-items: center; justify-content: center;
  height: 32px; padding: 0 var(--space-3);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  letter-spacing: 0.16em; text-transform: uppercase;
  background: var(--color-white); color: var(--color-black);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  cursor: pointer; transition: background 80ms ease-out, color 80ms ease-out;
}
.tb-snap--snap { background: var(--color-black); color: var(--color-white); }
.tb-snap--free { background: var(--color-white); color: var(--color-black); }
.tb-snap:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tb-snap:disabled { opacity: 0.4; cursor: not-allowed; }

.tb-zoom { display: inline-flex; align-items: center; gap: 0; }
.tb-zoom-pct {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 48px; height: 32px; padding: 0 var(--space-2);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-black);
}
.tb-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 32px; min-width: 32px; padding: 0 var(--space-2);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  letter-spacing: 0.12em; text-transform: uppercase;
  background: transparent; color: var(--color-black);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  cursor: pointer;
}
.tb-icon-btn--fit { padding: 0 var(--space-3); }
.tb-icon-btn:hover { background: var(--color-black); color: var(--color-white); }
.tb-icon-btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tb-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
`