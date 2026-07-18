'use client'

/**
 * MarkdownEditor — 工作台 markdown 编辑器（D3）。
 *
 * 路线 A：markdown 源（textarea）+ Word 风工具栏（lucide）+ 实时预览（MarkdownBody）。
 * 不做 WYSIWYG：卡仍是 markdown 字符串，可移植。
 *
 * 工具栏点击 → 读 textarea selectionStart/End → insertMarkdown 纯函数 → onChange(next)
 * + 经 useEffect 把新选区（光标）写回 textarea。
 *
 * 视图：split（默认）/ source / preview，会话态（不持久）。
 */
import React, { useRef, useState, useEffect } from 'react'
import { WorkbenchIcon, type WorkbenchIconName } from '@/features/canvas/workbench-icons'
import { insertMarkdown, type MdAction } from './markdown-editor-helpers'
import { MarkdownBody } from '@/app/inbox/markdown'
import { useI18n } from '@/lib/i18n'
import { useMatchMedia } from '@/lib/use-match-media'

type View = 'split' | 'source' | 'preview'

const TOOLBAR: { name: WorkbenchIconName; action: MdAction }[] = [
  { name: 'h2', action: 'h2' },
  { name: 'bold', action: 'bold' },
  { name: 'italic', action: 'italic' },
  { name: 'strike', action: 'strike' },
  { name: 'code', action: 'code' },
  { name: 'codeblock', action: 'codeblock' },
  { name: 'quote', action: 'quote' },
  { name: 'ul', action: 'ul' },
  { name: 'task', action: 'task' },
  { name: 'table', action: 'table' },
  { name: 'link', action: 'link' },
]

const VIEWS: { v: View; key: 'editor.view.split' | 'editor.view.source' | 'editor.view.preview' }[] = [
  { v: 'split', key: 'editor.view.split' },
  { v: 'source', key: 'editor.view.source' },
  { v: 'preview', key: 'editor.view.preview' },
]

/** 工具栏 action → i18n key(标题/粗体/…)。顺序与 TOOLBAR 一致。 */
const TOOLBAR_KEYS = {
  h2: 'editor.h2',
  bold: 'editor.bold',
  italic: 'editor.italic',
  strike: 'editor.strike',
  code: 'editor.code',
  codeblock: 'editor.codeblock',
  quote: 'editor.quote',
  ul: 'editor.ul',
  task: 'editor.task',
  table: 'editor.table',
  link: 'editor.link',
} as const

export interface MarkdownEditorProps {
  value: string
  onChange: (next: string) => void
  className?: string
}

export function MarkdownEditor({ value, onChange, className }: MarkdownEditorProps) {
  const { t } = useI18n()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const pendingSel = useRef<{ s: number; e: number } | null>(null)
  const [view, setView] = useState<View>('split')
  const isNarrow = useMatchMedia('(max-width: 640px)')

  // A two-column editor is not usable on phone widths. Start narrow screens
  // in source mode; Preview remains one tap away in the same toolbar.
  useEffect(() => {
    if (isNarrow) setView((current) => current === 'split' ? 'source' : current)
  }, [isNarrow])

  const apply = (action: MdAction) => {
    const ta = taRef.current
    if (!ta) return
    const r = insertMarkdown(value, ta.selectionStart, ta.selectionEnd, action)
    pendingSel.current = { s: r.selStart, e: r.selEnd }
    onChange(r.text)
  }

  // onChange 后父组件回灌新 value → textarea 重渲染 → 这里恢复工具栏算出的选区。
  useEffect(() => {
    const sel = pendingSel.current
    const ta = taRef.current
    if (sel && ta) {
      ta.selectionStart = sel.s
      ta.selectionEnd = sel.e
      ta.focus()
      pendingSel.current = null
    }
  }, [value])

  return (
    <div className={`md-editor${className ? ' ' + className : ''}`}>
      <style>{styles}</style>
      <div className="md-editor__toolbar" role="toolbar" aria-label={t('editor.toolbar')}>
        {TOOLBAR.map((tb) => {
          const label = t(TOOLBAR_KEYS[tb.action])
          return (
            <button
              key={tb.action}
              type="button"
              className="md-editor__btn"
              title={label}
              aria-label={label}
              onClick={() => apply(tb.action)}
            >
              <WorkbenchIcon name={tb.name} size={16} />
            </button>
          )
        })}
        <span className="md-editor__spacer" />
        {VIEWS.map((v) => {
          const label = t(v.key)
          return (
            <button
              key={v.v}
              type="button"
              className={`md-editor__btn md-editor__btn--text md-editor__btn--view-${v.v}${view === v.v ? ' is-active' : ''}`}
              title={label}
              aria-label={label}
              aria-pressed={view === v.v}
              onClick={() => setView(v.v)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className={`md-editor__body md-editor__body--${view}`}>
        {(view === 'split' || view === 'source') && (
          <textarea
            ref={taRef}
            className="md-editor__textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('editor.placeholder')}
            spellCheck={false}
          />
        )}
        {(view === 'split' || view === 'preview') && (
          <div className="md-editor__preview">
            {value.trim() ? (
              <MarkdownBody source={value} />
            ) : (
              <p className="md-editor__empty">{t('editor.previewEmpty')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = `
.md-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: var(--border-thick);
  background: var(--color-white-soft);
}
.md-editor__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-quarter);
  padding: var(--space-1);
  border-bottom: var(--border-thick);
  background: var(--color-white);
  flex-wrap: wrap;
}
.md-editor__btn {
  min-height: 44px;
  min-width: 44px;
  padding: 0 var(--space-1);
  display: grid;
  place-items: center;
  border: var(--border-hairline);
  background: var(--color-white);
  color: var(--color-black);
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-family: var(--font-display);
  font-size: var(--font-size-xs);
  font-weight: 600;
}
.md-editor__btn:hover { background: var(--color-yellow-soft); }
.md-editor__btn.is-active { background: var(--color-black); color: var(--color-white); }
.md-editor__btn--text { font-size: var(--font-size-xs); }
.md-editor__spacer { flex: 1; }
.md-editor__body { flex: 1; display: flex; min-height: 0; }
.md-editor__body--split .md-editor__textarea { flex: 1; border-right: var(--border-thick); }
.md-editor__body--split .md-editor__preview { flex: 1; }
.md-editor__body--source .md-editor__textarea { flex: 1; }
.md-editor__body--preview .md-editor__preview { flex: 1; }
.md-editor__textarea {
  width: 100%;
  height: 100%;
  border: 0;
  outline: 0;
  resize: none;
  padding: var(--space-2);
  font-family: var(--font-content);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  color: var(--color-black);
  background: var(--color-white);
}
.md-editor__textarea:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.md-editor__preview {
  overflow: auto;
  padding: var(--space-2);
  background: var(--color-white);
}
.md-editor__preview .md { font-size: var(--font-size-sm); }
.md-editor__empty { color: var(--color-gray); font-style: italic; margin: 0; }
@media (max-width: 640px) {
  .md-editor__btn--view-split { display: none; }
  .md-editor__body--split .md-editor__preview { display: none; }
  .md-editor__body--split .md-editor__textarea { border-right: 0; }
}
`
