'use client'

/**
 * field-editors — Step 2 共享字段编辑器组件。
 *
 * FieldEditors 按 registry 渲染各字段的 Editor;两壳(详情弹窗 / 工作台)复用,
 * 消除 edit JSX 的字段渲染重复。title/body 在两壳差异大(textarea vs MarkdownEditor
 * 三态),暂留壳特化(不进 FieldEditors);codes/quotes 等统一字段进 FieldEditors。
 */
import type { ComponentType } from 'react'
import type { UpdateCardPatch } from '@cys-stift/domain'
import type { CardDraftField, FieldEditorProps } from './use-card-draft'
import { CodeEditor, QuoteEditor, type DraftCode, type DraftQuote } from './editors'
import { useI18n } from '@/lib/i18n'

/** 代码块字段编辑器(label + CodeEditor)。 */
export function CodesFieldEditor({ value, onChange }: FieldEditorProps<unknown>) {
  const { t } = useI18n()
  return (
    <div className="fe">
      <span className="fe__label">{t('card.detail.code')}</span>
      <CodeEditor items={value as DraftCode[]} onChange={(v) => onChange(v)} />
    </div>
  )
}

/** 引用字段编辑器(label + QuoteEditor)。 */
export function QuotesFieldEditor({ value, onChange }: FieldEditorProps<unknown>) {
  const { t } = useI18n()
  return (
    <div className="fe">
      <span className="fe__label">{t('card.detail.quotes')}</span>
      <QuoteEditor items={value as DraftQuote[]} onChange={(v) => onChange(v)} />
    </div>
  )
}

/**
 * FieldEditors — 渲染 fields 中带 Editor 的字段(省略 Editor 的跳过,如 title/body 壳特化)。
 * 壳传 fields(子集或全集)+ draft + setField。.fe 通用样式(label + 控件),两壳一致。
 */
export function FieldEditors({
  fields,
  draft,
  setField,
}: {
  fields: CardDraftField<unknown>[]
  draft: Record<string, unknown>
  setField: (key: keyof UpdateCardPatch, value: unknown) => void
}) {
  return (
    <>
      <style>{feStyles}</style>
      {fields.map((f) => {
        const Editor = f.Editor as ComponentType<FieldEditorProps<unknown>> | undefined
        if (!Editor) return null
        return (
          <Editor
            key={f.key as string}
            value={draft[f.key as string]}
            onChange={(v) => setField(f.key, v)}
          />
        )
      })}
    </>
  )
}

const feStyles = `
.fe { display: flex; flex-direction: column; gap: var(--space-2); }
.fe__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-black-soft); }
`
