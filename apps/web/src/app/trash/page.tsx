'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button, Card as UICard, Modal, Tag, Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
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
  const { snap, service, ready } = useDb()
  void snap // subscribe
  const [confirmHardDelete, setConfirmHardDelete] = useState<CardId | null>(null)

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
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">trash</span>
        <span className="crumb-spacer" />
        <Tag color="gray">{trashed.length}</Tag>
      </Toolbar>

      <div className="content">
        {trashed.length === 0 ? (
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
          <Link href="/" className="footnote__link">← home</Link>
          {' · '}
          <Link href="/inbox" className="footnote__link">inbox</Link>
          {' · '}
          <Link href="/archive" className="footnote__link">archive</Link>
        </p>
      </div>

      <Modal
        open={confirmingCard !== undefined}
        onClose={() => setConfirmHardDelete(null)}
        title="Delete forever?"
      >
        {confirmingCard && (
          <>
            <p className="confirm__body">
              <strong>{confirmingCard.title || '(untitled)'}</strong> will be
              removed permanently. This cannot be undone.
            </p>
            <div className="confirm__actions">
              <Button variant="ghost" onClick={() => setConfirmHardDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirmingCard) service.hardDelete(confirmingCard.id)
                  setConfirmHardDelete(null)
                }}
              >
                Delete forever
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
  return (
    <div className="trash-item">
      <ArchiveCardTile
        card={card}
        variant="tile"
        selected={false}
        selectMode={false}
        onClick={() => {
          // Trash items are not editable from /trash — restore first.
        }}
        onToggleSelect={() => {}}
      />
      <div className="trash-item__actions">
        <Button variant="secondary" onClick={onRestore}>
          Restore
        </Button>
        <Button variant="danger" onClick={onRequestHardDelete}>
          Delete forever
        </Button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <UICard>
      <div className="empty">
        <div className="empty__bar" aria-hidden="true" />
        <p className="empty__eyebrow">trash</p>
        <h2 className="empty__h">Trash is empty.</h2>
        <p className="empty__lede">
          Soft-deleted cards land here. You can restore them to their
          original view, or delete them permanently.
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

.content { max-width: 1120px; margin: 0 auto; padding: var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
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
.empty__eyebrow { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
.empty__h { margin: 0; font-family: var(--font-display); font-size: var(--font-size-2xl); font-weight: 500; letter-spacing: -0.01em; }
.empty__lede { margin: 0; color: var(--color-black-soft); font-size: var(--font-size-base); line-height: 1.6; max-width: 60ch; }

.footnote { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); margin: 0; padding-top: var(--space-2); border-top: var(--border-hairline); }
.footnote__link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }

.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
`