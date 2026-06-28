'use client'

/**
 * CardDetailModal — the canvas's card detail/edit surface.
 *
 * Reuses the inbox MarkdownBody (and Phase 3's contract: edit title/body,
 * archive/unarchive, soft-delete with confirm) so cards behave the same on the
 * canvas as in the inbox. Kept self-contained here (own styles) rather than
 * extracted from inbox/page.tsx to avoid touching tagged Phase 3 code; the
 * duplication is noted as a Phase 3.5/5 cleanup candidate.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import { Button, Input, Modal, Tag } from '@cys-stift/ui'
import type { Card, TagRef } from '@cys-stift/domain'
import { TAG_COLORS } from '@cys-stift/domain'
import { MarkdownBody } from '@/app/inbox/markdown'
import { useI18n } from '@/lib/i18n'
import { safeHref } from '@/lib/safe-href'
import { typeKeyOf } from '@/lib/type-label'
import { findBacklinks } from './backlinks'
import { resolveCardByTitle } from './embed-links'
import { useDb } from '@/lib/db-client'
import type { CanvasHost } from '@cys-stift/canvas-engine'

export function CardDetailModal({
  card,
  onClose,
  onSave,
  onArchive,
  onUnarchive,
  onDelete,
  onSendToInbox,
  host,
  getCardTitle,
  onJumpToCard,
}: {
  card: Card
  onClose: () => void
  onSave: (patch: { title: string; body: string; tags: TagRef[] }) => void
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
  onSendToInbox?: () => void
  /** 画布 host:有则查 backlinks(相关的卡)。画布外打开为 null → 不显示 backlink 段。 */
  host?: CanvasHost | null
  /** 查对方卡 title(从 CardService)。host 非空时必传。 */
  getCardTitle?: (id: string) => string | undefined
  /** 点 backlink 跳转到对方卡:选中 + 居中(由 page 接 host.setView + setSelectedIds)。 */
  onJumpToCard?: (cardId: string) => void
}) {
  const { t } = useI18n()
  // BR-T5 — 块引用嵌入:((标题)) → 目标卡 body/title。useDb 拿 service 解析,
  // 这样画布版正文也支持嵌入(与共享版口径一致)。
  const { service } = useDb()
  const resolveEmbed = (title: string): { body: string; title: string } | null => {
    const id = resolveCardByTitle(service.listAll(), title)
    if (!id) return null
    const c = service.get(id)
    if (!c) return null
    return { body: c.body, title: c.title }
  }
  // A card opened with no title (freshly created via double-click) opens in edit.
  const [mode, setMode] = useState<'view' | 'edit'>(card.title ? 'view' : 'edit')
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [tags, setTags] = useState<TagRef[]>(card.tags)
  const [tagInput, setTagInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTitle(card.title)
    setBody(card.body)
    setTags(card.tags)
    setTagInput('')
  }, [card.id, card.title, card.body, card.tags])

  useEffect(() => {
    if (mode === 'edit') {
      const el = bodyRef.current?.querySelector<HTMLInputElement>('input[name="cd-title"]')
      el?.focus()
      el?.select()
    }
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Stacked-modal guard: if a confirm-delete sub-modal is open, leave
      // Escape to that inner overlay (it has its own handler/backdrop) and
      // don't clobber the whole CardDetailModal on a single keypress.
      if (confirmDelete) return
      // defaultPrevented guard: another dialog already consumed this Escape.
      if (e.defaultPrevented) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirmDelete])

  const save = () => {
    if (!title.trim()) return
    startTransition(() => {
      onSave({ title: title.trim(), body, tags })
      setMode('view')
    })
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={mode === 'edit' ? t('card.detail.title') : card.title || t('card.untitled')}
      >
        <div className="cd" ref={bodyRef}>
          {mode === 'view' ? (
            <>
              <div className="cd__meta">
                <Tag color="black">{t(typeKeyOf(card.type))}</Tag>
                {card.tags.map((tag) => (
                  <span key={tag.value} className="cd__tag-chip" style={{ background: tag.color }}>
                    {tag.value}
                  </span>
                ))}
                <span className="cd__time">
                  {card.capturedAt.toISOString().slice(0, 19).replace('T', ' ')}
                </span>
              </div>
              <MarkdownBody source={card.body} resolveEmbed={resolveEmbed} />
              {card.links.length > 0 && (
                <section className="cd__sec">
                  <h3 className="eyebrow">{t('card.detail.links')}</h3>
                  <ul className="cd__links">
                    {card.links.map((l, i) => (
                      <li key={i}>
                        <a href={safeHref(l.url)} target="_blank" rel="noopener noreferrer">
                          {l.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {host && getCardTitle && (() => {
                const bl = findBacklinks(host, card.id)
                const total = bl.incoming.length + bl.outgoing.length
                if (total === 0) return null
                const renderRow = (b: { otherCardId: string; relation: { labelKey: import('@/lib/i18n/messages').MessageKey } | null; arrowId: string }, dir: 'in' | 'out') => {
                  const title = getCardTitle(b.otherCardId) ?? t('card.detail.untitledCard')
                  const relLabel = b.relation ? t(b.relation.labelKey) : t('card.detail.relatedUntyped')
                  return (
                    <li key={b.arrowId} className="cd__backlink">
                      <button
                        type="button"
                        className="cd__backlink-btn"
                        onClick={() => onJumpToCard?.(b.otherCardId)}
                        title={t(dir === 'in' ? 'card.detail.backlinkJumpIn' : 'card.detail.backlinkJumpOut')}
                      >
                        <span className="cd__backlink-dir" aria-hidden="true">{dir === 'in' ? '←' : '→'}</span>
                        <span className="cd__backlink-title">{title}</span>
                        <span className="cd__backlink-rel">{relLabel}</span>
                      </button>
                    </li>
                  )
                }
                return (
                  <section className="cd__sec">
                    <h3 className="eyebrow">{t('card.detail.backlinks')}</h3>
                    <ul className="cd__backlinks">
                      {bl.incoming.map((b) => renderRow(b, 'in'))}
                      {bl.outgoing.map((b) => renderRow(b, 'out'))}
                    </ul>
                  </section>
                )
              })()}
              {card.codeSnippets.length > 0 && (
                <section className="cd__sec">
                  <h3 className="eyebrow">{t('card.detail.code')}</h3>
                  {card.codeSnippets.map((c, i) => (
                    <div key={i} className="cd__code">
                      <div className="cd__code-lang">{c.language}</div>
                      <pre className="cd__code-pre">
                        <code>{c.code}</code>
                      </pre>
                    </div>
                  ))}
                </section>
              )}
              {card.quotes.length > 0 && (
                <section className="cd__sec">
                  <h3 className="eyebrow">{t('card.detail.quotes')}</h3>
                  {card.quotes.map((q, i) => (
                    <blockquote key={i} className="cd__quote">
                      <p>{q.text}</p>
                      {q.attribution && <cite className="cd__cite">— {q.attribution}</cite>}
                    </blockquote>
                  ))}
                </section>
              )}
            </>
          ) : (
            <>
              <Input
                name="cd-title"
                label={t('card.detail.fieldTitle')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
              <label className="cd__field">
                <span className="mono-label">{t('card.detail.bodyLabel')}</span>
                <textarea
                  className="cd__textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                />
              </label>
              <div className="cd__field">
                <span className="cd__label">{t('tag.add')}</span>
                <div className="cd__tags">
                  {tags.map((tag) => (
                    <button
                      key={tag.value}
                      type="button"
                      className="cd__tag-chip"
                      style={{ background: tag.color }}
                      aria-label={t('tag.remove') + ': ' + tag.value}
                      onClick={() =>
                        setTags((prev) => prev.filter((x) => x.value !== tag.value))
                      }
                    >
                      {tag.value} ×
                    </button>
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
              <p className="cd__hint">{t('card.detail.editHint')}</p>
            </>
          )}

          <div className="cd__actions">
            {mode === 'view' ? (
              <>
                <Button onClick={() => setMode('edit')}>{t('card.detail.edit')}</Button>
                {card.archived ? (
                  <Button variant="secondary" onClick={onUnarchive}>
                    {t('card.detail.unarchive')}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={onArchive}>
                    {t('card.detail.archive')}
                  </Button>
                )}
                {card.canvasPosition && onSendToInbox && (
                  <Button variant="secondary" onClick={onSendToInbox}>
                    {t('card.detail.sendBack')}
                  </Button>
                )}
                <span className="cd__spacer" />
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  {t('card.detail.delete')}
                </Button>
              </>
            ) : (
              <>
                <Button onClick={save} disabled={pending || !title.trim()}>
                  {pending ? t('card.detail.saving') : t('card.detail.save')}
                </Button>
                <Button variant="ghost" onClick={() => setMode('view')}>
                  {t('card.detail.cancel')}
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('card.detail.deleteConfirmTitle')}
      >
        <p className="cd__confirm">{t('card.detail.deleteConfirmBody')}</p>
        <div className="cd__actions cd__actions--end">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            {t('card.detail.cancel')}
          </Button>
          <Button variant="danger" onClick={onDelete}>
            {t('card.detail.deleteConfirmAction')}
          </Button>
        </div>
      </Modal>

      <style>{styles}</style>
    </>
  )
}

const styles = `
.cd { display: flex; flex-direction: column; gap: var(--space-3); }
/* v0.22.0-ux-bugfix: Modal body adds padding above the first child;
   tighten it so the first field hugs the modal title. */
.cd > :first-child { margin-top: calc(-1 * var(--space-2)); }
.cd__meta { display: flex; align-items: center; gap: var(--space-2); }
.cd__time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
/* v0.22.0-ux-bugfix: tighten the gap between the body label and
   its textarea — the inherited .cd gap of space-3 (12px) plus the
   Input component's own padding made the label feel disconnected
   from its control. 4px keeps them as a tight pair. */
.cd__field { display: flex; flex-direction: column; gap: var(--space-1); }
.cd__textarea {
  appearance: none; background: transparent; border: 0; border-bottom: var(--border-hairline);
  padding: var(--space-1) 0; font-family: var(--font-body); font-size: var(--font-size-base);
  color: var(--color-black); outline: none; resize: vertical; min-height: 120px; line-height: 1.5;
}
.cd__textarea:focus { border-bottom-color: var(--color-red); }
.cd__hint { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.cd__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
.cd__actions--end { justify-content: flex-end; margin-top: var(--space-2); }
.cd__spacer { flex: 1; }
.cd__sec { display: flex; flex-direction: column; gap: var(--space-2); }
.cd__links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.cd__links a { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
.cd__links a:hover { color: var(--color-black); }
.cd__backlinks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.cd__backlink-btn { display: flex; align-items: center; gap: var(--space-1); width: 100%; text-align: left; padding: 4px var(--space-1); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black); transition: background 80ms ease-out, border-color 80ms ease-out; }
.cd__backlink-btn:hover { background: var(--color-gray-soft); border-color: var(--color-gray-soft); }
.cd__backlink-btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.cd__backlink-dir { color: var(--color-gray); font-family: var(--font-mono); flex: 0 0 auto; }
.cd__backlink-title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd__backlink-rel { flex: 0 0 auto; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-gray); }
.cd__code { border: var(--border-hairline); }
.cd__code-lang { background: var(--color-gray-soft); padding: 2px var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-black-soft); border-bottom: var(--border-hairline); }
.cd__code-pre { margin: 0; padding: var(--space-2); background: var(--color-black); color: var(--color-white); font-family: var(--font-mono); font-size: var(--font-size-sm); overflow-x: auto; line-height: 1.5; }
.cd__quote { margin: 0; padding: var(--space-2) var(--space-3); border-left: 4px solid var(--color-red); background: var(--color-red-soft); }
.cd__quote p { margin: 0 0 var(--space-1); }
.cd__cite { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); font-style: normal; }
.cd__confirm { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.cd__tags { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }
.cd__tag-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px var(--space-1); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-black); border: 2px solid var(--color-black);
  cursor: pointer; user-select: none; line-height: 1.3;
}
/* Reset native <button> defaults so the removable tag chip renders
   identically to the old <span> (edit-mode chip is now a button for
   keyboard operability + remove announcement). Inline tag-color
   background wins over the UA button background; neutralize appearance,
   font, and text-align so only .cd__tag-chip rules apply. */
button.cd__tag-chip {
  appearance: none; -webkit-appearance: none;
  font: inherit; text-align: center;
  background: var(--color-gray-soft);
}
button.cd__tag-chip:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.cd__tag-chip:hover { opacity: 0.8; }
.cd__tag-input {
  appearance: none; border: var(--border-hairline); background: transparent;
  padding: 2px var(--space-1); font-family: var(--font-mono);
  font-size: var(--font-size-xs); color: var(--color-black);
  min-width: 120px; line-height: 1.3;
}
.cd__tag-input:focus { outline: none; border-color: var(--color-red); }
`
