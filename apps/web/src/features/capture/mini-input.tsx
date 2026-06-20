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
import { draftStore, useDraft } from '@/lib/draft-store'
import { useDebouncedCallback } from '@/lib/use-debounced-callback'
import { useI18n } from '@/lib/i18n'

interface CaptureDraftPayload {
  title: string
  body: string
}

export interface MiniInputProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: { title: string; body?: string }) => void
}

export function MiniInput({ open, onClose, onSubmit }: MiniInputProps) {
  const { t } = useI18n()
  const { draft, ready } = useDraft<CaptureDraftPayload>('capture')
  const restored = ready && draft ? draft.payload : null
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [bodyOpen, setBodyOpen] = useState(false)
  // C4 (v0.23.3): block rapid double-submit. The submit handler is
  // fire-and-forget (caller does `void captureSinkRegistry.submit()`),
  // and React's async setState means a second ⌘↩ within the same tick
  // re-enters submit() before setOpen(false) closes the modal — two
  // cards get created. Latch until the parent unmounts/closes us.
  const [submitting, setSubmitting] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  // Debounced autosave (spec §5.5). 500ms of silence → persist. The store
  // write is best-effort; failure (quota) is swallowed inside draft-store.
  const persistDraft = useDebouncedCallback((t: string, b: string) => {
    // Only persist if there's something worth saving — an empty draft is
    // treated as "no draft" so we don't leave stale empty records behind.
    if (t.trim().length === 0 && b.trim().length === 0) {
      draftStore.clear('capture')
      return
    }
    draftStore.upsert('capture', { title: t, body: b } satisfies CaptureDraftPayload)
  }, 500)

  // On open transition (false → true): restore the latest persisted draft.
  // Escape-close deliberately keeps the draft (spec §5.5 "输入即保存").
  // Only the `ready` flag gates this — once hydrated, the restored values
  // are applied exactly once per open.
  useEffect(() => {
    if (open && ready) {
      setTitle(restored?.title ?? '')
      setBody(restored?.body ?? '')
      setBodyOpen(Boolean(restored?.body && restored.body.trim().length > 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready])

  const setTitleAndPersist = (t: string) => {
    setTitle(t)
    persistDraft(t, body)
  }
  const setBodyAndPersist = (b: string) => {
    setBody(b)
    persistDraft(title, b)
  }

  const submit = () => {
    if (submitting) return
    const t = title.trim()
    if (t.length === 0) return
    setSubmitting(true)
    onSubmit({ title: t, body: body.trim() || undefined })
    // Successful submit clears the draft (a saved card is no longer a draft).
    draftStore.clear('capture')
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
// We detect "title input is active" via e.target (v0.23.2-hardening).
// The previous approach compared the active element's placeholder to
// t('capture.miniTitle'), which broke after a locale switch because the
// active element retained the old placeholder value while t() returned
// the new one. The event target IS the currently-keyed element so it's
// always in sync with the user's current focus.
// When bodyOpen is already true Enter is just a newline inside the
// textarea, so we let that pass through.
if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !bodyOpen &&
      (e.target as HTMLElement).tagName === 'INPUT'
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
      aria-label={t('nav.capture')}
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <div className="mi-frame" onClick={(e) => e.stopPropagation()}>
        <div className="mi-region" aria-hidden="true" />
        <div className="mi-body">
          <Input
            type="text"
            placeholder={t('capture.miniTitle')}
            value={title}
            onChange={(e) => setTitleAndPersist(e.target.value)}
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
              + {t('inbox.create.bodyPlaceholder')}
            </button>
          )}
          {bodyOpen && (
            <textarea
              ref={bodyRef}
              className="mi-textarea"
              placeholder={t('capture.miniBody')}
              value={body}
              onChange={(e) => setBodyAndPersist(e.target.value)}
              rows={5}
            />
          )}
        </div>
        <div className="mi-actions">
          <span className="mi-hint">{navigator.platform?.includes('Mac') ? '⌘↩' : 'Ctrl+Enter'} {t('card.detail.save')} · esc {t('card.detail.cancel')}</span>
          <Button variant="ghost" onClick={onClose}>
            {t('card.detail.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={submitting || title.trim().length === 0}
            onClick={submit}
          >
            {t('card.detail.save')}
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
  /* v0.23.0 polish: thinner border keeps the red accent recognisable
     without overpowering on dark theme where the bright --color-red
     (#ff4d4d) on near-black gives strong contrast. */
  border: 1px solid var(--color-red);
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