'use client'

import type { Card, CardId } from '@cys-stift/domain'
import { ArchiveCardTile } from './archive-card-tile'

interface TimelineProps {
  cards: Card[]
  selected: Set<CardId>
  selectMode: boolean
  onOpen: (id: CardId) => void
  onToggleSelect: (id: CardId) => void
}

/**
 * Time-axis view: 按 updatedAt 按日分组 (UTC ISO date),组内单列行式.
 * Spec §5.4 Archive 第二种视图.
 */
export function Timeline({
  cards,
  selected,
  selectMode,
  onOpen,
  onToggleSelect,
}: TimelineProps) {
  // Group by ISO date (UTC). Cards are already sorted by updatedAt desc,
  // so insertion order in the Map is the desired day-desc order.
  const groups = new Map<string, Card[]>()
  for (const c of cards) {
    const day = c.updatedAt.toISOString().slice(0, 10)
    const bucket = groups.get(day)
    if (bucket) bucket.push(c)
    else groups.set(day, [c])
  }

  if (groups.size === 0) {
    return null
  }

  return (
    <div className="tl">
      {[...groups.entries()].map(([day, dayCards]) => (
        <section className="tl__day" key={day}>
          <h3 className="tl__day-label">{day}</h3>
          <ul className="tl__list">
            {dayCards.map((c) => (
              <li key={c.id}>
                <ArchiveCardTile
                  card={c}
                  variant="row"
                  selected={selected.has(c.id)}
                  selectMode={selectMode}
                  onClick={() => onOpen(c.id)}
                  onToggleSelect={() => onToggleSelect(c.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.tl { display: flex; flex-direction: column; gap: var(--space-4); }
.tl__day { display: flex; flex-direction: column; gap: var(--space-2); }
.tl__day-label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--color-gray);
  padding-bottom: var(--space-1);
  border-bottom: var(--border-hairline);
}
.tl__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
`
