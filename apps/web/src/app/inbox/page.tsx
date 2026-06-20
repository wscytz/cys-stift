'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button, Card as UICard, Tag, Toolbar } from '@cys-stift/ui'
import type { Card } from '@cys-stift/domain'
import { CreateCardForm } from './create-card-form'
import { CardDetailModal } from '@/features/card/card-detail'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { useCanvases } from '@/lib/canvas-store'
import { captureSinkRegistry } from '@/features/capture/capture-sink'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { typeKeyOf } from '@/lib/type-label'
import { getDeviceId } from '@/lib/device-id'

type View = 'inbox' | 'archived'

const DEVICE_ID = getDeviceId()

export default function InboxPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  void snap // subscribe to the snapshot so the component re-renders on changes
  const [view, setView] = useState<View>('inbox')
  // Phase archive-detail: detail state simplified — modal owns view/edit
  // toggle now (was DetailState { card, mode } + page-level confirm).
  const [detail, setDetail] = useState<Card | null>(null)
  // v0.15 follow-up: "Send to canvas" routes to the user's currently
  // active canvas (read from canvasStore), not the hardcoded default.
  const { snapshot: canvasesSnap } = useCanvases()

  // Register the manual sink so CreateCardForm onCreate goes through
  // captureSinkRegistry → consistent with shortcut + menubar paths.
  // Guard against the dynamic import resolving after unmount, which
  // would otherwise register a phantom sink nobody ever unregisters.
  useEffect(() => {
    let cancelled = false
    void import('@/features/capture/capture-sink').then(({ WebCaptureSink }) => {
      if (cancelled) return
      captureSinkRegistry.register('manual', new WebCaptureSink(service))
    })
    return () => {
      cancelled = true
      captureSinkRegistry.unregister('manual')
    }
  }, [service])

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
        <span className="crumb crumb--here">{t('inbox.crumb')}</span>
        <span className="crumb-spacer" />
        <button
          type="button"
          className={`tab ${view === 'inbox' ? 'tab--active' : ''}`}
          onClick={() => setView('inbox')}
        >
          {t('inbox.tab.inbox')}
        </button>
        <button
          type="button"
          className={`tab ${view === 'archived' ? 'tab--active' : ''}`}
          onClick={() => setView('archived')}
        >
          {t('inbox.tab.archived')}
        </button>
        <Tag color={view === 'inbox' ? 'red' : 'blue'}>
          {view === 'inbox' ? inbox.length : archived.length}
        </Tag>
      </Toolbar>

      <div className="content">
        {view === 'inbox' && (
          <CreateCardForm
            onCreate={(input) => {
              // Unified capture entry (Phase 6.5e + 6.5g): all capture
              // entry-points route through captureSinkRegistry →
              // WebCaptureSink → service.fromCapture. Same onSubmit
              // shape regardless of source.kind.
              // CaptureInput.links is `string[]`; ConvertCardForm gives
              // us LinkPreview[]; extract URL string array for the sink.
              void captureSinkRegistry.submit({
                source: { kind: 'manual', deviceId: DEVICE_ID },
                title: input.title,
                body: input.body,
                links: input.links.map((l) => l.url),
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
                <CardTile card={card} onOpen={() => setDetail(card)} />
              </li>
            ))}
          </ul>
        )}

        {view === 'inbox' && (
          <p className="footnote">
            <Link href="/" className="footnote__link">← {t('common.home')}</Link>
          </p>
        )}
      </div>

      {detail && (
        <CardDetailModal
          card={detail}
          actions={['archive', 'unarchive', 'sendToCanvas', 'softDelete']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.id, patch)
            if (updated) setDetail(updated)
          }}
          onArchive={() => {
            service.archive(detail.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(detail.id)
            setDetail(null)
          }}
          onSendToCanvas={() => {
            // Phase v0.15 follow-up: send to whichever canvas is
            // currently active in canvasStore (multi-canvas). Falls
            // back to DEFAULT_CANVAS_ID if the store hasn't hydrated
            // yet (first render / SSR).
            const targetCanvasId = canvasesSnap.activeCanvasId ?? DEFAULT_CANVAS_ID
            const existing = service.listOnCanvas(targetCanvasId)
            const nextZ = existing.length === 0
              ? 0
              : Math.max(...existing.map((c) => c.canvasPosition?.z ?? 0)) + 1
            service.moveToCanvas(detail.id, {
              canvasId: targetCanvasId,
              x: 100 + (nextZ % 5) * 40,
              y: 100 + (nextZ % 5) * 40,
              w: 200,
              h: 80,
              z: nextZ,
            })
            const updated = service.get(detail.id)
            if (updated) setDetail(updated)
          }}
          onConfirmDelete={() => {
            service.softDelete(detail.id)
            setDetail(null)
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function CardTile({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { t } = useI18n()
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
          <Tag color="red">{t(typeKeyOf(card.type))}</Tag>
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
  const { t } = useI18n()
  return (
    <UICard>
      <div className="empty">
        <div className="empty__bar" aria-hidden="true" />
        <p className="empty__eyebrow">{t('inbox.crumb')}</p>
        <h2 className="empty__h">
          {view === 'inbox' ? t('inbox.empty.title') : t('inbox.empty.titleArchived')}
        </h2>
        <p className="empty__lede">
          {view === 'inbox' ? t('inbox.empty.lede') : t('inbox.empty.ledeArchived')}
        </p>
      </div>
    </UICard>
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
.tab--active { color: var(--color-black); border-bottom-color: var(--color-red); font-weight: 600; }

.content { max-width: 1120px; margin: 0 auto; padding: var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
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

`
