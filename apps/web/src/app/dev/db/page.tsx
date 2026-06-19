'use client'

import { useState, useTransition } from 'react'
import { Button, Card as UICard, Input, Tag, Toolbar } from '@cys-stift/ui'
import { useDb, resetDb } from '@/lib/db-client'
import { toCardId } from '@cys-stift/domain'

export default function DevDbPage() {
  const { snap, service } = useDb()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  const inbox = service.listInbox()
  const all = service.listAll()
  const archived = all.filter((c) => c.archived && !c.deletedAt)
  const deleted = all.filter((c) => c.deletedAt)

  const onCreate = () => {
    if (!title.trim()) return
    startTransition(() => {
      service.create({
        title: title.trim(),
        body: body.trim() || undefined,
        source: { kind: 'manual', deviceId: 'web-dev' },
      })
      setTitle('')
      setBody('')
    })
  }

  return (
    <main className="page">
      <Toolbar region="system">
        <span className="crumb">cy&rsquo;s stift / dev / db</span>
        <span className="crumb-spacer" />
        <Tag color="red">smoke</Tag>
        <Tag color="blue">localstorage</Tag>
      </Toolbar>

      <div className="content">
        <header>
          <p className="eyebrow">dev · db smoke</p>
          <h1>Data layer round-trip</h1>
          <p className="lede">
            Create a card below, then <strong>reload the page</strong>. The card
            should still be here — that proves the data layer survives a
            refresh, which is the Phase 2 contract.
          </p>
        </header>

        <section className="counts">
          <Count label="inbox" value={inbox.length} color="red" />
          <Count label="archived" value={archived.length} color="blue" />
          <Count label="soft-deleted" value={deleted.length} color="gray" />
          <Count label="total" value={all.length} color="black" />
        </section>

        <UICard heading="Create a card">
          <div className="form">
            <Input
              label="Title"
              placeholder="灵感标题…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              label="Body (optional)"
              placeholder="随便写点什么…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="form__actions">
              <Button onClick={onCreate} disabled={pending || !title.trim()}>
                {pending ? 'Saving…' : 'Create'}
              </Button>
              <Button variant="ghost" onClick={resetDb}>
                Reset all
              </Button>
            </div>
          </div>
        </UICard>

        <UICard heading={`Inbox (${inbox.length})`}>
          {inbox.length === 0 ? (
            <p className="empty">No cards yet. Create one above.</p>
          ) : (
            <ul className="cards">
              {inbox.map((c) => (
                <li key={c.id} className="cards__item">
                  <div className="cards__head">
                    <strong>{c.title || '(untitled)'}</strong>
                    <code className="cards__id">{c.id.slice(0, 8)}</code>
                  </div>
                  {c.body && <p className="cards__body">{c.body}</p>}
                  <div className="cards__meta">
                    <span>{c.type}</span>
                    <span>·</span>
                    <span>{c.capturedAt.toISOString().slice(0, 19).replace('T', ' ')}</span>
                  </div>
                  <div className="cards__actions">
                    <Button
                      variant="ghost"
                      onClick={() => service.archive(c.id)}
                    >
                      Archive
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => service.softDelete(c.id)}
                    >
                      Soft-delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </UICard>

        {archived.length > 0 && (
          <UICard heading={`Archived (${archived.length})`}>
            <ul className="cards">
              {archived.map((c) => (
                <li key={c.id} className="cards__item cards__item--archived">
                  <strong>{c.title || '(untitled)'}</strong>
                  <Button
                    variant="ghost"
                    onClick={() => service.unarchive(c.id)}
                  >
                    Unarchive
                  </Button>
                </li>
              ))}
            </ul>
          </UICard>
        )}

        <p className="footnote">
          Persistence: <code>localStorage</code> (Phase 2 MVP). Final storage is
          wa-sqlite + OPFS on web / Tauri fs on desktop (Phase 2.5+).
        </p>
      </div>

      <style>{styles}</style>
    </main>
  )
}

function Count({ label, value, color }: { label: string; value: number; color: 'red' | 'blue' | 'gray' | 'black' }) {
  return (
    <div className="count">
      <div className="count__bar" style={{ background: `var(--color-${color})` }} />
      <div>
        <div className="count__value">{value}</div>
        <div className="count__label">{label}</div>
      </div>
    </div>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.crumb { font-family: var(--font-mono); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.12em; }
.crumb-spacer { flex: 1; }
.content { max-width: 880px; margin: 0 auto; padding: var(--space-6) var(--space-4); display: flex; flex-direction: column; gap: var(--space-5); }
.eyebrow { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); margin: 0; }
h1 { font-family: var(--font-display); font-size: var(--font-size-3xl); margin: var(--space-1) 0 var(--space-3); font-weight: 500; letter-spacing: -0.01em; }
.lede { color: var(--color-black-soft); font-size: var(--font-size-lg); margin: 0; line-height: 1.5; }
.counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); }
.count { display: flex; gap: var(--space-2); align-items: center; border: var(--border-hairline); padding: var(--space-2) var(--space-3); }
.count__bar { width: 8px; height: 48px; }
.count__value { font-family: var(--font-display); font-size: var(--font-size-3xl); line-height: 1; font-weight: 500; }
.count__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); margin-top: var(--space-1); }
.form { display: flex; flex-direction: column; gap: var(--space-3); }
.form__actions { display: flex; gap: var(--space-2); }
.empty { color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-sm); margin: 0; }
.cards { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.cards__item { border: var(--border-hairline); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); }
.cards__item--archived { opacity: 0.6; }
.cards__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-2); }
.cards__id { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.cards__body { margin: 0; color: var(--color-black-soft); }
.cards__meta { display: flex; gap: var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.cards__actions { display: flex; gap: var(--space-2); }
.footnote { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); border-top: var(--border-hairline); padding-top: var(--space-3); }
.footnote code { color: var(--color-black-soft); }
`
