'use client'

/**
 * TemplatePicker (W-T3) — the template grid inside the New-Canvas modal.
 *
 * Lists all templates (4 presets + user-saved) plus a "Blank" option. Calls
 * onSelect with the template name (or 'blank'). The actual canvas creation +
 * template application lives in the canvas page (it needs the adapter +
 * timing coordination: canvasStore.create → SelfCanvas rebuild → onAdapterReady).
 */
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { allTemplates, type CanvasTemplate } from '@/lib/canvas-templates'

export type TemplateChoice = 'blank' | string

/** 预设模板名 → i18n 标签。switch over literal keys 让 TS 收窄成 MessageKey,
 *  避免 `canvas.template.${name}` 模板字符串绕过字面量类型检查。 */
function presetLabel(
  name: string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (name) {
    case 'mindmap':
      return t('canvas.template.mindmap')
    case 'flowchart':
      return t('canvas.template.flowchart')
    case 'kanban':
      return t('canvas.template.kanban')
    case 'quadrant':
      return t('canvas.template.quadrant')
    default:
      return name
  }
}

export function TemplatePicker({
  selected,
  onSelect,
}: {
  selected: TemplateChoice
  onSelect: (choice: TemplateChoice) => void
}) {
  const { t } = useI18n()
  // allTemplates reads localStorage; recompute on mount to avoid SSR/hydration
  // mismatch (server renders presets-only, client adds customs after mount).
  const [templates, setTemplates] = useState<CanvasTemplate[]>(() => allTemplates())
  useEffect(() => {
    setTemplates(allTemplates())
  }, [])

  return (
    <div className="tp">
      <p className="tp__label">{t('canvas.template.title')}</p>
      <div className="tp__grid">
        <button
          type="button"
          className={`tp__cell${selected === 'blank' ? ' tp__cell--active' : ''}`}
          onClick={() => onSelect('blank')}
          aria-pressed={selected === 'blank'}
        >
          <span className="tp__preview tp__preview--blank" aria-hidden="true">□</span>
          <span className="tp__name">{t('canvas.template.blank')}</span>
        </button>
        {templates.map((tpl) => {
          const isActive = selected === tpl.name
          // 预设走 i18n key(中英双语);自建模板名是用户输入的原文,不翻译。
          const label = tpl.preset ? presetLabel(tpl.name, t) : tpl.name
          return (
            <button
              key={tpl.name}
              type="button"
              className={`tp__cell${isActive ? ' tp__cell--active' : ''}`}
              onClick={() => onSelect(tpl.name)}
              aria-pressed={isActive}
            >
              <span className="tp__preview" aria-hidden="true">{tpl.preset ? presetGlyph(tpl.name) : '★'}</span>
              <span className="tp__name">{label}</span>
            </button>
          )
        })}
      </div>
      <style>{styles}</style>
    </div>
  )
}

/** Bauhaus-style glyph per preset (mirrors rail icon vocabulary). */
function presetGlyph(name: string): string {
  switch (name) {
    case 'mindmap':
      return '🕸'
    case 'flowchart':
      return '⇉'
    case 'kanban':
      return '▦'
    case 'quadrant':
      return '⊞'
    default:
      return '□'
  }
}

const styles = `
.tp { margin-top: var(--space-2); }
.tp__label {
  margin: 0 0 var(--space-1) 0;
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray);
}
.tp__grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: var(--space-1);
}
.tp__cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  padding: var(--space-2) var(--space-1);
  background: var(--color-white); color: var(--color-black);
  border: 2px solid var(--color-gray-soft); border-radius: var(--radius-sm);
  cursor: pointer; min-height: 72px;
  transition: background 80ms ease-out, border-color 80ms ease-out, transform 60ms ease-out;
}
.tp__cell:hover:not(:disabled) { background: var(--color-gray-soft); border-color: var(--color-gray); }
.tp__cell:active:not(:disabled) { transform: scale(0.96); }
.tp__cell--active { background: var(--color-yellow); border-color: var(--color-black); }
.tp__cell:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tp__preview { font-size: var(--font-size-xl); line-height: 1; }
.tp__preview--blank { color: var(--color-gray); }
.tp__name {
  font-family: var(--font-body); font-size: var(--font-size-xs);
  line-height: 1.1; text-align: center; letter-spacing: 0;
}
@media (prefers-reduced-motion: reduce) {
  .tp__cell { transition: none !important; }
  .tp__cell:active { transform: none !important; }
}
`
