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

type View = 'split' | 'source' | 'preview'

const TOOLBAR: { name: WorkbenchIconName; action: MdAction; label: string }[] = [
  { name: 'h2', action: 'h2', label: '标题' },
  { name: 'bold', action: 'bold', label: '粗体' },
  { name: 'italic', action: 'italic', label: '斜体' },
  { name: 'strike', action: 'strike', label: '删除线' },
  { name: 'code', action: 'code', label: '行内代码' },
  { name: 'codeblock', action: 'codeblock', label: '代码块' },
  { name: 'quote', action: 'quote', label: '引用' },
  { name: 'ul', action: 'ul', label: '无序列表' },
  { name: 'task', action: 'task', label: '任务列表' },
  { name: 'table', action: 'table', label: '表格' },
  { name: 'link', action: 'link', label: '链接' },
]

const VIEWS: { v: View; label: string }[] = [
  { v: 'split', label: '分屏' },
  { v: 'source', label: '源码' },
  { v: 'preview', label: '预览' },
]

export interface MarkdownEditorProps {
  value: string
  onChange: (next: string) => void
  className?: string
}

export function MarkdownEditor({ value, onChange, className }: MarkdownEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const pendingSel = useRef<{ s: number; e: number } | null>(null)
  const [view, setView] = useState<View>('split')

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
      <div className="md-editor__toolbar" role="toolbar" aria-label="markdown 格式">
        {TOOLBAR.map((t) => (
          <button
            key={t.action}
            type="button"
            className="md-editor__btn"
            title={t.label}
            aria-label={t.label}
            onClick={() => apply(t.action)}
          >
            <WorkbenchIcon name={t.name} size={16} />
          </button>
        ))}
        <span className="md-editor__spacer" />
        {VIEWS.map((v) => (
          <button
            key={v.v}
            type="button"
            className={`md-editor__btn md-editor__btn--text${view === v.v ? ' is-active' : ''}`}
            title={v.label}
            aria-label={v.label}
            aria-pressed={view === v.v}
            onClick={() => setView(v.v)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className={`md-editor__body md-editor__body--${view}`}>
        {(view === 'split' || view === 'source') && (
          <textarea
            ref={taRef}
            className="md-editor__textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="写点什么… 支持表格 / 任务列表 / 代码（富 Markdown）"
            spellCheck={false}
          />
        )}
        {(view === 'split' || view === 'preview') && (
          <div className="md-editor__preview">
            {value.trim() ? (
              <MarkdownBody source={value} />
            ) : (
              <p className="md-editor__empty">预览为空</p>
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
  height: 28px;
  min-width: 28px;
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
.md-editor__preview {
  overflow: auto;
  padding: var(--space-2);
  background: var(--color-white);
}
.md-editor__preview .md { font-size: var(--font-size-sm); }
.md-editor__empty { color: var(--color-gray); font-style: italic; margin: 0; }
`
