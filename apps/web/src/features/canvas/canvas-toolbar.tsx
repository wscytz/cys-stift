'use client'

/**
 * CanvasToolbar — F2 (v0.26.1). The Bauhaus drawing toolbar that finally
 * unlocks the high-freedom canvas: alongside the existing dblclick-to-create
 * card, the user can now drop freeform notes / text / shapes / arrows /
 * hand-draw onto the canvas. All elements persist via the F1 snapshot layer.
 *
 * We keep `hideUi` on (tldraw's default chrome is colourful and off-brand)
 * and render our own minimal toolbar: mono glyphs, hairline frame, hard
 * shadow, active tool in red. Tool switching is `editor.setCurrentTool`;
 * the active readout is reactive via `useValue`.
 *
 * Keyboard shortcuts (v/d/r/o/a/n/t/e) mirror tldraw's defaults — both may
 * fire under hideUi, both set the same tool, so there's no conflict.
 *
 * Phase M3.5 (2026-06-21): adds a context-sensitive `✨ AI auto-relate`
 * button that surfaces only when (a) the user has enabled AI in /settings
 * AND (b) at least 2 cards are selected. Clicking infers a relation type
 * for every selected pair and creates an arrow (M2.1) with that type
 * applied (M2.3). A toast reports how many arrows were created.
 *
 * v0.31.0 (P1.2 debt cleanup): `service` is now passed as a prop rather
 * than read from the `window.__cardService` global. The toolbar is mounted
 * outside `<CardServiceContext.Provider>`, so the page wires the service
 * in directly — keeps the toolbar a pure (testable) component.
 */
import { useCallback, useEffect } from 'react'
import { useValue, GeoShapeGeoStyle, type Editor } from '@tldraw/tldraw'
import type { CardService } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'
import { CanvasIcon, type CanvasIconId } from './canvas-icon'
import { useAIEnabled } from '@/features/ai/ai-settings-provider'
import { autoRelate } from './auto-relate'
import { pushToast } from '@/lib/toast-store'

// v0.31.x review fix: tldraw 3.x collapsed the per-shape tools (rectangle /
// ellipse / triangle / …) into a single 'geo' tool whose concrete geometry
// is a *style* on the created shape. The toolbar's `rectangle` and `ellipse`
// buttons previously called `editor.setCurrentTool('rectangle')` and hit
// "no child state exists with the id rectangle" — silently dead. Now we set
// the next-shape style to the chosen geo kind, then switch into the geo tool.
type ToolId =
  | 'select'
  | 'draw'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'note'
  | 'text'
  | 'eraser'

const TOOLS: { id: ToolId; key: MessageKey; icon: CanvasIconId; shortcut: string }[] = [
  { id: 'select', key: 'canvas.tool.select', icon: 'select', shortcut: 'v' },
  { id: 'draw', key: 'canvas.tool.draw', icon: 'draw', shortcut: 'd' },
  { id: 'rectangle', key: 'canvas.tool.rectangle', icon: 'rectangle', shortcut: 'r' },
  { id: 'ellipse', key: 'canvas.tool.ellipse', icon: 'ellipse', shortcut: 'o' },
  { id: 'arrow', key: 'canvas.tool.arrow', icon: 'arrow', shortcut: 'a' },
  { id: 'note', key: 'canvas.tool.note', icon: 'note', shortcut: 'n' },
  { id: 'text', key: 'canvas.tool.text', icon: 'text', shortcut: 't' },
  { id: 'eraser', key: 'canvas.tool.eraser', icon: 'eraser', shortcut: 'e' },
]

export function CanvasToolbar({
  editor,
  service,
  onAILayout,
}: {
  editor: Editor | null
  service: CardService
  /** P7 — callback when user clicks "AI layout" button. Page wires the
   *  full AI pipeline (snapshot → streamText → parseDsl → applyLayout). */
  onAILayout?: () => void
}) {
  const { t } = useI18n()
  const current = useValue(
    'canvas tool',
    () => editor?.getCurrentToolId() ?? 'select',
    [editor],
  )
  // Review fix: rectangle/ellipse both compile to the single 'geo' tool
  // in tldraw 3.x, so the active highlight has to follow the next-shape
  // style (`getStyleForNextShape(GeoShapeGeoStyle)`), not the tool id.
  const nextGeoStyle = useValue(
    'canvas next geo style',
    () => (editor ? editor.getStyleForNextShape(GeoShapeGeoStyle) : null),
    [editor],
  )
  // M3.5 — selection-driven auto-relate button. Re-evaluates on every
  // tldraw store change so a click that selects a second card shows the
  // button immediately.
  const selectedCardsCount = useValue(
    'canvas selected cards',
    () => {
      if (!editor) return 0
      return editor.getSelectedShapes().filter((s) => s.type === 'card').length
    },
    [editor],
  )
  const aiEnabled = useAIEnabled()
  const showAutoRelate = aiEnabled && selectedCardsCount >= 2

  // v0.31.x review fix: tldraw 3.x collapsed rectangle/ellipse/triangle/…
  // into a single 'geo' tool whose geometry is a per-shape style. Both the
  // click handler and the keyboard shortcut route through this so they can
  // never disagree (the prior bug: click path was fixed, key path still
  // called setCurrentTool('rectangle') → silent "no child state" failure).
  const activate = useCallback(
    (id: ToolId) => {
      if (!editor) return
      if (id === 'rectangle') {
        editor.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle')
        editor.setCurrentTool('geo')
        return
      }
      if (id === 'ellipse') {
        editor.setStyleForNextShapes(GeoShapeGeoStyle, 'ellipse')
        editor.setCurrentTool('geo')
        return
      }
      editor.setCurrentTool(id)
    },
    [editor],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editor) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      const tool = TOOLS.find((x) => x.shortcut === e.key.toLowerCase())
      if (tool) {
        e.preventDefault()
        activate(tool.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, activate])

  return (
    <div className="cv-toolbar" role="toolbar" aria-label={t('canvas.tools')}>
      {TOOLS.map((tool) => {
        // Rectangle/ellipse share the 'geo' tool id — only one can be
        // "active" at a time, decided by the next-shape style.
        const isActive =
          tool.id === 'rectangle'
            ? current === 'geo' && nextGeoStyle === 'rectangle'
            : tool.id === 'ellipse'
              ? current === 'geo' && nextGeoStyle === 'ellipse'
              : current === tool.id
        return (
          <button
            key={tool.id}
            type="button"
            className={`cv-toolbar__btn ${
              isActive ? 'cv-toolbar__btn--active' : ''
            }`}
            onClick={() => activate(tool.id)}
            disabled={!editor}
            aria-label={t(tool.key)}
            aria-pressed={isActive}
            title={`${t(tool.key)} (${tool.shortcut})`}
          >
            <CanvasIcon id={tool.icon} />
          </button>
        )
      })}
      {showAutoRelate && (
        <button
          type="button"
          className="cv-toolbar__btn cv-toolbar__btn--ai"
          onClick={() => {
            if (!editor) return
            const ids = editor
              .getSelectedShapes()
              .filter((s) => s.type === 'card')
              .map((s) => String(s.id).replace(/^shape:/, ''))
            const { arrowsCreated } = autoRelate(editor, ids, service)
            pushToast({
              kind: arrowsCreated > 0 ? 'success' : 'info',
              message:
                arrowsCreated > 0
                  ? t('canvas.autoRelateDone', { n: String(arrowsCreated) })
                  : t('canvas.autoRelateNone'),
            })
          }}
          title={t('canvas.autoRelate')}
          aria-label={t('canvas.autoRelate')}
        >
          ✨
        </button>
      )}
      {aiEnabled && (
        <button
          type="button"
          className="cv-toolbar__btn cv-toolbar__btn--ai"
          onClick={() => { const fn = onAILayout; if (fn) fn() }}
          disabled={!editor || !onAILayout}
          title={t('canvas.aiLayout')}
          aria-label={t('canvas.aiLayout')}
        >
          📐
        </button>
      )}
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.cv-toolbar {
  position: fixed;
  bottom: var(--space-5);
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  gap: 4px;
  padding: 6px;
  background: var(--color-white);
  border: 2px solid var(--color-black);
  border-radius: 2px;
  box-shadow: 4px 4px 0 0 var(--color-black);
  font-family: var(--font-mono);
}
.cv-toolbar__btn {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--color-black);
  cursor: pointer;
  padding: 0;
  transition: background 80ms ease-out, border-color 80ms ease-out, transform 80ms ease-out;
}
.cv-toolbar__btn:hover:not(:disabled):not(.cv-toolbar__btn--active) {
  background: var(--color-gray-soft);
  border-color: var(--color-black);
}
.cv-toolbar__btn:active:not(:disabled) {
  transform: translate(1px, 1px);
}
.cv-toolbar__btn--active {
  background: var(--color-red);
  color: var(--color-white);
  border-color: var(--color-black);
  box-shadow: inset 0 0 0 1px var(--color-white);
}
.cv-toolbar__btn--ai {
  background: var(--color-yellow);
  color: var(--color-black);
  font-size: var(--font-size-base);
}
.cv-toolbar__btn--ai:hover:not(:disabled):not(.cv-toolbar__btn--active) {
  background: var(--color-black);
  color: var(--color-yellow);
  border-color: var(--color-black);
}
.cv-toolbar__btn:focus-visible {
  outline: 2px solid var(--color-red);
  outline-offset: 2px;
}
.cv-toolbar__btn:disabled {
  opacity: 0.3;
  cursor: default;
}
@media (max-width: 720px) {
  .cv-toolbar { bottom: var(--space-3); gap: 2px; padding: 4px; }
  .cv-toolbar__btn { width: 36px; height: 36px; }
}
`
