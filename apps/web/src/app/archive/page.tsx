'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button, Card as UICard, Modal, Tag, Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'
import { Timeline } from '@/features/archive/timeline'
import { CardDetailModal } from '@/features/card/card-detail'

type View = 'grid' | 'timeline'

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

  // Archived & not soft-deleted, sorted by updatedAt desc.
  const cards = useMemo(
    () =>
      service
        .listAll()
        .filter((c) => c.archived && !c.deletedAt)
        .sort((a, b) => +b.updatedAt - +a.updatedAt),
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
    for (const id of selected) {
      service.unarchive(id)
    }
    clearSelected()
  }

  const handleSoftDeleteSelected = () => {
    // Phase batch-confirm: don't soft-delete yet — open the confirm
    // modal. The user still has the selection set so they can re-trigger
    // after Cancel without re-ticking every tile.
    setConfirmBatchDelete([...selected])
  }

  const handleConfirmBatchSoftDelete = () => {
    if (!confirmBatchDelete) return
    for (const id of confirmBatchDelete) {
      service.softDelete(id)
    }
    setConfirmBatchDelete(null)
    clearSelected()
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
    <main className="page">
      <Toolbar region="archive">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('archive.crumb')}</span>
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
            {t('archive.viewGrid')}
          </Button>
        )}
      </Toolbar>

      <div className="content">
        {cards.length === 0 ? (
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
          />
        )}

        <p className="footnote">
          <Link href="/" className="footnote__link">← home</Link>
          {' · '}
          <Link href="/inbox" className="footnote__link">inbox</Link>
          {' · '}
          <Link href="/dev/db" className="footnote__link">dev/db</Link>
        </p>
      </div>

      {selectMode && selected.size > 0 && (
        <div className="floater" role="region" aria-label="Bulk actions">
          <span className="floater__label">{selected.size} selected</span>
          <span className="floater__sep" aria-hidden="true" />
          <Button variant="primary" onClick={handleUnarchiveSelected}>
            Unarchive
          </Button>
          <Button variant="danger" onClick={handleSoftDeleteSelected}>
            Soft-delete
          </Button>
          <Button variant="ghost" onClick={clearSelected}>
            Clear
          </Button>
        </div>
      )}

      {confirmBatchDelete && (
        <Modal
          open
          onClose={handleCancelBatchSoftDelete}
          title={`Soft-delete ${confirmBatchDelete.length} card${
            confirmBatchDelete.length === 1 ? '' : 's'
          }?`}
        >
          <p className="confirm__body">
            <strong>
              {confirmBatchDelete.length} card
              {confirmBatchDelete.length === 1 ? '' : 's'}:
            </strong>{' '}
            {(() => {
              const titles = confirmBatchDelete
                .map((id) => cards.find((c) => c.id === id)?.title || '(untitled)')
                .slice(0, 5)
              const overflow = confirmBatchDelete.length - titles.length
              return (
                <>
                  {titles.join(', ')}
                  {overflow > 0 && `, and ${overflow} more`}.
                </>
              )
            })()}
          </p>
          <p className="confirm__body">
            These cards will be hidden from the archive. You can{' '}
            <Link href="/trash" className="confirm__link">
              restore them from Trash
            </Link>{' '}
            later.
          </p>
          <div className="confirm__actions">
            <Button variant="ghost" onClick={handleCancelBatchSoftDelete}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmBatchSoftDelete}>
              Soft-delete {confirmBatchDelete.length}
            </Button>
          </div>
        </Modal>
      )}

      {detail && (
        <CardDetailModal
          card={detail.card}
          actions={['unarchive', 'softDelete']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.card.id, patch)
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
        <p className="empty__eyebrow">{t('archive.crumb')}</p>
        <h2 className="empty__h">{t('archive.empty')}</h2>
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
.tab--active { color: var(--color-black); border-bottom-color: var(--color-blue); }
.tab-sep { width: 1px; height: 24px; background: var(--color-gray-soft); margin: 0 var(--space-1); }

.content { max-width: 1120px; margin: 0 auto; padding: var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }

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
.empty__eyebrow { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
.empty__h { margin: 0; font-family: var(--font-display); font-size: var(--font-size-2xl); font-weight: 500; letter-spacing: -0.01em; }
.empty__lede { margin: 0; color: var(--color-black-soft); font-size: var(--font-size-base); line-height: 1.6; max-width: 60ch; }

.footnote { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); margin: 0; padding-top: var(--space-2); border-top: var(--border-hairline); }
.footnote__link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }

.floater {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-black);
  color: var(--color-white);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}
.floater__label { text-transform: uppercase; letter-spacing: 0.12em; }
.floater__sep { width: 1px; height: 24px; background: var(--color-gray-soft); margin: 0 var(--space-1); }

.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
`
