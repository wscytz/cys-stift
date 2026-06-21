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
 */
import { useEffect } from 'react'
import { useValue, type Editor } from '@tldraw/tldraw'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'
import { CanvasIcon, type CanvasIconId } from './canvas-icon'

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

export function CanvasToolbar({ editor }: { editor: Editor | null }) {
  const { t } = useI18n()
  const current = useValue(
    'canvas tool',
    () => editor?.getCurrentToolId() ?? 'select',
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
        editor.setCurrentTool(tool.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])

  return (
    <div className="cv-toolbar" role="toolbar" aria-label={t('canvas.tools')}>
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={`cv-toolbar__btn ${
            current === tool.id ? 'cv-toolbar__btn--active' : ''
          }`}
          onClick={() => editor?.setCurrentTool(tool.id)}
          disabled={!editor}
          aria-label={t(tool.key)}
          aria-pressed={current === tool.id}
          title={`${t(tool.key)} (${tool.shortcut})`}
        >
          <CanvasIcon id={tool.icon} />
        </button>
      ))}
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
