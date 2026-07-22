'use client'

/**
 * AiActionMenu (spec §3.2 / plan Task 4) — the ✨ AI action list shown when
 * isAIReady() is true. Picking an action hands it back to the caller, which
 * routes into the existing AIPopover flow (unchanged).
 *
 * v7:新增「自定义编辑指令」(editWithInstruction)——点击展开内联输入框,填一句
 * 自由编辑指令(如"改成要点列表"/"标题更简洁")→ onPick('editWithInstruction',
 * undefined, instruction)。onPick 第 3 参承载指令;旧调用方(2 参)向后兼容。
 */
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { AIAction } from './prompts'

export interface AiActionMenuProps {
  onPick: (action: AIAction, targetLang?: 'zh' | 'en', instruction?: string) => void
}

export function AiActionMenu({ onPick }: AiActionMenuProps) {
  const { t } = useI18n()
  const [showInstruction, setShowInstruction] = useState(false)
  const [instruction, setInstruction] = useState('')
  const trimmed = instruction.trim()

  const submitInstruction = () => {
    if (!trimmed) return
    onPick('editWithInstruction', undefined, trimmed)
  }

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
      <button
        type="button"
        role="menuitem"
        className="ai-menu__item"
        data-testid="ai-menu-edit-instruction"
        aria-expanded={showInstruction}
        onClick={() => setShowInstruction((v) => !v)}
      >
        <span className="ai-menu__mark" aria-hidden="true">»</span> {t('ai.menu.editInstruction')}
      </button>
      {showInstruction && (
        <div className="ai-menu__instruction" data-testid="ai-menu-instruction-box">
          <textarea
            className="ai-menu__instruction-input"
            data-testid="ai-menu-instruction-input"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              // 回车发送(Shift+Enter 换行);IME 合成态守卫(keyCode 229)防中文选词误发。
              if (e.key === 'Enter' && !e.shiftKey && e.keyCode !== 229) {
                e.preventDefault()
                submitInstruction()
              }
            }}
            placeholder={t('ai.menu.instructionPlaceholder')}
            aria-label={t('ai.menu.editInstruction')}
            rows={3}
          />
          <button
            type="button"
            className="ai-menu__instruction-apply"
            data-testid="ai-menu-instruction-apply"
            disabled={!trimmed}
            onClick={submitInstruction}
          >
            {t('ai.menu.instructionApply')}
          </button>
        </div>
      )}
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
.ai-menu__instruction { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-1) 0; }
.ai-menu__instruction-input {
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black);
  border: var(--border-hairline); border-radius: var(--radius-sm); padding: var(--space-1);
  resize: vertical; background: var(--color-white);
}
.ai-menu__instruction-input:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 1px; }
.ai-menu__instruction-apply {
  align-self: flex-end; font-family: var(--font-mono); font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.12em; padding: var(--space-1) var(--space-2);
  border: var(--border-hairline); border-radius: var(--radius-sm); background: var(--color-black);
  color: var(--color-white); cursor: pointer;
}
.ai-menu__instruction-apply:disabled { opacity: 0.55; cursor: not-allowed; }
.ai-menu__instruction-apply:hover:not(:disabled) { box-shadow: 2px 2px 0 0 var(--color-red); }
`
