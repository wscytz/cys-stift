'use client'

/**
 * AiSetupCard (spec §3.2 / plan Task 4) — the "not configured" guide shown
 * when a user clicks ✨ AI but isAIReady() is false. Highlights the Ollama
 * zero-cost path and a single "Go to settings" CTA. Reused by card-detail
 * and the canvas AI-layout entry.
 */
import { useI18n } from '@/lib/i18n'

export interface AiSetupCardProps {
  onGoToSettings: () => void
}

export function AiSetupCard({ onGoToSettings }: AiSetupCardProps) {
  const { t } = useI18n()
  return (
    <div className="ai-setup" data-testid="ai-setup-card" role="dialog" aria-label={t('ai.setup.title')}>
      <div className="ai-setup__stripe" aria-hidden="true" />
      <div className="ai-setup__body">
        <h3 className="ai-setup__title">{t('ai.setup.title')}</h3>
        <p className="ai-setup__lede">{t('ai.setup.lede')}</p>
        <button
          type="button"
          className="ai-setup__cta"
          data-testid="ai-setup-goto"
          onClick={onGoToSettings}
        >
          {t('ai.setup.goto')}
        </button>
      </div>
      <style>{setupStyles}</style>
    </div>
  )
}

const setupStyles = `
.ai-setup {
  background: var(--color-white); border: var(--border-thick); border-color: var(--color-black);
  box-shadow: 4px 4px 0 var(--color-black); max-width: 360px; overflow: hidden;
}
.ai-setup__stripe { height: 8px; background: var(--color-yellow); }
.ai-setup__body { padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.ai-setup__title { font-family: var(--font-display); font-size: var(--font-size-base); color: var(--color-black); margin: 0; }
.ai-setup__lede { font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); margin: 0; }
.ai-setup__cta {
  margin-top: var(--space-1); padding: var(--space-2) var(--space-3);
  background: var(--color-black); color: var(--color-white); border: 0;
  font-family: var(--font-display); cursor: pointer;
}
.ai-setup__cta:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 2px; }
`
