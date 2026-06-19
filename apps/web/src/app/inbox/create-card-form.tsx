'use client'

import { useState, useTransition, useEffect, useId } from 'react'
import { Button, Input, Tag } from '@cys-stift/ui'
import type { CodeBlock, LinkPreview, Quote } from '@cys-stift/domain'

export interface CreateCardFormProps {
  onCreate: (input: {
    title: string
    body: string
    links: LinkPreview[]
    codeSnippets: CodeBlock[]
    quotes: Quote[]
  }) => void
}

type Section = 'links' | 'code' | 'quotes' | null

interface DraftLink {
  url: string
}
interface DraftCode {
  language: string
  code: string
}
interface DraftQuote {
  text: string
  attribution: string
}

/**
 * Multi-media card creation form (spec §4.8 CaptureInput fields). Title is
 * the only required field; everything else is optional and submitted as the
 * matching typed array. We keep a small set of in-progress drafts so the
 * caller can review before persisting.
 */
export function CreateCardForm({ onCreate }: CreateCardFormProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [openSection, setOpenSection] = useState<Section>(null)
  const [links, setLinks] = useState<DraftLink[]>([])
  const [codes, setCodes] = useState<DraftCode[]>([])
  const [quotes, setQuotes] = useState<DraftQuote[]>([])
  const [pending, startTransition] = useTransition()

  const formId = useId()

  useEffect(() => {
    // No-op: focus management is opt-in via document.activeElement;
    // a real auto-focus would require a ref-forwarded Input (not in MVP).
  }, [])

  const canSubmit = title.trim().length > 0 && !pending

  const reset = () => {
    setTitle('')
    setBody('')
    setLinks([])
    setCodes([])
    setQuotes([])
    setOpenSection(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    const linkPayload: LinkPreview[] = links
      .map((l) => l.url.trim())
      .filter(Boolean)
      .map((url) => ({ url, fetchedAt: new Date() }))
    const codePayload: CodeBlock[] = codes
      .filter((c) => c.code.trim().length > 0)
      .map((c) => ({
        language: c.language.trim() || 'text',
        code: c.code,
      }))
    const quotePayload: Quote[] = quotes
      .filter((q) => q.text.trim().length > 0)
      .map((q) => ({
        text: q.text,
        ...(q.attribution.trim() ? { attribution: q.attribution.trim() } : {}),
      }))
    startTransition(() => {
      onCreate({
        title: cleanTitle,
        body: cleanBody,
        links: linkPayload,
        codeSnippets: codePayload,
        quotes: quotePayload,
      })
      reset()
    })
  }

  return (
    <form className="ccf" onSubmit={handleSubmit} aria-labelledby={`${formId}-h`}>
      <h2 id={`${formId}-h`} className="ccf__h">
        New card
      </h2>

      <Input
        label="Title"
        name={`${formId}-title`}
        placeholder="灵感标题…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
      />

      <label className="ccf__field">
        <span className="ccf__label">Body (Markdown, optional)</span>
        <textarea
          className="ccf__textarea"
          name={`${formId}-body`}
          placeholder={'用 Markdown 写…\n# heading\n- list\n**bold** `code`'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
        />
      </label>

      <div className="ccf__sections" role="group" aria-label="Add media">
        <button
          type="button"
          className="ccf__toggle"
          aria-expanded={openSection === 'links'}
          onClick={() =>
            setOpenSection((s) => (s === 'links' ? null : 'links'))
          }
        >
          + Link {links.length > 0 && <Tag color="red">{links.length}</Tag>}
        </button>
        <button
          type="button"
          className="ccf__toggle"
          aria-expanded={openSection === 'code'}
          onClick={() =>
            setOpenSection((s) => (s === 'code' ? null : 'code'))
          }
        >
          + Code {codes.length > 0 && <Tag color="yellow">{codes.length}</Tag>}
        </button>
        <button
          type="button"
          className="ccf__toggle"
          aria-expanded={openSection === 'quotes'}
          onClick={() =>
            setOpenSection((s) => (s === 'quotes' ? null : 'quotes'))
          }
        >
          + Quote {quotes.length > 0 && <Tag color="blue">{quotes.length}</Tag>}
        </button>
      </div>

      {openSection === 'links' && (
        <ListEditor
          items={links}
          onChange={setLinks}
          make={() => ({ url: '' })}
          label="URL"
          placeholder="https://…"
          fieldKey="url"
        />
      )}
      {openSection === 'code' && (
        <CodeEditor items={codes} onChange={setCodes} />
      )}
      {openSection === 'quotes' && (
        <QuoteEditor items={quotes} onChange={setQuotes} />
      )}

      <div className="ccf__actions">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? 'Saving…' : 'Add to inbox'}
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>
          Clear
        </Button>
      </div>

      <style>{styles}</style>
    </form>
  )
}

interface ListEditorProps<T> {
  items: T[]
  onChange: (next: T[]) => void
  make: () => T
  label: string
  placeholder?: string
  fieldKey: keyof T
}

function ListEditor<T extends Record<string, string>>({
  items,
  onChange,
  make,
  label,
  placeholder,
  fieldKey,
}: ListEditorProps<T>) {
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
              aria-label={`Remove ${label} ${i + 1}`}
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
        + Add {label.toLowerCase()}
      </button>
    </div>
  )
}

function CodeEditor({
  items,
  onChange,
}: {
  items: DraftCode[]
  onChange: (next: DraftCode[]) => void
}) {
  return (
    <div className="le">
      <ul className="le__list">
        {items.map((item, i) => (
          <li key={i} className="le__code">
            <div className="le__code-head">
              <input
                className="le__lang"
                value={item.language}
                placeholder="language (e.g. ts)"
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
                aria-label={`Remove code ${i + 1}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            <textarea
              className="le__code-area"
              value={item.code}
              placeholder="code…"
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
        + Add code block
      </button>
    </div>
  )
}

function QuoteEditor({
  items,
  onChange,
}: {
  items: DraftQuote[]
  onChange: (next: DraftQuote[]) => void
}) {
  return (
    <div className="le">
      <ul className="le__list">
        {items.map((item, i) => (
          <li key={i} className="le__quote">
            <textarea
              className="le__quote-text"
              value={item.text}
              placeholder="quote text…"
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
              placeholder="attribution (author / source)"
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
              aria-label={`Remove quote ${i + 1}`}
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
        + Add quote
      </button>
    </div>
  )
}

const styles = `
.ccf {
  border: var(--border-hairline);
  background: var(--color-white);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.ccf__h {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 500;
  letter-spacing: -0.01em;
}
.ccf__field { display: flex; flex-direction: column; gap: var(--space-1); }
.ccf__label {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-gray);
}
.ccf__textarea {
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: var(--border-hairline);
  padding: var(--space-1) 0;
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  color: var(--color-black);
  outline: none;
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
}
.ccf__textarea:focus { border-bottom-color: var(--color-red); }
.ccf__textarea::placeholder { color: var(--color-gray); }
.ccf__sections { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.ccf__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 32px;
  padding: 0 var(--space-2);
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-black);
  cursor: pointer;
}
.ccf__toggle:hover { background: var(--color-red-soft); }
.ccf__actions { display: flex; gap: var(--space-2); }
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
