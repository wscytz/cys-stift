'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useValue } from '@tldraw/tldraw'
import type { Editor } from '@tldraw/tldraw'
import type { CanvasId, Card } from '@cys-stift/domain'
import { Button, Modal, Toolbar, Tag } from '@cys-stift/ui'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { TldrawCanvas } from '@/features/canvas/tldraw-canvas'
import { CanvasToolbar } from '@/features/canvas/canvas-toolbar'
import { RelationPanel } from '@/features/canvas/relation-panel'
import { CardDetailModal } from '@/features/canvas/card-detail-modal'
import { ExportDialog } from '@/features/canvas/export-dialog'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import {
  addCardShape,
  removeCardShape,
  syncCardsToEditor,
  updateCardShape,
} from '@/features/canvas/canvas-binding'
import { canvasStore, useCanvases } from '@/lib/canvas-store'

/**
 * /canvas — Phase 4 + Phase 5 + Phase multi-canvas (2026-06-20).
 * A statically-exported route (no [id] segment, spec §6.12) hosting the
 * tldraw surface. Cards on the selected canvas render as custom tldraw
 * shapes; the DB is the source of truth for positions (spec §6.11).
 *
 * The editor handle is lifted here (via onEditorReady) so the detail modal
 * can sync shapes back into tldraw after a save / archive / delete.
 *
 * Phase multi-canvas adds a Canvas switcher + create/rename/delete in the
 * toolbar. Active canvasId lives in `canvas-store` (web-local
 * localStorage). Inbox "Send to canvas" still targets DEFAULT_CANVAS_ID —
 * MVP scope keeps that path stable; cross-canvas routing of new cards
 * (send-to-active-canvas) is a follow-up.
 */
export default function CanvasPage() {
  const { t } = useI18n()
  const { snap, service } = useDb()
  void snap // subscribe so the toolbar count re-renders on card changes
  // Phase 5: editor is now held in state (not a ref) so consumers re-render
  // when the Tldraw onMount fires. useRef would not trigger a re-render and
  // would leave toolbar buttons disabled forever.
  const [editor, setEditor] = useState<Editor | null>(null)
  const [detail, setDetail] = useState<{ card: Card } | null>(null)
  const [snapMode, setSnapMode] = useState<'snap' | 'free'>('snap')

  const { snapshot: canvasesSnap } = useCanvases()
  const activeCanvasId = canvasesSnap.activeCanvasId
  const canvases = canvasesSnap.canvases

  // Sync CardService → editor on every DB change (e.g. user sends a card
  // from /inbox via service.moveToCanvas, or unarchives from trash). Without
  // this, inbox→canvas card creates shapes only via onMount's loadCardsIntoEditor
  // backfill, so a send *after* mount silently fails to render. F1 promised
  // "card is single source of truth"; this effect delivers it.
  useEffect(() => {
    if (!editor) return
    syncCardsToEditor(editor, service, activeCanvasId)
  }, [snap, editor, activeCanvasId, service])

  const [creatingName, setCreatingName] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<CanvasId | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<CanvasId | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const onCanvas = service
    .listOnCanvas(activeCanvasId)
    .filter((c) => !c.archived && !c.deletedAt).length

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

  const switchCanvas = (id: CanvasId) => {
    if (id === activeCanvasId) return
    // Close any open card detail (it belongs to the previous canvas).
    setDetail(null)
    canvasStore.setActive(id)
  }

  const handleCreateCanvas = (raw: string) => {
    const name = raw.trim()
    setCreatingName(null)
    if (!name) return
    canvasStore.create(name)
  }

  const startRename = () => {
    setRenamingId(activeCanvasId)
  }

  const handleRename = (raw: string) => {
    const name = raw.trim()
    setRenamingId(null)
    if (!name) return
    canvasStore.rename(activeCanvasId, name)
  }

  const requestDelete = () => {
    // Already gated by the disabled state on the button (active
    // canvas + default canvas are not deletable).
    if (activeCanvasId === DEFAULT_CANVAS_ID) return
    setConfirmDeleteId(activeCanvasId)
  }

  const confirmDelete = () => {
    if (!confirmDeleteId) return
    // Move any cards on this canvas back to the inbox before deleting
    // so the user never silently loses their cards.
    for (const c of service.listOnCanvas(confirmDeleteId)) {
      service.removeFromCanvas(c.id)
    }
    canvasStore.delete(confirmDeleteId)
    setConfirmDeleteId(null)
  }

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId)
  const cardCountOnTarget = confirmDeleteId
    ? service.listOnCanvas(confirmDeleteId).filter((c) => !c.deletedAt).length
    : 0

  return (
    <main className="page">
      <Toolbar region="canvas">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('canvas.crumb')}</span>
        <span className="crumb-sep">/</span>
        <CanvasSwitcher
          canvases={canvases}
          activeId={activeCanvasId}
          renamingId={renamingId}
          onStartRename={startRename}
          onCommitRename={handleRename}
          onCancelRename={() => setRenamingId(null)}
          onSwitch={switchCanvas}
        />
        <Button
          variant="ghost"
          onClick={() => setCreatingName('')}
          title={t('canvas.newTitle')}
        >
          {t('canvas.new')}
        </Button>
        <Button
          variant="ghost"
          onClick={startRename}
          title={t('canvas.renameTitle')}
          disabled={!activeCanvas}
        >
          {t('canvas.rename')}
        </Button>
        <Button
          variant="ghost"
          onClick={requestDelete}
          title={t('canvas.deleteTitle')}
          disabled={activeCanvasId === DEFAULT_CANVAS_ID}
        >
          {t('canvas.delete')}
        </Button>
        <span className="crumb-spacer" />
        <span className="tb-divider" aria-hidden="true" />
        <Button
          variant="ghost"
          onClick={() => setExportOpen(true)}
          disabled={!editor}
          title={t('canvas.export')}
        >
          {t('canvas.export')}
        </Button>
        <span className="tb-divider" aria-hidden="true" />
        <SnapToggle mode={snapMode} onToggle={toggleSnap} disabled={!editor} />
        <span className="tb-divider" aria-hidden="true" />
        <ZoomGroup editor={editor} onZoom={zoomBy} />
      </Toolbar>

      <div className="cv-host">
        <TldrawCanvas
          key={activeCanvasId}
          service={service}
          canvasId={activeCanvasId}
          editor={editor}
          onOpenCard={(card) => setDetail({ card })}
          onEditorReady={(ed) => setEditor(ed)}
        />
        <CanvasToolbar editor={editor} service={service} />
        <RelationPanel editor={editor} />
        {onCanvas === 0 && (
          <div className="cv-empty" aria-hidden="true">
            <span className="cv-empty__eyebrow">{t('canvas.emptyTitle')}</span>
            <span className="cv-empty__hint">{t('canvas.emptyHint')}</span>
          </div>
        )}
      </div>

      <Modal
        open={creatingName !== null}
        onClose={() => setCreatingName(null)}
        title={t('canvas.newModalTitle')}
      >
        <p className="confirm__body">{t('canvas.newModalBody')}</p>
        <input
          autoFocus
          className="cinput"
          value={creatingName ?? ''}
          onChange={(e) => setCreatingName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreateCanvas((e.target as HTMLInputElement).value)
            else if (e.key === 'Escape') setCreatingName(null)
          }}
          placeholder={t('canvas.namePlaceholder')}
          maxLength={60}
        />
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setCreatingName(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleCreateCanvas(creatingName ?? '')}
            disabled={!creatingName?.trim()}
          >
            {t('canvas.new')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title={t('canvas.deleteModalTitle')}
      >
        <p className="confirm__body">
          {cardCountOnTarget > 0
            ? t('canvas.deleteModalBodyCards', { name: canvases.find((c) => c.id === confirmDeleteId)?.name ?? '', n: cardCountOnTarget })
            : t('canvas.deleteModalBodyNoCards', { name: canvases.find((c) => c.id === confirmDeleteId)?.name ?? '' })}
        </p>
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            {t('canvas.deleteCanvas')}
          </Button>
        </div>
      </Modal>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        editor={editor}
        service={service}
        canvasId={activeCanvasId}
        canvasName={activeCanvas?.name ?? ''}
      />

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
 * CanvasSwitcher — native select-style dropdown. Native <select> is the
 * cheapest accessible pattern (keyboard / mobile / screen reader all work
 * out of the box); the editor's tldraw surface is already JS-heavy and
 * adding a custom popover would be more code than it's worth.
 *
 * When `renamingId === activeId` we render an inline <input> in place of
 * the active option so rename is a single keystroke away.
 */
function CanvasSwitcher({
  canvases,
  activeId,
  renamingId,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onSwitch,
}: {
  canvases: { id: CanvasId; name: string }[]
  activeId: CanvasId
  renamingId: CanvasId | null
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onSwitch: (id: CanvasId) => void
}) {
  const { t } = useI18n()
  if (renamingId !== null) {
    return (
      <input
        autoFocus
        className="crename"
        defaultValue={canvases.find((c) => c.id === renamingId)?.name ?? ''}
        onBlur={(e) => onCommitRename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter')
            onCommitRename((e.target as HTMLInputElement).value)
          else if (e.key === 'Escape') onCancelRename()
        }}
        maxLength={60}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }
  return (
    <>
      <select
        className="cselect"
        value={activeId}
        onChange={(e) => onSwitch(e.target.value as CanvasId)}
        title={t('canvas.switchTitle')}
      >
        {canvases.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="cselect-edit"
        onClick={onStartRename}
        title={t('canvas.renameTitle')}
        aria-label={t('canvas.renameTitle')}
      >
        ✎
      </button>
    </>
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
  const { t } = useI18n()
  return (
    <button
      type="button"
      className={`tb-snap tb-snap--${mode}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={mode === 'snap'}
      title={t('canvas.toggleSnap')}
    >
      {mode === 'snap' ? t('canvas.snap') : t('canvas.free')}
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
  const { t } = useI18n()
  const z = useValue('canvas zoom', () => editor?.getCamera().z ?? 1, [editor])
  const pct = Math.round((z ?? 1) * 100)
  return (
    <span className="tb-zoom">
      <button
        type="button"
        className="tb-icon-btn"
        onClick={() => onZoom('out')}
        disabled={!editor}
        aria-label={t('canvas.zoomOut')}
        title={`${t('canvas.zoomOut')} (-)`}
      >
        −
      </button>
      <span className="tb-zoom-pct" aria-live="polite">{pct}%</span>
      <button
        type="button"
        className="tb-icon-btn"
        onClick={() => onZoom('in')}
        disabled={!editor}
        aria-label={t('canvas.zoomIn')}
        title={`${t('canvas.zoomIn')} (+)`}
      >
        +
      </button>
      <button
        type="button"
        className="tb-icon-btn tb-icon-btn--fit"
        onClick={() => onZoom('fit')}
        disabled={!editor}
        aria-label={t('canvas.zoomFit')}
        title={`${t('canvas.zoomFit')} (0)`}
      >
        {t('canvas.zoomFit')}
      </button>
    </span>
  )
}

const styles = `
.page { height: calc(100vh - var(--app-menu-height)); display: flex; flex-direction: column; background: var(--color-white); color: var(--color-black); }
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
  /* Tighten the toolbar: drop dividers and the percentage readout so the
     snap tag + − % + FIT fit in 390px without wrapping. */
  .tb-divider { display: none; }
  .tb-zoom-pct { display: none; }
  .crumb { white-space: nowrap; }
}
.cv-host { position: relative; flex: 1; min-height: 0; }
.cv-editor { position: absolute; inset: 0; }
.cv-state { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
.cv-state--err { color: var(--color-red); }
/* v0.22.0-ux-bugfix: empty-state hint overlay. Shown only when the
 * active canvas has zero cards. Hidden once the first card is created
 * or restored (when onCanvas > 0). Pointer-events: none so dblclick
 * passes through to the tldraw surface (which creates a card). */
.cv-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-2);
  pointer-events: none;
  user-select: none;
  padding-bottom: 80px; /* lift above tldraw bottom watermark */
}
.cv-empty__eyebrow {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--color-gray);
}
.cv-empty__hint {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-black-soft);
}
/* Bauhaus 8px dot grid on tldraw's background layer (spec §5.4). Page-space
   grid lines arrive with tldraw's snap mode (SnapManager). */
.tl-background {
  background-color: var(--color-white) !important;
  background-image: radial-gradient(var(--color-gray-soft) 0.8px, transparent 0.8px) !important;
  background-size: 32px 32px !important;
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

/* Phase multi-canvas — canvas switcher dropdown + inline rename input. */
.cselect {
  height: 32px;
  padding: 0 var(--space-2);
  background: var(--color-white);
  color: var(--color-black);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.cselect:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.cselect-edit {
  height: 32px; width: 32px;
  background: transparent; color: var(--color-gray);
  border: 0; cursor: pointer; font-size: var(--font-size-base);
}
.cselect-edit:hover { color: var(--color-black); }
.crename {
  height: 32px; padding: 0 var(--space-2);
  background: var(--color-white); color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  outline: none;
  min-width: 200px;
}
.crename:focus { border-color: var(--color-red); }
.cinput {
  display: block;
  width: 100%;
  height: 32px;
  margin-top: var(--space-2);
  padding: 0 var(--space-2);
  background: var(--color-white); color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-base);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  outline: none;
}
.cinput:focus { border-color: var(--color-red); }
.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
`