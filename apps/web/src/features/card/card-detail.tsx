'use client'

/**
 * CardDetailModal — shared card detail / edit surface.
 *
 * Phase archive-detail (2026-06-20): extracted from inbox/page.tsx (Phase
 * 6.5b's "full 5-field editor" version) so /archive can reuse it. The
 * canvas's `card-detail-modal.tsx` is a smaller Phase 4 MVP (title +
 * body only) — intentionally NOT replaced here, it works and swapping
 * it would risk regressing tagged Phase 4.
 *
 * Consumers pick which action buttons appear via the `actions` prop:
 *   - archive context: actions=['unarchive', 'softDelete']
 *     (cannot re-archive an archived card; "Unarchive" brings it back
 *     to inbox; "Soft-delete" moves to /trash with confirm modal)
 *   - inbox context: actions=['archive','unarchive','sendToCanvas',
 *     'softDelete']. Archive/Unarchive swap based on card.archived
 *     (the same self-routing button the inbox CardDetail already used).
 *   - sendToCanvas only renders when the card has no canvasPosition
 *     (matches the inbox Phase 6.5c behaviour).
 *
 * The soft-delete confirm modal is **internal** — consumer passes
 * `onConfirmDelete` and we own the "are you sure?" dialog. This is the
 * one breaking change vs the original inbox CardDetail (which delegated
 * the confirm to the page). The page-level `confirmDelete` state + Modal
 * in inbox/page.tsx goes away as part of this phase.
 *
 * Phase M3 (2026-06-21): adds three AI action types ('rewrite' /
 * 'summarize' / 'translate'). They render inline buttons next to the
 * view-mode toolbar; their popover mounts inside the Modal so the streaming
 * output stays on-screen. The popover is only mounted when an AI action
 * is in flight — `useAIEnabled()` hides the buttons themselves if the
 * user has no AI config.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Button,
  Input,
  Modal,
  Tag,
} from '@cys-stift/ui'
import type {
  Card,
  CodeBlock,
  LinkPreview,
  MediaRef,
  Quote,
  TagRef,
} from '@cys-stift/domain'
import { TAG_COLORS } from '@cys-stift/domain'
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
} from './editors'
import { MarkdownBody } from '@/app/inbox/markdown'
import { mediaStore } from '@/lib/media-store'
import { safeHref, isSafeImageDataUrl } from '@/lib/safe-href'
import { useI18n } from '@/lib/i18n'
import { typeKeyOf } from '@/lib/type-label'
import { downloadCardMarkdown } from '@/lib/export-card'
import { pushToast } from '@/lib/toast-store'
import { useAIEnabled } from '@/features/ai/ai-settings-provider'
import { AIPopover } from '@/features/ai/ai-popover'

export type CardDetailAction =
  | 'archive'
  | 'unarchive'
  | 'sendToCanvas'
  | 'softDelete'
  | 'pin'
  | 'export'
  | 'rewrite'
  | 'summarize'
  | 'translate'

export interface CardDetailSavePatch {
  title: string
  body: string
  media: MediaRef[]
  links: LinkPreview[]
  codeSnippets: CodeBlock[]
  quotes: Quote[]
  tags: TagRef[]
}

export interface CardDetailModalProps {
  card: Card
  /** Open in edit mode for fresh-with-no-title cards (canvas dblclick
   *  path). Defaults to 'view'. */
  initialMode?: 'view' | 'edit'
  /** Which action buttons to render in the view-mode toolbar. The
   *  Archive/Unarchive button is rendered as a single self-routing
   *  toggle (whichever is in the set, the rendered one depends on
   *  card.archived). The sendToCanvas button only shows when the card
   *  has no canvasPosition. softDelete shows the built-in confirm. */
  actions: CardDetailAction[]
  onClose: () => void
  onSave: (patch: CardDetailSavePatch) => void
  onArchive?: () => void
  onUnarchive?: () => void
  onSendToCanvas?: () => void
  /** Phase A (v0.24.0): toggle pinned state. Rendered as a Pin/Unpin
   *  button in the view toolbar when 'pin' is in `actions`. */
  onTogglePin?: () => void
  /** Confirmed soft-delete (modal already asked). */
  onConfirmDelete: () => void
  /** M3 — AI "Append as new card" handler. The popover doesn't know how
   *  to create cards (that needs the active CardService), so the consumer
   *  wires it. Optional — if omitted the button is disabled. */
  onAIAppendNew?: (card: { title: string; body: string }) => void
}

export function CardDetailModal({
  card,
  initialMode = 'view',
  actions,
  onClose,
  onSave,
  onArchive,
  onUnarchive,
  onSendToCanvas,
  onTogglePin,
  onConfirmDelete,
  onAIAppendNew,
}: CardDetailModalProps) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode)
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [media, setMedia] = useState<MediaRef[]>(card.media)
  const [links, setLinks] = useState<DraftLink[]>(() =>
    card.links.map((l) => ({ url: l.url })),
  )
  const [codes, setCodes] = useState<DraftCode[]>(() =>
    card.codeSnippets.map((c) => ({ language: c.language, code: c.code })),
  )
  const [quotes, setQuotes] = useState<DraftQuote[]>(() =>
    card.quotes.map((q) => ({ text: q.text, attribution: q.attribution ?? '' })),
  )
  const [tags, setTags] = useState<TagRef[]>(card.tags)
  const [tagInput, setTagInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()
  // M3 — AI action state. We track which action (if any) is in flight
  // along with the translate target lang. Closing sets it back to null.
  const [aiAction, setAiAction] = useState<'rewrite' | 'summarize' | 'translate' | null>(null)
  const [translateTo, setTranslateTo] = useState<'zh' | 'en'>('en')
  const aiEnabled = useAIEnabled()
  const dialogRef = useRef<HTMLDivElement>(null)

  const has = (a: CardDetailAction) => actions.includes(a)

  // Re-sync when the consumer hands us a different card (modal re-opened
  // on a sibling without unmounting, or external update).
  useEffect(() => {
    setTitle(card.title)
    setBody(card.body)
    setMedia(card.media)
    setLinks(card.links.map((l) => ({ url: l.url })))
    setCodes(card.codeSnippets.map((c) => ({ language: c.language, code: c.code })))
    setQuotes(card.quotes.map((q) => ({ text: q.text, attribution: q.attribution ?? '' })))
    setTags(card.tags)
    setTagInput('')
    setMode(initialMode)
    setConfirmDelete(false)
  }, [
    card.id,
    card.title,
    card.body,
    card.media,
    card.links,
    card.codeSnippets,
    card.quotes,
    initialMode,
  ])

  // Escape closes — works whether in main modal or in confirm-delete modal.
  // Guard: when a nested Escape-consuming overlay is open, dismiss THAT inner
  // UI instead of clobbering the whole CardDetailModal.
  // Nested consumers: AI popover, confirm-delete sub-modal, tag input focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // AI popover 在前面:Escape 关掉 popover(而不是整个 CardDetail)。
      if (aiAction) {
        setAiAction(null)
        return
      }
      // 标签输入框正聚焦时:Escape 留给输入框(清空/失焦),不关模态。
      const active = typeof document !== 'undefined' ? document.activeElement : null
      if (active instanceof HTMLElement && active.classList.contains('cd__tag-input')) return
      if (confirmDelete) setConfirmDelete(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirmDelete, aiAction])

  // Focus the title input on entering edit mode
  useEffect(() => {
    if (mode === 'edit') {
      const el = dialogRef.current?.querySelector<HTMLInputElement>(
        'input[name="edit-title"]',
      )
      el?.focus()
      el?.select()
    }
  }, [mode])

  const handleSave = () => {
    if (!title.trim()) return
    startTransition(() => {
      onSave({
        title: title.trim(),
        body,
        media: media,
        links: draftLinksToPayload(links),
        codeSnippets: draftCodesToPayload(codes),
        quotes: draftQuotesToPayload(quotes),
        tags,
      })
      setMode('view')
    })
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      try {
        const ref = await mediaStore.attach(file)
        setMedia((prev) => [...prev, ref])
      } catch (err) {
        console.error('[CardDetailModal] attach failed', err)
        pushToast({ kind: 'error', message: t('card.mediaAttachFail', { name: file.name }) })
      }
    }
  }

  // Action visibility — single self-routing toggle for archive/unarchive
  // (matches inbox's existing behaviour). The sendToCanvas button only
  // appears for cards not yet on a canvas (Phase 6.5c).
  const showArchive = has('archive') && !card.archived
  const showUnarchive = has('unarchive') && card.archived
  const showSendToCanvas =
    has('sendToCanvas') && !card.canvasPosition && Boolean(onSendToCanvas)
  const showPin =
    has('pin') && Boolean(onTogglePin) && !card.canvasPosition

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={mode === 'edit' ? t('card.detail.title') : card.title || t('card.untitled')}
      >
        <div className="cd" ref={dialogRef}>
          {mode === 'view' ? (
            <>
              <div className="cd__meta">
                <Tag color="red">{t(typeKeyOf(card.type))}</Tag>
                {card.tags.map((tag) => (
                  <span key={tag.value} className="cd__tag-chip" style={{ background: tag.color }}>
                    {tag.value}
                  </span>
                ))}
                <span className="cd__time">
                  {card.capturedAt.toISOString().slice(0, 19).replace('T', ' ')}
                </span>
              </div>
              <MarkdownBody source={card.body} />
              {card.media.length > 0 && (
                <Section label={t('card.detail.media')}>
                  <ul className="cd__media-list">
                    {card.media.map((m, i) => {
                      const asset = mediaStore.getAsset(m.assetId)
                      if (!asset) return null
                      if (asset.kind === 'image') {
                        // Only render data URLs that pass the image allowlist
                        // (no SVG/script vectors, size-bounded). Imported
                        // assets are untrusted; a non-image or oversized data
                        // URL renders a fallback label instead of an <img>.
                        return isSafeImageDataUrl(asset.dataUrl) ? (
                          <li
                            key={String(m.assetId)}
                            className="cd__media-item"
                          >
                            <img
                              src={asset.dataUrl}
                              alt={asset.id}
                              className="cd__media-img"
                            />
                          </li>
                        ) : (
                          <li
                            key={String(m.assetId)}
                            className="cd__media-item"
                          >
                            <a
                              href={safeHref(asset.dataUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {asset.mimeType} ({(asset.byteSize / 1024).toFixed(1)} KB)
                            </a>
                          </li>
                        )
                      }
                      return (
                        <li
                          key={String(m.assetId)}
                          className="cd__media-item"
                        >
                          <a
                            href={asset.dataUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {asset.mimeType} ({(asset.byteSize / 1024).toFixed(1)} KB)
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                </Section>
              )}
              {card.links.length > 0 && (
                <Section label={t('card.detail.links')}>
                  <ul className="cd__links">
                    {card.links.map((l, i) => (
                      <li key={i}>
                        <a
                          href={safeHref(l.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {l.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {card.codeSnippets.length > 0 && (
                <Section label={t('card.detail.code')}>
                  {card.codeSnippets.map((c, i) => (
                    <div key={i} className="cd__code">
                      <div className="cd__code-lang">{c.language}</div>
                      <pre className="cd__code-pre">
                        <code>{c.code}</code>
                      </pre>
                    </div>
                  ))}
                </Section>
              )}
              {card.quotes.length > 0 && (
                <Section label={t('card.detail.quotes')}>
                  {card.quotes.map((q, i) => (
                    <blockquote key={i} className="cd__quote">
                      <p>{q.text}</p>
                      {q.attribution && (
                        <cite className="cd__cite">— {q.attribution}</cite>
                      )}
                    </blockquote>
                  ))}
                </Section>
              )}
            </>
          ) : (
            <>
              <Input
                name="edit-title"
                label={t('card.detail.fieldTitle')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
              <label className="cd__field">
                <span className="cd__label">{t('card.detail.bodyLabel')}</span>
                <textarea
                  className="cd__textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                />
              </label>
              <div className="cd__field">
                <span className="cd__label">{t('card.detail.mediaFiles')}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    void handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                  className="cd__file"
                />
                {media.length > 0 && (
                  <ul className="cd__media-list cd__media-list--edit">
                    {media.map((m) => {
                      const asset = mediaStore.getAsset(m.assetId)
                      if (!asset) return null
                      return (
                        <li
                          key={String(m.assetId)}
                          className="cd__media-item cd__media-item--edit"
                        >
                          {asset.kind === 'image' && (
                            <img
                              src={asset.dataUrl}
                              alt={asset.id}
                              className="cd__media-img cd__media-img--thumb"
                            />
                          )}
                          <button
                            type="button"
                            className="le__remove"
                            onClick={() => {
                              mediaStore.remove(m.assetId)
                              setMedia((prev) =>
                                prev.filter((x) => x.assetId !== m.assetId),
                              )
                            }}
                            aria-label={t('card.detail.removeMediaAria')}
                          >
                            ×
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <ListEditor
                items={links}
                onChange={setLinks}
                make={() => ({ url: '' })}
                label={t('card.detail.linkLabel')}
                placeholder="https://…"
                fieldKey="url"
              />
              <CodeEditor items={codes} onChange={setCodes} />
              <QuoteEditor items={quotes} onChange={setQuotes} />
              <div className="cd__field">
                <span className="cd__label">{t('tag.add')}</span>
                <div className="cd__tags">
                  {tags.map((tag) => (
                    <span
                      key={tag.value}
                      className="cd__tag-chip"
                      style={{ background: tag.color }}
                      title={t('tag.remove')}
                      onClick={() =>
                        setTags((prev) => prev.filter((x) => x.value !== tag.value))
                      }
                    >
                      {tag.value} ×
                    </span>
                  ))}
                  <input
                    className="cd__tag-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault()
                        const val = tagInput.trim()
                        if (!tags.some((tag) => tag.value === val)) {
                          const color =
                            TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!
                          setTags((prev) => [...prev, { value: val, color }])
                        }
                        setTagInput('')
                      }
                    }}
                    placeholder={t('tag.placeholder')}
                  />
                </div>
              </div>
            </>
          )}

          <div className="cd__actions">
            {mode === 'view' ? (
              <>
                <Button onClick={() => setMode('edit')}>{t('card.detail.edit')}</Button>
                {showPin && (
                  <Button variant="secondary" onClick={onTogglePin}>
                    {card.pinned ? t('card.detail.unpin') : t('card.detail.pin')}
                  </Button>
                )}
                {showArchive && (
                  <Button variant="secondary" onClick={onArchive}>
                    {t('card.detail.archive')}
                  </Button>
                )}
                {showUnarchive && (
                  <Button variant="secondary" onClick={onUnarchive}>
                    {t('card.detail.unarchive')}
                  </Button>
                )}
                {card.canvasPosition && has('sendToCanvas') ? (
                  <Button variant="secondary" disabled>
                    <Tag color="blue">{t('card.detail.onCanvas')}</Tag>
                  </Button>
                ) : showSendToCanvas ? (
                  <Button variant="primary" onClick={onSendToCanvas}>
                    {t('card.detail.sendToCanvas')}
                  </Button>
                ) : null}
                <span className="cd__spacer" />
                {aiEnabled && has('summarize') && (
                  <Button
                    variant="secondary"
                    onClick={() => setAiAction('summarize')}
                  >
                    ✨ {t('card.summarize')}
                  </Button>
                )}
                {aiEnabled && has('rewrite') && (
                  <Button
                    variant="secondary"
                    onClick={() => setAiAction('rewrite')}
                  >
                    ✨ {t('card.rewrite')}
                  </Button>
                )}
                {aiEnabled && has('translate') && (
                  <span className="cd__translate">
                    <select
                      className="cd__translate-select"
                      value={translateTo}
                      onChange={(e) =>
                        setTranslateTo(e.target.value as 'zh' | 'en')
                      }
                      disabled={aiAction === 'translate'}
                      aria-label={t('card.translate')}
                    >
                      <option value="en">{t('card.detail.translateToEn')}</option>
                      <option value="zh">{t('card.detail.translateToZh')}</option>
                    </select>
                    <Button
                      variant="secondary"
                      onClick={() => setAiAction('translate')}
                    >
                      ✨ {t('card.translate')}
                    </Button>
                  </span>
                )}
                {has('export') && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      try {
                        const size = downloadCardMarkdown(card)
                        pushToast({
                          kind: 'success',
                          message: t('card.exportSuccess', { n: size }),
                        })
                      } catch (e) {
                        pushToast({
                          kind: 'error',
                          message: t('card.exportFailed', {
                            error: (e as Error).message,
                          }),
                        })
                      }
                    }}
                  >
                    {t('card.export')}
                  </Button>
                )}
                {has('softDelete') && (
                  <Button
                    variant="danger"
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t('card.detail.delete')}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setMode('view')}>
                  {t('card.detail.cancel')}
                </Button>
                <Button variant="primary" onClick={handleSave} disabled={pending || !title.trim()}>
                  {pending ? t('card.detail.saving') : t('card.detail.save')}
                </Button>
              </>
            )}
          </div>

          {aiAction && (
            <AIPopover
              card={card}
              action={aiAction === 'rewrite' ? 'improveWriting' : aiAction}
              targetLang={aiAction === 'translate' ? translateTo : undefined}
              onClose={() => setAiAction(null)}
              onReplace={(body) => {
                onSave({
                  title: card.title,
                  body,
                  media: card.media,
                  links: card.links,
                  codeSnippets: card.codeSnippets,
                  quotes: card.quotes,
                  tags: card.tags,
                })
                setAiAction(null)
              }}
              onAppendNew={(c) => {
                if (onAIAppendNew) {
                  onAIAppendNew(c)
                  pushToast({ kind: 'success', message: t('ai.appendedAsNew') })
                }
                setAiAction(null)
              }}
            />
          )}
        </div>
        <style>{editorStyles}</style>
        <style>{styles}</style>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('card.detail.deleteConfirmTitle')}
      >
        <p className="cd__confirm">
          {t('card.detail.deleteConfirmBody')}
        </p>
        <div className="cd__confirm-actions">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            {t('card.detail.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmDelete(false)
              onConfirmDelete()
            }}
          >
            {t('card.detail.delete')}
          </Button>
        </div>
      </Modal>
    </>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="cd__sec">
      <h3 className="cd__sec-h">{label}</h3>
      <div className="cd__sec-body">{children}</div>
    </section>
  )
}

const styles = `
.cd { display: flex; flex-direction: column; gap: var(--space-3); }
/* v0.22.0-ux-bugfix parity with canvas modal: tighten the gap between
   modal title and first body field. The .cd flex container's gap of
   space-3 (24px) plus the Modal component's body padding makes the
   first child feel detached; pulling it up by space-2 (16px) hugs
   the title. */
.cd > :first-child { margin-top: calc(-1 * var(--space-2)); }
.cd__meta { display: flex; align-items: center; gap: var(--space-2); }
.cd__time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.cd__field { display: flex; flex-direction: column; gap: var(--space-1); }
.cd__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.cd__textarea {
  appearance: none; background: transparent; border: 0; border-bottom: var(--border-hairline);
  padding: var(--space-1) 0; font-family: var(--font-body); font-size: var(--font-size-base);
  color: var(--color-black); outline: none; resize: vertical; min-height: 120px; line-height: 1.5;
}
.cd__textarea:focus { border-bottom-color: var(--color-red); }
.cd__file { font-family: var(--font-mono); font-size: var(--font-size-sm); margin-top: var(--space-1); }
.cd__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
.cd__spacer { flex: 1; }
.cd__translate { display: inline-flex; gap: var(--space-1); align-items: center; }
.cd__translate-select {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: var(--space-1) var(--space-2);
  background: var(--color-white);
  color: var(--color-black);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.cd__translate-select:disabled { opacity: 0.5; cursor: not-allowed; }
.cd__sec { display: flex; flex-direction: column; gap: var(--space-2); }
.cd__sec-h { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
.cd__sec-body { display: flex; flex-direction: column; gap: var(--space-2); }

.cd__media-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.cd__media-item { display: inline-flex; }
.cd__media-img { max-width: 100%; border: var(--border-hairline); display: block; }
.cd__media-list--edit { margin-top: var(--space-2); }
.cd__media-item--edit { position: relative; }
.cd__media-img--thumb { width: 96px; height: 96px; object-fit: cover; }
.cd__media-item--edit .le__remove { position: absolute; top: 0; right: 0; background: var(--color-white); }

.cd__links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.cd__links a { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
.cd__links a:hover { color: var(--color-black); }

.cd__code { border: var(--border-hairline); }
.cd__code-lang { background: var(--color-gray-soft); padding: 2px var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-black-soft); border-bottom: var(--border-hairline); }
.cd__code-pre { margin: 0; padding: var(--space-2); background: var(--color-black); color: var(--color-white); font-family: var(--font-mono); font-size: var(--font-size-sm); overflow-x: auto; line-height: 1.5; }

.cd__quote { margin: 0; padding: var(--space-2) var(--space-3); border-left: 4px solid var(--color-red); background: var(--color-red-soft); }
.cd__quote p { margin: 0 0 var(--space-1); }
.cd__cite { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); font-style: normal; }

.cd__confirm { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.cd__confirm-link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
.cd__confirm-actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }

.cd__tags { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }
.cd__tag-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px var(--space-1); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-black); border: 2px solid var(--color-black);
  cursor: pointer; user-select: none; line-height: 1.3;
}
.cd__tag-chip:hover { opacity: 0.8; }
.cd__tag-input {
  appearance: none; border: var(--border-hairline); background: transparent;
  padding: 2px var(--space-1); font-family: var(--font-mono);
  font-size: var(--font-size-xs); color: var(--color-black);
  min-width: 120px; line-height: 1.3;
}
.cd__tag-input:focus { outline: none; border-color: var(--color-red); }
`