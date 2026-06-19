'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import Link from 'next/link'
import { Button, Card as UICard, Input, Modal, Tag, Toolbar } from '@cys-stift/ui'
import type {
  Card,
  CardId,
  CodeBlock,
  LinkPreview,
  Quote,
} from '@cys-stift/domain'
import { CreateCardForm } from './create-card-form'
import { MarkdownBody } from './markdown'
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
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'

type View = 'inbox' | 'archived'

interface DetailState {
  card: Card
  mode: 'view' | 'edit'
}

const DEVICE_ID = 'web'

export default function InboxPage() {
  const { snap, service, ready } = useDb()
  void snap // subscribe to the snapshot so the component re-renders on changes
  const [view, setView] = useState<View>('inbox')
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CardId | null>(null)

  // Inbox = no canvasPosition, not archived, not soft-deleted
  const inbox = service.listInbox()
  const archived = service
    .listAll()
    .filter((c) => c.archived && !c.deletedAt)
  const visible = view === 'inbox' ? inbox : archived

  return (
    <main className="page">
      <Toolbar region="inbox">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">inbox</span>
        <span className="crumb-spacer" />
        <button
          type="button"
          className={`tab ${view === 'inbox' ? 'tab--active' : ''}`}
          onClick={() => setView('inbox')}
        >
          active
        </button>
        <button
          type="button"
          className={`tab ${view === 'archived' ? 'tab--active' : ''}`}
          onClick={() => setView('archived')}
        >
          archived
        </button>
        <Tag color={view === 'inbox' ? 'red' : 'blue'}>
          {view === 'inbox' ? inbox.length : archived.length}
        </Tag>
      </Toolbar>

      <div className="content">
        {view === 'inbox' && (
          <CreateCardForm
            onCreate={(input) => {
              service.create({
                title: input.title,
                body: input.body,
                source: { kind: 'manual', deviceId: DEVICE_ID },
                links: input.links,
                codeSnippets: input.codeSnippets,
                quotes: input.quotes,
              })
            }}
          />
        )}

        {visible.length === 0 ? (
          <EmptyState view={view} />
        ) : (
          <ul className="grid">
            {visible.map((card) => (
              <li key={card.id}>
                <CardTile card={card} onOpen={() => setDetail({ card, mode: 'view' })} />
              </li>
            ))}
          </ul>
        )}

        {view === 'inbox' && (
          <p className="footnote">
            <Link href="/" className="footnote__link">← home</Link>
            {' · '}
            <Link href="/dev/db" className="footnote__link">dev/db</Link>
          </p>
        )}
      </div>

      {detail && (
        <CardDetail
          state={detail}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.card.id, patch)
            if (updated) setDetail({ card: updated, mode: 'view' })
          }}
          onSwitchMode={(mode) => setDetail({ ...detail, mode })}
          onArchive={() => {
            service.archive(detail.card.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(detail.card.id)
            setDetail(null)
          }}
          onSendToCanvas={() => {
            const existing = service.listOnCanvas(DEFAULT_CANVAS_ID)
            const nextZ = existing.length === 0
              ? 0
              : Math.max(...existing.map((c) => c.canvasPosition?.z ?? 0)) + 1
            service.moveToCanvas(detail.card.id, {
              canvasId: DEFAULT_CANVAS_ID,
              x: 100 + (nextZ % 5) * 40,
              y: 100 + (nextZ % 5) * 40,
              w: 200,
              h: 80,
              z: nextZ,
            })
            const updated = service.get(detail.card.id)
            if (updated) setDetail({ card: updated, mode: 'view' })
          }}
          onRequestDelete={() => setConfirmDelete(detail.card.id)}
        />
      )}

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Soft-delete this card?"
      >
        <p className="confirm__body">
          The card will be hidden and marked as deleted. The record is kept in
          storage so you can recover it later from the database.
        </p>
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirmDelete) service.softDelete(confirmDelete)
              setConfirmDelete(null)
              setDetail(null)
            }}
          >
            Soft-delete
          </Button>
        </div>
      </Modal>

      <style>{styles}</style>
    </main>
  )
}

// ── Hook (kept local to avoid coupling) ────────────────────────────────────
import { useDb } from '@/lib/db-client'

// ── Subcomponents ──────────────────────────────────────────────────────────

function CardTile({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const preview = card.body.slice(0, 120)
  const totalMedia =
    card.links.length + card.codeSnippets.length + card.quotes.length
  return (
    <button type="button" className="tile" onClick={onOpen}>
      <div className="tile__bar" aria-hidden="true" />
      <div className="tile__body">
        <h3 className="tile__title">{card.title || '(untitled)'}</h3>
        {preview && <p className="tile__preview">{preview}</p>}
        <div className="tile__meta">
          <Tag color="red">{card.type}</Tag>
          {totalMedia > 0 && <Tag color="blue">{totalMedia} media</Tag>}
          <span className="tile__time">
            {card.capturedAt.toISOString().slice(0, 10)}
          </span>
        </div>
      </div>
    </button>
  )
}

function EmptyState({ view }: { view: View }) {
  return (
    <UICard>
      <div className="empty">
        <div className="empty__bar" aria-hidden="true" />
        <p className="empty__eyebrow">inbox</p>
        <h2 className="empty__h">
          {view === 'inbox' ? 'No cards yet.' : 'No archived cards.'}
        </h2>
        <p className="empty__lede">
          {view === 'inbox'
            ? 'Create the first card above. Add links, code blocks, and quotes — they all stay attached to the same note.'
            : 'Archived cards show up here. Unarchive to bring them back to the inbox.'}
        </p>
      </div>
    </UICard>
  )
}

interface CardDetailProps {
  state: DetailState
  onClose: () => void
  onSave: (patch: {
    title: string
    body: string
    links: LinkPreview[]
    codeSnippets: CodeBlock[]
    quotes: Quote[]
  }) => void
  onSwitchMode: (mode: 'view' | 'edit') => void
  onArchive: () => void
  onUnarchive: () => void
  onSendToCanvas: () => void
  onRequestDelete: () => void
}

function CardDetail({
  state,
  onClose,
  onSave,
  onSwitchMode,
  onArchive,
  onUnarchive,
  onSendToCanvas,
  onRequestDelete,
}: CardDetailProps) {
  const { card, mode } = state
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [links, setLinks] = useState<DraftLink[]>(() =>
    card.links.map((l) => ({ url: l.url })),
  )
  const [codes, setCodes] = useState<DraftCode[]>(() =>
    card.codeSnippets.map((c) => ({ language: c.language, code: c.code })),
  )
  const [quotes, setQuotes] = useState<DraftQuote[]>(() =>
    card.quotes.map((q) => ({ text: q.text, attribution: q.attribution ?? '' })),
  )
  const [pending, startTransition] = useTransition()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTitle(card.title)
    setBody(card.body)
    setLinks(card.links.map((l) => ({ url: l.url })))
    setCodes(card.codeSnippets.map((c) => ({ language: c.language, code: c.code })))
    setQuotes(card.quotes.map((q) => ({ text: q.text, attribution: q.attribution ?? '' })))
  }, [card.id, card.title, card.body, card.links, card.codeSnippets, card.quotes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        links: draftLinksToPayload(links),
        codeSnippets: draftCodesToPayload(codes),
        quotes: draftQuotesToPayload(quotes),
      })
    })
  }

  return (
    <Modal open onClose={onClose} title={mode === 'edit' ? 'Edit card' : card.title || '(untitled)'}>
      <div className="detail" ref={dialogRef}>
        {mode === 'view' ? (
          <>
            <div className="detail__meta">
              <Tag color="red">{card.type}</Tag>
              <span className="detail__time">
                {card.capturedAt.toISOString().slice(0, 19).replace('T', ' ')}
              </span>
            </div>
            <MarkdownBody source={card.body} />
            {card.links.length > 0 && (
              <DetailSection label="Links">
                <ul className="link-list">
                  {card.links.map((l, i) => (
                    <li key={i}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {l.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            )}
            {card.codeSnippets.length > 0 && (
              <DetailSection label="Code">
                {card.codeSnippets.map((c, i) => (
                  <div key={i} className="code-block">
                    <div className="code-block__lang">{c.language}</div>
                    <pre className="code-block__pre">
                      <code>{c.code}</code>
                    </pre>
                  </div>
                ))}
              </DetailSection>
            )}
            {card.quotes.length > 0 && (
              <DetailSection label="Quotes">
                {card.quotes.map((q, i) => (
                  <blockquote key={i} className="detail__quote">
                    <p>{q.text}</p>
                    {q.attribution && (
                      <cite className="detail__cite">— {q.attribution}</cite>
                    )}
                  </blockquote>
                ))}
              </DetailSection>
            )}
          </>
        ) : (
          <>
            <Input
              name="edit-title"
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            <label className="detail__field">
              <span className="detail__label">Body (Markdown)</span>
              <textarea
                className="detail__textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
              />
            </label>
            <ListEditor
              items={links}
              onChange={setLinks}
              make={() => ({ url: '' })}
              label="Link"
              placeholder="https://…"
              fieldKey="url"
            />
            <CodeEditor items={codes} onChange={setCodes} />
            <QuoteEditor items={quotes} onChange={setQuotes} />
          </>
        )}

        <div className="detail__actions">
          {mode === 'view' ? (
            <>
              <Button onClick={() => onSwitchMode('edit')}>Edit</Button>
              {card.archived ? (
                <Button variant="secondary" onClick={onUnarchive}>
                  Unarchive
                </Button>
              ) : (
                <Button variant="secondary" onClick={onArchive}>
                  Archive
                </Button>
              )}
              {card.canvasPosition ? (
                <Button variant="secondary" disabled>
                  <Tag color="blue">on canvas</Tag>
                </Button>
              ) : (
                <Button variant="primary" onClick={onSendToCanvas}>
                  Send to canvas
                </Button>
              )}
              <span className="detail__spacer" />
              <Button variant="danger" onClick={onRequestDelete}>
                Soft-delete
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleSave} disabled={pending || !title.trim()}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="ghost" onClick={() => onSwitchMode('view')}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
      <style>{editorStyles}</style>
    </Modal>
  )
}

function DetailSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="dsec">
      <h3 className="dsec__h">{label}</h3>
      <div className="dsec__body">{children}</div>
    </section>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.crumb {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-gray);
}
.crumb--here { color: var(--color-black); }
.crumb-sep { color: var(--color-gray); }
.crumb-spacer { flex: 1; }
.tab {
  height: 32px;
  padding: 0 var(--space-2);
  background: transparent;
  border: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-gray);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tab--active { color: var(--color-black); border-bottom-color: var(--color-red); }

.content { max-width: 1120px; margin: 0 auto; padding: var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
}

.tile {
  position: relative;
  display: flex;
  text-align: left;
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  cursor: pointer;
  overflow: hidden;
  min-height: 160px;
  transition: transform 80ms ease-out, box-shadow 80ms ease-out;
  box-shadow: var(--shadow-sm);
  font-family: var(--font-body);
  color: var(--color-black);
  padding: 0;
}
.tile:hover { box-shadow: var(--shadow-md); }
.tile:active { transform: translate(2px, 2px); box-shadow: none; }
.tile__bar { width: 8px; flex-shrink: 0; background: var(--color-red); }
.tile__body { flex: 1; padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.tile__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.tile__preview { margin: 0; color: var(--color-black-soft); font-size: var(--font-size-sm); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.tile__meta { display: flex; gap: var(--space-1); align-items: center; margin-top: auto; flex-wrap: wrap; }
.tile__time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); margin-left: auto; }

.empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-3) 0; }
.empty__bar { width: 64px; height: 8px; background: var(--color-red); }
.empty__eyebrow { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
.empty__h { margin: 0; font-family: var(--font-display); font-size: var(--font-size-2xl); font-weight: 500; letter-spacing: -0.01em; }
.empty__lede { margin: 0; color: var(--color-black-soft); font-size: var(--font-size-base); line-height: 1.6; max-width: 60ch; }

.footnote { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); margin: 0; padding-top: var(--space-2); border-top: var(--border-hairline); }
.footnote__link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }

.detail { display: flex; flex-direction: column; gap: var(--space-3); }
.detail__meta { display: flex; align-items: center; gap: var(--space-2); }
.detail__time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.detail__field { display: flex; flex-direction: column; gap: var(--space-1); }
.detail__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.detail__textarea {
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
  min-height: 120px;
  line-height: 1.5;
}
.detail__textarea:focus { border-bottom-color: var(--color-red); }
.detail__hint { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.detail__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
.detail__spacer { flex: 1; }
.detail__quote { margin: 0; padding: var(--space-2) var(--space-3); border-left: 4px solid var(--color-red); background: var(--color-red-soft); }
.detail__quote p { margin: 0 0 var(--space-1); }
.detail__cite { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); font-style: normal; }

.dsec { display: flex; flex-direction: column; gap: var(--space-2); }
.dsec__h { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
.dsec__body { display: flex; flex-direction: column; gap: var(--space-2); }

.link-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.link-list a { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
.link-list a:hover { color: var(--color-black); }

.code-block { border: var(--border-hairline); }
.code-block__lang {
  background: var(--color-gray-soft);
  padding: 2px var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-black-soft);
  border-bottom: var(--border-hairline);
}
.code-block__pre {
  margin: 0;
  padding: var(--space-2);
  background: var(--color-black);
  color: var(--color-white);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  overflow-x: auto;
  line-height: 1.5;
}

.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
`
