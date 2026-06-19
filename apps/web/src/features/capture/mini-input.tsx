'use client'

/**
 * MiniInput — spec §5.5 Mini Input 视觉：居中浮层 + 红边框强调 +
 * 顶部 8px 红条（capture region）。MVP 极简：标题 Input + 可展开 body
 * textarea + Save / Cancel 按钮组。
 *
 * 键盘交互（plan §3 T2）：
 * - Escape → onClose（不保存）
 * - Enter（title focus + body 收起时）→ 展开 body
 * - Cmd/Ctrl+Enter（任意时）→ 校验 title 非空 → onSubmit → onClose
 * - Tab → 标准 input 行为
 *
 * z-index 200 高于 Modal 100（CaptureHost 不会与 Modal 同时打开，
 * 但保险起见 z-index 更高避免遮挡）。不在 portal 里 — React 树内即可。
 *
 * Focus 策略：`open` 从 false → true 时把 input 渲染出来，`autoFocus`
 * HTML 属性 + 一次 `useEffect` 兜底（autoFocus 在 React 重 mount 时才
 * 生效，所以早返 `null` 后再渲染那一拍是有效的）。
 */
import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '@cys-stift/ui'

export interface MiniInputProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: { title: string; body?: string }) => void
}

export function MiniInput({ open, onClose, onSubmit }: MiniInputProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [bodyOpen, setBodyOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  // Reset on open transition (false → true) so the title input is empty.
  useEffect(() => {
    if (open) {
      setTitle('')
      setBody('')
      setBodyOpen(false)
    }
  }, [open])

  const submit = () => {
    const t = title.trim()
    if (t.length === 0) return
    onSubmit({ title: t, body: body.trim() || undefined })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
      return
    }
    // Enter inside the title input → expand the body textarea and focus it.
    // We detect "title input is active" by checking the active element's
    // placeholder (brittle but fine here — there's only one Input in the
    // dialog). When bodyOpen is already true Enter is just a newline inside
    // the textarea, so we let that pass through.
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !bodyOpen &&
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.placeholder === '灵感标题…'
    ) {
      e.preventDefault()
      setBodyOpen(true)
      queueMicrotask(() => bodyRef.current?.focus())
    }
  }

  if (!open) return null

  return (
    <div
      className="mi-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Quick capture"
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <div className="mi-frame" onClick={(e) => e.stopPropagation()}>
        <div className="mi-region" aria-hidden="true" />
        <div className="mi-body">
          <Input
            type="text"
            placeholder="灵感标题…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mi-title"
            autoFocus
          />
          {!bodyOpen && (
            <button
              type="button"
              className="mi-add-note"
              onClick={() => {
                setBodyOpen(true)
                queueMicrotask(() => bodyRef.current?.focus())
              }}
            >
              + Add note
            </button>
          )}
          {bodyOpen && (
            <textarea
              ref={bodyRef}
              className="mi-textarea"
              placeholder="Markdown 笔记（可选）"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
          )}
        </div>
        <div className="mi-actions">
          <span className="mi-hint">⌘↩ save · esc cancel</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={title.trim().length === 0}
            onClick={submit}
          >
            Save
          </Button>
        </div>
      </div>
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.mi-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(10,10,10,0.5);
  display: grid; place-items: start center;
  padding-top: 20vh;
}
.mi-frame {
  width: min(480px, calc(100vw - var(--space-6)));
  background: var(--color-white);
  border: 2px solid var(--color-red);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
.mi-region { /* 8px red stripe across the top — capture region (spec §5.5 / §5.2) */
  height: 8px; background: var(--color-red);
}
.mi-body { padding: var(--space-4) var(--space-4) var(--space-2); }
.mi-title { width: 100%; }
.mi-add-note {
  display: block; margin-top: var(--space-2);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-gray); text-transform: lowercase;
  background: transparent; border: none; padding: 0; cursor: pointer;
  text-align: left;
}
.mi-add-note:hover { color: var(--color-red); }
.mi-textarea {
  display: block; width: 100%; margin-top: var(--space-2);
  padding: var(--space-2) 0;
  font-family: var(--font-body); font-size: var(--font-size-base);
  color: var(--color-black); background: transparent;
  border: none; border-bottom: var(--border-hairline);
  outline: none; resize: vertical; min-height: 96px;
}
.mi-textarea:focus { border-bottom-color: var(--color-red); }
.mi-actions {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4) var(--space-4);
  border-top: var(--border-hairline);
}
.mi-hint {
  flex: 1; font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-gray); text-transform: lowercase;
}
@media (max-width: 720px) {
  .mi-backdrop { padding-top: 12vh; }
  .mi-frame { width: calc(100vw - var(--space-4)); }
}
`