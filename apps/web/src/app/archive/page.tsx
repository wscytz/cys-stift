'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button, Card as UICard, Modal, Tag, Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'
import { Timeline } from '@/features/archive/timeline'
import { CardDetailModal } from '@/features/card/card-detail'
import { captureSinkRegistry } from '@/features/capture/capture-sink'
import { getDeviceId } from '@/lib/device-id'
import { pushToast } from '@/lib/toast-store'

type View = 'grid' | 'timeline'

const DEVICE_ID = getDeviceId()

export default function ArchivePage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  void snap // subscribe
  const [view, setView] = useState<View>('grid')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<CardId>>(() => new Set())
  // Detail modal — Phase archive-detail closes review §🟠 UX #4 (tile
  // click was no-op). Single source of truth lives in `cards` below; we
  // keep a local `detail` ref so editing reflects immediately.
  const [detail, setDetail] = useState<{ card: Card } | null>(null)
  // Phase batch-confirm (review §🟠 UX #3): batch soft-delete via the
  // floater previously fired without any confirmation — one click
  // soft-deleted N cards. The confirm modal mirrors the trash /
  // shared-CardDetailModal pattern: shows what will be affected, the
  // recovery path (Trash), and a danger button labelled with the count.
  // null = hidden; an array = "show confirm for these ids".
  const [confirmBatchDelete, setConfirmBatchDelete] = useState<
    CardId[] | null
  >(null)

  // Archived & not soft-deleted, sorted by updatedAt desc. Pinned cards
  // lift to the front (stable partition, Phase A v0.24.0).
  const cards = useMemo(
    () => {
      const all = service
        .listAll()
        .filter((c) => c.archived && !c.deletedAt)
        .sort((a, b) => +b.updatedAt - +a.updatedAt)
      const pinned = all.filter((c) => c.pinned)
      const rest = all.filter((c) => !c.pinned)
      return [...pinned, ...rest]
    },
    [service, ready, snap],
  )

  const toggleSelect = (id: CardId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelected = () => {
    setSelected(new Set())
  }

  const handleUnarchiveSelected = () => {
    const n = selected.size
    for (const id of selected) {
      service.unarchive(id)
    }
    clearSelected()
    pushToast({
      kind: 'success',
      message: t('inbox.batch.unarchivedN', { n: String(n) }),
    })
  }

  const handleSoftDeleteSelected = () => {
    // Phase batch-confirm: don't soft-delete yet — open the confirm
    // modal. The user still has the selection set so they can re-trigger
    // after Cancel without re-ticking every tile.
    setConfirmBatchDelete([...selected])
  }

  const handleConfirmBatchSoftDelete = () => {
    if (!confirmBatchDelete) return
    const n = confirmBatchDelete.length
    for (const id of confirmBatchDelete) {
      service.softDelete(id)
    }
    setConfirmBatchDelete(null)
    clearSelected()
    pushToast({
      kind: 'success',
      message: t('inbox.batch.deletedN', { n: String(n) }),
    })
  }

  const handleCancelBatchSoftDelete = () => {
    setConfirmBatchDelete(null)
    // Keep `selected` so the user can rethink without re-ticking.
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    clearSelected()
  }

  const openDetail = (id: CardId) => {
    const c = cards.find((x) => x.id === id)
    if (c) setDetail({ card: c })
  }

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="archive">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('archive.crumb')}</h1>
        <span className="crumb-spacer" />
        <button
          type="button"
          className={`tab ${view === 'grid' ? 'tab--active' : ''}`}
          onClick={() => setView('grid')}
        >
          {t('archive.viewGrid')}
        </button>
        <button
          type="button"
          className={`tab ${view === 'timeline' ? 'tab--active' : ''}`}
          onClick={() => setView('timeline')}
        >
          {t('archive.viewTimeline')}
        </button>
        <Tag color="blue">{cards.length}</Tag>
        <span className="tab-sep" />
        {selectMode ? (
          <Button variant="ghost" onClick={exitSelectMode}>
            {t('archive.selectNone')}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setSelectMode(true)} disabled={cards.length === 0}>
            {t('archive.select')}
          </Button>
        )}
      </Toolbar>

      <div className="page-content page-content--wide">
        {!ready ? (
          <PageLoading />
        ) : cards.length === 0 ? (
          <EmptyState />
        ) : view === 'grid' ? (
          <ul className="grid">
            {cards.map((card) => (
              <li key={card.id}>
                <ArchiveCardTile
                  card={card}
                  variant="tile"
                  selected={selected.has(card.id)}
                  selectMode={selectMode}
                  onClick={() => openDetail(card.id)}
                  onToggleSelect={() => toggleSelect(card.id)}
                  onTogglePin={() =>
                    service.update(card.id, { pinned: !card.pinned })
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <Timeline
            cards={cards}
            selected={selected}
            selectMode={selectMode}
            onOpen={openDetail}
            onToggleSelect={toggleSelect}
            onTogglePin={(id) => {
              const c = cards.find((x) => x.id === id)
              if (c) service.update(id, { pinned: !c.pinned })
            }}
          />
        )}

        <p className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
        </p>
      </div>

      {selectMode && selected.size > 0 && (
        <div className="batch-bar" role="region" aria-label={t('archive.batchDelete')}>
          <span className="batch-bar__count">
            {t('archive.floater.selected', { n: selected.size })}
          </span>
          <button type="button" className="batch-bar__btn" onClick={handleUnarchiveSelected}>
            {t('archive.floater.unarchive')}
          </button>
          <button type="button" className="batch-bar__btn batch-bar__btn--danger" onClick={handleSoftDeleteSelected}>
            {t('archive.floater.softDelete')}
          </button>
          <span className="batch-bar__spacer" />
          <button type="button" className="batch-bar__btn" onClick={clearSelected}>
            {t('archive.floater.clear')}
          </button>
        </div>
      )}

      {confirmBatchDelete && (
        <Modal
          open
          onClose={handleCancelBatchSoftDelete}
          title={t('archive.batchDeleteConfirmTitleN', { n: confirmBatchDelete.length })}
        >
          <p className="confirm__body">
            <strong>
              {t('archive.batchDeleteConfirmCardsHeader', { n: confirmBatchDelete.length })}
            </strong>{' '}
            {(() => {
              const titles = confirmBatchDelete
                .map((id) => cards.find((c) => c.id === id)?.title || t('card.untitled'))
                .slice(0, 5)
              const overflow = confirmBatchDelete.length - titles.length
              return (
                <>
                  {titles.join(', ')}
                  {overflow > 0 && t('archive.batchDeleteConfirmAndMore', { n: overflow })}.
                </>
              )
            })()}
          </p>
          <p className="confirm__body">{t('archive.batchDeleteConfirmRecovery')}</p>
          <div className="confirm__actions">
            <Button variant="ghost" onClick={handleCancelBatchSoftDelete}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleConfirmBatchSoftDelete}>
              {t('archive.batchDeleteConfirmAction', { n: confirmBatchDelete.length })}
            </Button>
          </div>
        </Modal>
      )}

      {detail && (
        <CardDetailModal
          card={detail.card}
          actions={['unarchive', 'softDelete', 'pin', 'export', 'rewrite', 'summarize', 'translate']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.card.id, patch)
            if (updated) setDetail({ card: updated })
          }}
          onTogglePin={() => {
            const updated = service.update(detail.card.id, {
              pinned: !detail.card.pinned,
            })
            if (updated) setDetail({ card: updated })
          }}
          onUnarchive={() => {
            service.unarchive(detail.card.id)
            setDetail(null)
          }}
          onConfirmDelete={() => {
            service.softDelete(detail.card.id)
            setDetail(null)
          }}
          onAIAppendNew={(c) => {
            // M3 — AI append on archive page. The new card lands in
            // inbox (captureSinkRegistry 'manual' sink target) so the
            // user can find it alongside their other active notes.
            void captureSinkRegistry.submit({
              source: { kind: 'manual', deviceId: DEVICE_ID },
              title: c.title,
              body: c.body,
            })
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <UICard>
      <div className="empty">
        <div className="empty__bar" aria-hidden="true" />
        <p className="eyebrow">{t('archive.crumb')}</p>
        <h2 className="display-title display-title--lg">{t('archive.empty')}</h2>
      </div>
    </UICard>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
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
.tab--active { color: var(--color-black); border-bottom-color: var(--color-blue); }
.tab-sep { width: 1px; height: 24px; background: var(--color-gray-soft); margin: 0 var(--space-1); }

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
}

.empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-3) 0; }
.empty__bar { width: 64px; height: 8px; background: var(--color-blue); }

/* Batch bar — mirrors inbox's .batch-bar (white card + 2px black border +
   hard 4px black offset shadow + uppercase mono buttons). Keeps the
   archive floater's existing fixed bottom-center positioning. */
.batch-bar {
  position: fixed; left: 50%; bottom: var(--space-4); transform: translateX(-50%);
  z-index: 30;
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-white); border: 2px solid var(--color-black); border-radius: var(--radius-sm);
  box-shadow: 4px 4px 0 0 var(--color-black);
  font-family: var(--font-mono); white-space: nowrap;
}
.batch-bar__count {
  font-size: var(--font-size-xs); letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--color-black); padding: 0 var(--space-1);
}
.batch-bar__btn {
  height: 30px; padding: 0 var(--space-2);
  display: inline-flex; align-items: center;
  background: transparent; border: 1px solid var(--color-black); border-radius: var(--radius-sm);
  color: var(--color-black); font-family: var(--font-mono);
  font-size: var(--font-size-xs); letter-spacing: 0.1em; text-transform: uppercase;
  cursor: pointer; transition: background 80ms ease-out, color 80ms ease-out;
}
.batch-bar__btn:hover { background: var(--color-black); color: var(--color-white); }
.batch-bar__btn--danger:hover { background: var(--color-red); border-color: var(--color-red); }
.batch-bar__spacer { width: var(--space-3); }
.batch-bar__btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }

.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
`
