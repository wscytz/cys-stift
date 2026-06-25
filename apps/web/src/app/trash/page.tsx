'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button, Card as UICard, Modal, Tag, Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'

/**
 * /trash — soft-delete recovery view (Phase trash, review #2).
 *
 * Lists every card whose `deletedAt` is set, sorted by `deletedAt` desc
 * (most recently trashed first). Two actions per card:
 *   - Restore: clears `deletedAt`, card naturally returns to whatever view
 *     it came from (inbox / archive / canvas — `archived` and
 *     `canvasPosition` are untouched).
 *   - Delete forever: irreversible `hardDelete`. Asks the user to type
 *     the word "delete" to confirm (single-card, no bulk).
 *
 * No select mode (MVP): every action is per-card.
 */
export default function TrashPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  void snap // subscribe
  const [confirmHardDelete, setConfirmHardDelete] = useState<CardId | null>(null)
  // C2 (v0.23.3): hard-delete is irreversible — require the user to type
  // "delete" before the red button enables. The typed text resets when
  // the modal closes so a later reopen starts clean.
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const trashed = useMemo(
    () =>
      service
        .listAll()
        .filter((c) => c.deletedAt)
        .sort((a, b) => +b.deletedAt! - +a.deletedAt!),
    [service, ready, snap],
  )

  const confirmingCard = confirmHardDelete
    ? trashed.find((c) => c.id === confirmHardDelete)
    : null

  return (
    <main className="page">
      <Toolbar region="trash">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('trash.crumb')}</span>
        <span className="crumb-spacer" />
        <Tag color="gray">{trashed.length}</Tag>
      </Toolbar>

      <div className="page-content page-content--wide">
        {!ready ? (
          <PageLoading />
        ) : trashed.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid">
            {trashed.map((card) => (
              <li key={card.id}>
                <TrashItem
                  card={card}
                  onRestore={() => service.restore(card.id)}
                  onRequestHardDelete={() => setConfirmHardDelete(card.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <p className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
        </p>
      </div>

      <Modal
        open={confirmingCard != null}
        onClose={() => {
          setConfirmHardDelete(null)
          setDeleteConfirmText('')
        }}
        title={t('trash.deleteForeverTitle')}
      >
        {confirmingCard && (
          <>
            <p className="confirm__body">
              {t('trash.deleteForeverBody', { title: confirmingCard.title || t('card.untitled') })}
            </p>
            <p className="confirm__body">{t('trash.deleteForeverConfirm')}</p>
            <input
              className="confirm__type"
              type="text"
              autoFocus
              placeholder={t('trash.deleteForeverTypePlaceholder')}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
            <div className="confirm__actions">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmHardDelete(null)
                  setDeleteConfirmText('')
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deleteConfirmText !== 'delete'}
                onClick={() => {
                  service.hardDelete(confirmingCard.id)
                  setConfirmHardDelete(null)
                  setDeleteConfirmText('')
                }}
              >
                {t('trash.deleteForeverBtn')}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <style>{styles}</style>
    </main>
  )
}

interface TrashItemProps {
  card: Card
  onRestore: () => void
  onRequestHardDelete: () => void
}

/**
 * One trashed card. Reuses ArchiveCardTile for the visual (it is already
 * a generic "saved card" tile; archive just happens to also show blue
 * stripe). Per-card Restore + Delete forever actions below the tile.
 */
function TrashItem({ card, onRestore, onRequestHardDelete }: TrashItemProps) {
  const { t } = useI18n()
  return (
    <div className="trash-item">
      <ArchiveCardTile
        card={card}
        variant="tile"
        selected={false}
        selectMode={false}
        disabled // L3: trash tiles are display-only; restore/delete via sibling buttons
        onClick={() => {}}
        onToggleSelect={() => {}}
      />
      <div className="trash-item__actions">
        <Button variant="secondary" onClick={onRestore}>
          {t('trash.restore')}
        </Button>
        <Button variant="danger" onClick={onRequestHardDelete}>
          {t('trash.deleteForever')}
        </Button>
      </div>
    </div>
  )
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <UICard>
      <div className="empty">
        <div className="empty__bar" aria-hidden="true" />
        <p className="eyebrow">{t('trash.crumb')}</p>
        <h2 className="display-title display-title--lg">{t('trash.empty')}</h2>
      </div>
    </UICard>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
}

.trash-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.trash-item__actions {
  display: flex;
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-2);
}

.empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-3) 0; }
.empty__bar { width: 64px; height: 8px; background: var(--color-gray); }

.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__body + .confirm__body { margin-top: var(--space-1); }
.confirm__type {
  display: block; width: 100%; margin-top: var(--space-2);
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  background: var(--color-white); color: var(--color-black); outline: none;
}
.confirm__type:focus { border-color: var(--color-red); }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
`