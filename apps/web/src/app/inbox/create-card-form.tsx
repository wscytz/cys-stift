'use client'

import { useState, useTransition, useEffect, useId } from 'react'
import { Button, Input, Tag } from '@cys-stift/ui'
import type { CodeBlock, LinkPreview, Quote } from '@cys-stift/domain'
import { draftStore, useDraft } from '@/lib/draft-store'
import { useDebouncedCallback } from '@/lib/use-debounced-callback'
import {
  CodeEditor,
  ListEditor,
  QuoteEditor,
  editorStyles,
  type DraftCode,
  type DraftLink,
  type DraftQuote,
  draftCodesToPayload,
  draftLinksToPayload,
  draftQuotesToPayload,
} from '@/features/card/editors'
import { useI18n } from '@/lib/i18n'

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

/** Persisted manual draft (spec §5.5 "输入即保存草稿" applied to the form). */
interface ManualDraftPayload {
  title: string
  body: string
  links: DraftLink[]
  codes: DraftCode[]
  quotes: DraftQuote[]
}

/**
 * Multi-media card creation form (spec §4.8 CaptureInput fields). Title is
 * the only required field; everything else is optional and submitted as the
 * matching typed array. We keep a small set of in-progress drafts so the
 * caller can review before persisting.
 *
 * Draft autosave (spec §5.5): any field change is debounced 500ms and
 * persisted to draftStore; the latest draft is restored on mount. A
 * successful submit (or Clear) clears the draft.
 */
export function CreateCardForm({ onCreate }: CreateCardFormProps) {
  const { t } = useI18n()
  const { draft, ready } = useDraft<ManualDraftPayload>('manual')
  const restored = ready && draft ? draft.payload : null
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [openSection, setOpenSection] = useState<Section>(null)
  const [links, setLinks] = useState<DraftLink[]>([])
  const [codes, setCodes] = useState<DraftCode[]>([])
  const [quotes, setQuotes] = useState<DraftQuote[]>([])
  const [pending, startTransition] = useTransition()

  const formId = useId()

  // Restore the latest persisted manual draft once (after hydration).
  useEffect(() => {
    if (ready && restored) {
      setTitle(restored.title ?? '')
      setBody(restored.body ?? '')
      setLinks(restored.links ?? [])
      setCodes(restored.codes ?? [])
      setQuotes(restored.quotes ?? [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // Debounced autosave of the full form state.
  const persistDraft = useDebouncedCallback(
    (p: ManualDraftPayload) => {
      const hasContent =
        p.title.trim().length > 0 ||
        p.body.trim().length > 0 ||
        p.links.some((l) => l.url.trim().length > 0) ||
        p.codes.some((c) => c.code.trim().length > 0) ||
        p.quotes.some((q) => q.text.trim().length > 0)
      if (!hasContent) {
        draftStore.clear('manual')
        return
      }
      draftStore.upsert('manual', p)
    },
    500,
  )

  const setTitleAndPersist = (t: string) => {
    setTitle(t)
    persistDraft({ title: t, body, links, codes, quotes })
  }
  const setBodyAndPersist = (b: string) => {
    setBody(b)
    persistDraft({ title, body: b, links, codes, quotes })
  }
  const setLinksAndPersist = (next: DraftLink[]) => {
    setLinks(next)
    persistDraft({ title, body, links: next, codes, quotes })
  }
  const setCodesAndPersist = (next: DraftCode[]) => {
    setCodes(next)
    persistDraft({ title, body, links, codes: next, quotes })
  }
  const setQuotesAndPersist = (next: DraftQuote[]) => {
    setQuotes(next)
    persistDraft({ title, body, links, codes, quotes: next })
  }

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
    draftStore.clear('manual')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    startTransition(() => {
      onCreate({
        title: cleanTitle,
        body: cleanBody,
        links: draftLinksToPayload(links),
        codeSnippets: draftCodesToPayload(codes),
        quotes: draftQuotesToPayload(quotes),
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
        label={t('card.detail.bodyLabel')}
        name={`${formId}-title`}
        placeholder={t('inbox.create.placeholder')}
        value={title}
        onChange={(e) => setTitleAndPersist(e.target.value)}
        maxLength={200}
        required
      />

      <label className="ccf__field">
        <span className="mono-label">{t('inbox.create.bodyPlaceholder')}</span>
        <textarea
          className="ccf__textarea"
          name={`${formId}-body`}
          placeholder={t('inbox.create.bodyPlaceholder')}
          value={body}
          onChange={(e) => setBodyAndPersist(e.target.value)}
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
          onChange={setLinksAndPersist}
          make={() => ({ url: '' })}
          label="URL"
          placeholder="https://…"
          fieldKey="url"
        />
      )}
      {openSection === 'code' && (
        <CodeEditor items={codes} onChange={setCodesAndPersist} />
      )}
      {openSection === 'quotes' && (
        <QuoteEditor items={quotes} onChange={setQuotesAndPersist} />
      )}

      <div className="ccf__actions">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? t('card.detail.saving') : t('inbox.create.submit')}
        </Button>
        <span className="ccf__actions-spacer" />
        <Button type="button" variant="ghost" onClick={reset}>
          Clear
        </Button>
      </div>

      <style>{styles}</style>
      <style>{editorStyles}</style>
    </form>
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
.ccf__actions { display: flex; gap: var(--space-2); align-items: center; }
.ccf__actions-spacer { flex: 1; }
`