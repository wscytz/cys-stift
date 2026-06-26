'use client'

/**
 * AiActionMenu (spec §3.2 / plan Task 4) — the ✨ AI action list shown when
 * isAIReady() is true. Picking an action hands it back to the caller, which
 * routes into the existing AIPopover flow (unchanged).
 */
import { useI18n } from '@/lib/i18n'
import type { AIAction } from './prompts'

export interface AiActionMenuProps {
  onPick: (action: AIAction, targetLang?: 'zh' | 'en') => void
}

export function AiActionMenu({ onPick }: AiActionMenuProps) {
  const { t } = useI18n()
  return (
    <div className="ai-menu" data-testid="ai-action-menu" role="menu" aria-label={t('ai.menu.title')}>
      <h3 className="ai-menu__title">{t('ai.menu.title')}</h3>
      <button type="button" role="menuitem" className="ai-menu__item" data-testid="ai-menu-summarize" onClick={() => onPick('summarize')}>
        <span className="ai-menu__mark" aria-hidden="true">»</span> {t('ai.menu.summarize')}
      </button>
      <button type="button" role="menuitem" className="ai-menu__item" data-testid="ai-menu-rewrite" onClick={() => onPick('improveWriting')}>
        <span className="ai-menu__mark" aria-hidden="true">»</span> {t('ai.menu.rewrite')}
      </button>
      <button type="button" role="menuitem" className="ai-menu__item" data-testid="ai-menu-translate-en" onClick={() => onPick('translate', 'en')}>
        <span className="ai-menu__mark" aria-hidden="true">»</span> {t('ai.menu.translateEn')}
      </button>
      <button type="button" role="menuitem" className="ai-menu__item" data-testid="ai-menu-translate-zh" onClick={() => onPick('translate', 'zh')}>
        <span className="ai-menu__mark" aria-hidden="true">»</span> {t('ai.menu.translateZh')}
      </button>
      <style>{menuStyles}</style>
    </div>
  )
}

const menuStyles = `
.ai-menu {
  background: var(--color-white); border: var(--border-thick); border-color: var(--color-black);
  box-shadow: 4px 4px 0 var(--color-black); padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); min-width: 200px;
}
.ai-menu__title { font-family: var(--font-display); font-size: var(--font-size-sm); color: var(--color-black); margin: 0 0 var(--space-1); }
.ai-menu__item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-1) var(--space-2); background: transparent; border: 0;
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black);
  cursor: pointer; text-align: left;
}
.ai-menu__item:hover { background: var(--color-yellow); }
.ai-menu__item:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 1px; }
.ai-menu__mark { font-family: var(--font-mono); color: var(--color-red); }
`
