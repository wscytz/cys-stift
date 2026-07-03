'use client'

/**
 * M3.4 — Inline AI popover. Streams AI output as it arrives; offers three
 * post-stream actions: Cancel (close), Append as new card, Replace body.
 *
 * Mounts at the bottom of card-detail.tsx's action bar; position is
 * `absolute` with the parent Modal providing `position: relative`. If the
 * Modal can't host an absolute child, the popover simply floats in place.
 *
 * Abort on unmount: returning from the useEffect calls `ctrl.abort()`,
 * which propagates into the provider's fetch — any in-flight stream is
 * cancelled and the user sees the partial output frozen in place. We
 * intentionally don't show an error for AbortError (the user-initiated
 * cancellation path).
 */

import { useEffect, useRef, useState } from 'react'
import type { Card } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import { runAIAction } from './ai-actions'
import type { AIAction } from './prompts'
import { getCurrentAI } from './ai-settings-provider'

interface Props {
  card: Card
  action: AIAction
  targetLang?: 'zh' | 'en'
  onClose: () => void
  onReplace: (newBody: string) => void
  onAppendNew: (newCard: { title: string; body: string }) => void
}

export function AIPopover({
  card,
  action,
  targetLang,
  onClose,
  onReplace,
  onAppendNew,
}: Props) {
  const { t, locale } = useI18n()
  const [streamed, setStreamed] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const ai = getCurrentAI()
    if (!ai) {
      setError(t('ai.notConfigured'))
      setRunning(false)
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)
    runAIAction(ai, action, card, {
      targetLang,
      locale: locale,
      signal: ctrl.signal,
      onDelta: (chunk) => setStreamed((s) => s + chunk),
    })
      .then(() => setRunning(false))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return
        setError(t('ai.error', { error: (e as Error).message }))
        setRunning(false)
      })
    return () => {
      ctrl.abort()
    }
    // card.id is the stable identity for the underlying record; we
    // intentionally re-stream when the action/lang changes.
  }, [card.id, action, targetLang, t])

  return (
    <div className="ai-popover" id="ai-popover" role="dialog" aria-label={t('ai.suggestion')}>
      <div className="ai-popover__hd">
        <span className="ai-popover__title"><span className="ai-popover__mark" aria-hidden="true">»</span> {action}</span>
        {running && (
          <span className="ai-popover__dot" aria-label={t('ai.streaming')}>
            ●
          </span>
        )}
      </div>
      <div className="ai-popover__body">
        {error ? (
          <div className="ai-popover__error">⚠ {error}</div>
        ) : (
          <pre className="ai-popover__text">{streamed || (running ? '…' : '')}</pre>
        )}
      </div>
      <div className="ai-popover__actions">
        <button
          type="button"
          className="ai-popover__btn"
          onClick={onClose}
          disabled={running}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="ai-popover__btn"
          disabled={running || !!error || !streamed}
          onClick={() =>
            onAppendNew({ title: `${card.title} (AI)`, body: streamed })
          }
        >
          {t('ai.appendNew')}
        </button>
        <button
          type="button"
          className="ai-popover__btn ai-popover__btn--primary"
          disabled={running || !!error || !streamed}
          onClick={() => onReplace(streamed)}
        >
          {t('ai.replace')}
        </button>
      </div>
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.ai-popover {
  position: relative;
  margin-top: var(--space-2);
  background: var(--color-white);
  border: 2px solid var(--color-black);
  box-shadow: 4px 4px 0 0 var(--color-black);
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
}
.ai-popover__hd {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-1);
  font-weight: 600;
  font-size: var(--font-size-sm);
}
.ai-popover__dot {
  animation: ai-blink 1s infinite;
  color: var(--color-red);
}
.ai-popover__mark { font-family: var(--font-mono); }
@keyframes ai-blink {
  50% { opacity: 0.3; }
}
.ai-popover__body {
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: var(--space-2);
  background: var(--color-gray-soft);
  padding: var(--space-2);
}
.ai-popover__text {
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  margin: 0;
  color: var(--color-black);
}
.ai-popover__error {
  color: var(--color-red);
  font-size: var(--font-size-sm);
}
.ai-popover__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
.ai-popover__btn {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: var(--space-1) var(--space-2);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  background: var(--color-white);
  cursor: pointer;
}
.ai-popover__btn:hover:not(:disabled) { box-shadow: 2px 2px 0 0 var(--color-red); }
.ai-popover__btn:active:not(:disabled) { transform: translate(1px, 1px); box-shadow: none; }
.ai-popover__btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.ai-popover__btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ai-popover__btn--primary { background: var(--color-black); color: var(--color-white); }
.ai-popover__btn--primary:hover:not(:disabled) { box-shadow: 2px 2px 0 0 var(--color-red); }
`