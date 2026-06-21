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

type ToolId =
  | 'select'
  | 'draw'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'note'
  | 'text'
  | 'eraser'

const TOOLS: { id: ToolId; key: MessageKey; glyph: string; shortcut: string }[] = [
  { id: 'select', key: 'canvas.tool.select', glyph: '↖', shortcut: 'v' },
  { id: 'draw', key: 'canvas.tool.draw', glyph: '✎', shortcut: 'd' },
  { id: 'rectangle', key: 'canvas.tool.rectangle', glyph: '▭', shortcut: 'r' },
  { id: 'ellipse', key: 'canvas.tool.ellipse', glyph: '◯', shortcut: 'o' },
  { id: 'arrow', key: 'canvas.tool.arrow', glyph: '→', shortcut: 'a' },
  { id: 'note', key: 'canvas.tool.note', glyph: '☰', shortcut: 'n' },
  { id: 'text', key: 'canvas.tool.text', glyph: 'T', shortcut: 't' },
  { id: 'eraser', key: 'canvas.tool.eraser', glyph: '⌫', shortcut: 'e' },
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
          {tool.glyph}
        </button>
      ))}
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.cv-toolbar {
  position: fixed;
  bottom: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  gap: 2px;
  padding: var(--space-1);
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  font-family: var(--font-mono);
}
.cv-toolbar__btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  line-height: 1;
  color: var(--color-black);
  cursor: pointer;
  padding: 0;
}
.cv-toolbar__btn:hover:not(:disabled) {
  background: var(--color-gray-soft);
}
.cv-toolbar__btn--active {
  background: var(--color-red);
  color: var(--color-white);
}
.cv-toolbar__btn:disabled {
  opacity: 0.4;
  cursor: default;
}
@media (max-width: 720px) {
  .cv-toolbar { bottom: var(--space-2); }
  .cv-toolbar__btn { width: 32px; height: 32px; font-size: var(--font-size-sm); }
}
`
