'use client'

import type { CodeBlock, LinkPreview, Quote } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'

// ── Editor row shapes (in-progress drafts; typed payloads are built at save) ──

export interface DraftLink {
  url: string
}
export interface DraftCode {
  language: string
  code: string
}
export interface DraftQuote {
  text: string
  attribution: string
}

// ── ListEditor — generic single-field list (used for links / etc.) ─────────

interface ListEditorProps<T> {
  items: T[]
  onChange: (next: T[]) => void
  make: () => T
  label: string
  placeholder?: string
  fieldKey: keyof T
}

export function ListEditor<T extends Record<string, string>>({
  items,
  onChange,
  make,
  label,
  placeholder,
  fieldKey,
}: ListEditorProps<T>) {
  const { t } = useI18n()
  return (
    <div className="le">
      <ul className="le__list">
        {items.map((item, i) => (
          <li key={i} className="le__row">
            <input
              className="le__input"
              value={item[fieldKey] as string}
              placeholder={placeholder}
              onChange={(e) => {
                const next = items.slice()
                next[i] = { ...next[i], [fieldKey]: e.target.value } as T
                onChange(next)
              }}
            />
            <button
              type="button"
              className="le__remove"
              aria-label={t('editor.removeAria', { label, n: i + 1 })}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="le__add"
        onClick={() => onChange([...items, make()])}
      >
        {t('editor.add', { label: label.toLowerCase() })}
      </button>
    </div>
  )
}

// ── CodeEditor — language + code block pair ────────────────────────────────

export function CodeEditor({
  items,
  onChange,
}: {
  items: DraftCode[]
  onChange: (next: DraftCode[]) => void
}) {
  const { t } = useI18n()
  return (
    <div className="le">
      <ul className="le__list">
        {items.map((item, i) => (
          <li key={i} className="le__code">
            <div className="le__code-head">
              <input
                className="le__lang"
                value={item.language}
                placeholder={t('editor.codeLangPlaceholder')}
                onChange={(e) => {
                  const next = items.slice()
                  const prev = next[i] as DraftCode
                  next[i] = { language: e.target.value, code: prev.code }
                  onChange(next)
                }}
              />
              <button
                type="button"
                className="le__remove"
                aria-label={t('editor.removeAria', { label: t('card.typeCode'), n: i + 1 })}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            <textarea
              className="le__code-area"
              value={item.code}
              placeholder={t('editor.codePlaceholder')}
              rows={3}
              onChange={(e) => {
                const next = items.slice()
                const prev = next[i] as DraftCode
                next[i] = { language: prev.language, code: e.target.value }
                onChange(next)
              }}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="le__add"
        onClick={() => onChange([...items, { language: '', code: '' }])}
      >
        {t('editor.addCode')}
      </button>
    </div>
  )
}

// ── QuoteEditor — text + optional attribution ──────────────────────────────

export function QuoteEditor({
  items,
  onChange,
}: {
  items: DraftQuote[]
  onChange: (next: DraftQuote[]) => void
}) {
  const { t } = useI18n()
  return (
    <div className="le">
      <ul className="le__list">
        {items.map((item, i) => (
          <li key={i} className="le__quote">
            <textarea
              className="le__quote-text"
              value={item.text}
              placeholder={t('editor.quotePlaceholder')}
              rows={2}
              onChange={(e) => {
                const next = items.slice()
                const prev = next[i] as DraftQuote
                next[i] = { text: e.target.value, attribution: prev.attribution }
                onChange(next)
              }}
            />
            <input
              className="le__input"
              value={item.attribution}
              placeholder={t('editor.attributionPlaceholder')}
              onChange={(e) => {
                const next = items.slice()
                const prev = next[i] as DraftQuote
                next[i] = { text: prev.text, attribution: e.target.value }
                onChange(next)
              }}
            />
            <button
              type="button"
              className="le__remove"
              aria-label={t('editor.removeAria', { label: t('card.typeQuote'), n: i + 1 })}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="le__add"
        onClick={() => onChange([...items, { text: '', attribution: '' }])}
      >
        {t('editor.addQuote')}
      </button>
    </div>
  )
}

// ── Converters (draft → typed payload at save) ────────────────────────────

export function draftLinksToPayload(links: DraftLink[]): LinkPreview[] {
  return links
    .map((l) => l.url.trim())
    .filter(Boolean)
    .map((url) => ({ url, fetchedAt: new Date() }))
}

export function draftCodesToPayload(codes: DraftCode[]): CodeBlock[] {
  return codes
    .filter((c) => c.code.trim().length > 0)
    .map((c) => ({
      language: c.language.trim() || 'text',
      code: c.code,
    }))
}

export function draftQuotesToPayload(quotes: DraftQuote[]): Quote[] {
  return quotes
    .filter((q) => q.text.trim().length > 0)
    .map((q) => ({
      text: q.text,
      ...(q.attribution.trim() ? { attribution: q.attribution.trim() } : {}),
    }))
}

// ── Shared CSS for the three editors (.le*) — injected once per consumer ──

export const editorStyles = `
.le { display: flex; flex-direction: column; gap: var(--space-2); border-left: 2px solid var(--color-red); padding-left: var(--space-3); }
.le__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.le__row { display: flex; gap: var(--space-1); align-items: center; }
.le__input {
  flex: 1;
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: var(--border-hairline);
  padding: var(--space-1) 0;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--color-black);
  outline: none;
}
.le__input:focus { border-bottom-color: var(--color-red); }
.le__remove {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  cursor: pointer;
  color: var(--color-black);
}
.le__remove:hover { background: var(--color-red); color: var(--color-white); border-color: var(--color-black); }
.le__add {
  align-self: flex-start;
  background: transparent;
  border: 0;
  padding: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-blue);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.le__code { display: flex; flex-direction: column; gap: var(--space-1); }
.le__code-head { display: flex; gap: var(--space-1); align-items: center; }
.le__lang {
  width: 160px;
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: var(--border-hairline);
  padding: var(--space-1) 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-black);
  outline: none;
  text-transform: lowercase;
}
.le__code-area {
  appearance: none;
  background: var(--color-black-soft);
  color: var(--color-white);
  border: 0;
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  outline: none;
  resize: vertical;
  min-height: 64px;
  border-radius: var(--radius-sm);
}
.le__quote { display: flex; flex-direction: column; gap: var(--space-1); position: relative; }
.le__quote-text {
  appearance: none;
  background: var(--color-white);
  border: var(--border-hairline);
  padding: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--color-black);
  outline: none;
  resize: vertical;
  min-height: 48px;
  border-radius: var(--radius-sm);
}
.le__quote .le__remove { position: absolute; top: 0; right: 0; }
`
