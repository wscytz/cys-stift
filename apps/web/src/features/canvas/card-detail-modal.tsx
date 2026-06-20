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
import type { Card } from '@cys-stift/domain'
import { MarkdownBody } from '@/app/inbox/markdown'

interface Props {
  card: Card
  onClose: () => void
  onSave: (patch: { title: string; body: string }) => void
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
  /**
   * Move the card off the canvas and back to the inbox. Only available
   * when the card currently has a `canvasPosition` (otherwise there's
   * nothing to send back from). UX #2 closure (review §🟠).
   */
  onSendToInbox?: () => void
}

export function CardDetailModal({
  card,
  onClose,
  onSave,
  onArchive,
  onUnarchive,
  onDelete,
  onSendToInbox,
}: Props) {
  // A card opened with no title (freshly created via double-click) opens in edit.
  const [mode, setMode] = useState<'view' | 'edit'>(card.title ? 'view' : 'edit')
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTitle(card.title)
    setBody(card.body)
  }, [card.id, card.title, card.body])

  useEffect(() => {
    if (mode === 'edit') {
      const el = bodyRef.current?.querySelector<HTMLInputElement>('input[name="cd-title"]')
      el?.focus()
      el?.select()
    }
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    if (!title.trim()) return
    startTransition(() => {
      onSave({ title: title.trim(), body })
      setMode('view')
    })
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={mode === 'edit' ? 'Edit card' : card.title || '(untitled)'}
      >
        <div className="cd" ref={bodyRef}>
          {mode === 'view' ? (
            <>
              <div className="cd__meta">
                <Tag color="black">{card.type}</Tag>
                <span className="cd__time">
                  {card.capturedAt.toISOString().slice(0, 19).replace('T', ' ')}
                </span>
              </div>
              <MarkdownBody source={card.body} />
              {card.links.length > 0 && (
                <section className="cd__sec">
                  <h3 className="cd__sec-h">Links</h3>
                  <ul className="cd__links">
                    {card.links.map((l, i) => (
                      <li key={i}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer">
                          {l.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {card.codeSnippets.length > 0 && (
                <section className="cd__sec">
                  <h3 className="cd__sec-h">Code</h3>
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
                  <h3 className="cd__sec-h">Quotes</h3>
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
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
              <label className="cd__field">
                <span className="cd__label">Body (Markdown)</span>
                <textarea
                  className="cd__textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                />
              </label>
              <p className="cd__hint">
                Editing links / code / quotes is intentionally not exposed here
                (Phase 4 MVP). The detail view shows the persisted media.
              </p>
            </>
          )}

          <div className="cd__actions">
            {mode === 'view' ? (
              <>
                <Button onClick={() => setMode('edit')}>Edit</Button>
                {card.archived ? (
                  <Button variant="secondary" onClick={onUnarchive}>
                    Unarchive
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={onArchive}>
                    Archive
                  </Button>
                )}
                {card.canvasPosition && onSendToInbox && (
                  <Button variant="secondary" onClick={onSendToInbox}>
                    Send back to inbox
                  </Button>
                )}
                <span className="cd__spacer" />
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  Soft-delete
                </Button>
              </>
            ) : (
              <>
                <Button onClick={save} disabled={pending || !title.trim()}>
                  {pending ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="ghost" onClick={() => setMode('view')}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Soft-delete this card?"
      >
        <p className="cd__confirm">
          The card will be hidden from the canvas and marked as deleted. The
          record is kept in storage so you can recover it later from the database.
        </p>
        <div className="cd__actions cd__actions--end">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onDelete}>
            Soft-delete
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
.cd__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
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
.cd__sec-h { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
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
`
