'use client'

import { useState, useEffect, useId } from 'react'
import { Button, Input, Tag } from '@cys-stift/ui'
import type { CodeBlock, LinkPreview, Quote, TagRef } from '@cys-stift/domain'
import { draftStore, useDraft, isDraftPersistOk } from '@/lib/draft-store'
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
import { solidTagChipStyle, stableTagColor } from '@/lib/tag-color'

export interface CreateCardFormProps {
  /**
   * Persist the captured input. Resolves true on success, false on failure
   * (e.g. quota exceeded — the consumer surfaces an error toast). Mirrors
   * MiniInput's onSubmit contract: the form awaits this and only resets
   * itself + clears the manual draft on success, so a failed save leaves
   * the user's typed input in place for retry (H2/H3 fix).
   */
  onCreate: (input: {
    title: string
    body: string
    links: LinkPreview[]
    codeSnippets: CodeBlock[]
    quotes: Quote[]
    tags: TagRef[]
  }) => Promise<boolean>
  /**
   * Whether the backing DB/service is hydrated and ready to accept writes.
   * The form renders outside the page's `!ready` loading gate so the user
   * can type their draft before hydration; but submitting before the repo
   * is hydrated would call into an unhydrated service and throw with no
   * error boundary → route crash. When false the submit button is disabled
   * and handleSubmit early-returns. Defaults to true (other callers).
   */
  ready?: boolean
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
export function CreateCardForm({ onCreate, ready = true }: CreateCardFormProps) {
  const { t } = useI18n()
  const { draft, ready: draftReady } = useDraft<ManualDraftPayload>('manual')
  const restored = draftReady && draft ? draft.payload : null
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [openSection, setOpenSection] = useState<Section>(null)
  const [links, setLinks] = useState<DraftLink[]>([])
  const [codes, setCodes] = useState<DraftCode[]>([])
  const [quotes, setQuotes] = useState<DraftQuote[]>([])
  // tag 快速输入(session-only,不进 draft,与 MiniInput 一致)。
  const [tags, setTags] = useState<TagRef[]>([])
  const [tagInput, setTagInput] = useState('')
  // Submit latch: while awaiting onCreate's promise we disable the button
  // to prevent double-submit (onCreate is now async — see handleSubmit).
  // Replaces the former useTransition `pending` latch, which only covered
  // sync state updates and can't span the await.
  const [submitting, setSubmitting] = useState(false)
  // R2.10: surface silent autosave failures (quota exceeded).
  const [persistFailed, setPersistFailed] = useState(false)

  const formId = useId()

  // Restore the latest persisted manual draft once (after hydration).
  useEffect(() => {
    if (draftReady && restored) {
      setTitle(restored.title ?? '')
      setBody(restored.body ?? '')
      setLinks(restored.links ?? [])
      setCodes(restored.codes ?? [])
      setQuotes(restored.quotes ?? [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady])

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
        setPersistFailed(!isDraftPersistOk())
        return
      }
      draftStore.upsert('manual', p)
      setPersistFailed(!isDraftPersistOk())
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
  const addTag = (raw: string) => {
    const val = raw.trim()
    if (!val || tags.some((tg) => tg.value === val)) {
      setTagInput('')
      return
    }
    setTags((prev) => [...prev, { value: val, color: stableTagColor(val) }])
    setTagInput('')
  }

  useEffect(() => {
    // No-op: focus management is opt-in via document.activeElement;
    // a real auto-focus would require a ref-forwarded Input (not in MVP).
  }, [])

  const canSubmit = title.trim().length > 0 && !submitting && ready

  const reset = () => {
    setTitle('')
    setBody('')
    setLinks([])
    setCodes([])
    setQuotes([])
    setTags([])
    setTagInput('')
    setOpenSection(null)
    draftStore.clear('manual')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return // DB not hydrated yet — guard against crash into unhydrated service
    if (!canSubmit) return
    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    // H3 fix (mirror MiniInput): cancel any pending debounced draft
    // persist BEFORE we clear the draft on success. Otherwise a keystroke
    // in the last ~500ms before submit queues a persistDraft that fires
    // AFTER reset() → draftStore.clear('manual'), re-persisting the just-
    // submitted text as a draft so it reappears next mount.
    persistDraft.cancel()
    setSubmitting(true)
    // H2 fix: await the submit result and ONLY reset the form + clear the
    // draft on SUCCESS. On failure (quota) keep the form contents so the
    // user can retry — the consumer (inbox/page onCreate) already pushed
    // an error toast. Happy path is still a single microtask
    // (WebCaptureSink.submit resolves synchronously) so the form clears
    // without a perceptible delay.
    let ok = false
    try {
      ok = await onCreate({
        title: cleanTitle,
        body: cleanBody,
        links: draftLinksToPayload(links),
        codeSnippets: draftCodesToPayload(codes),
        quotes: draftQuotesToPayload(quotes),
        tags,
      })
    } catch {
      // Defensive: onCreate is specced to never throw (it .catches
      // internally and returns false), but guard anyway so a bug in the
      // consumer can't crash the form / lose input.
      ok = false
    } finally {
      setSubmitting(false)
    }
    if (ok) {
      reset()
    }
    // On failure: form contents + manual draft are preserved for retry.
  }

  return (
    <form className="ccf" onSubmit={handleSubmit} aria-labelledby={`${formId}-h`}>
      <h2 id={`${formId}-h`} className="ccf__h">
        {t('inbox.create.heading')}
      </h2>

      <Input
        label={t('card.detail.fieldTitle')}
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

      <div className="ccf__tags">
        {tags.map((tag) => (
          <span key={tag.value} className="ccf__tag-chip" style={solidTagChipStyle(tag.color)}>
            {tag.value}
            <button
              type="button"
              className="ccf__tag-remove"
              aria-label={t('tag.remove') + ': ' + tag.value}
              onClick={() => setTags((prev) => prev.filter((x) => x.value !== tag.value))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="ccf__tag-input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addTag(tagInput)
            }
          }}
          onBlur={() => addTag(tagInput)}
          placeholder={t('tag.placeholder')}
          aria-label={t('tag.add')}
        />
      </div>

      <div className="ccf__sections" role="group" aria-label={t('inbox.create.mediaAria')}>
        <button
          type="button"
          className="ccf__toggle"
          aria-expanded={openSection === 'links'}
          onClick={() =>
            setOpenSection((s) => (s === 'links' ? null : 'links'))
          }
        >
          {t('inbox.create.addLink')} {links.length > 0 && <Tag color="red">{links.length}</Tag>}
        </button>
        <button
          type="button"
          className="ccf__toggle"
          aria-expanded={openSection === 'code'}
          onClick={() =>
            setOpenSection((s) => (s === 'code' ? null : 'code'))
          }
        >
          {t('inbox.create.addCode')} {codes.length > 0 && <Tag color="yellow">{codes.length}</Tag>}
        </button>
        <button
          type="button"
          className="ccf__toggle"
          aria-expanded={openSection === 'quotes'}
          onClick={() =>
            setOpenSection((s) => (s === 'quotes' ? null : 'quotes'))
          }
        >
          {t('inbox.create.addQuote')} {quotes.length > 0 && <Tag color="blue">{quotes.length}</Tag>}
        </button>
      </div>

      {openSection === 'links' && (
        <ListEditor
          items={links}
          onChange={setLinksAndPersist}
          make={() => ({ url: '' })}
          label={t('inbox.create.urlLabel')}
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
          {submitting ? t('card.detail.saving') : t('inbox.create.submit')}
        </Button>
        <span className="ccf__actions-spacer" />
        <Button type="button" variant="ghost" onClick={reset}>
          {t('inbox.create.clear')}
        </Button>
      </div>
      {persistFailed && (
        <p className="ccf__warn" role="alert">{t('draft.persistFailed')}</p>
      )}

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
  font-family: var(--font-content);
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
  min-height: 44px;
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
.ccf__tags {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1);
}
.ccf__tag-chip {
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: 0 var(--space-1);
}
.ccf__tag-remove { background: transparent; border: 0; color: inherit; cursor: pointer; padding: 0; font-size: inherit; line-height: 1; }
.ccf__tag-input {
  flex: 1; min-width: 120px; border: 0; outline: 0; background: transparent;
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black);
  padding: var(--space-quarter) 0;
}
.ccf__tag-input:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.ccf__actions { display: flex; gap: var(--space-2); align-items: center; }
.ccf__actions-spacer { flex: 1; }
.ccf__warn {
  margin: 0;
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-red);
}
`
