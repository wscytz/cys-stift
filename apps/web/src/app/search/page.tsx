'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Toolbar, Tag } from '@cys-stift/ui'
import type { Card } from '@cys-stift/domain'
import { searchCards } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { CardDetailModal } from '@/features/card/card-detail'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'

/**
 * /search — v0.22.5-search restore.
 * Full-text search with live results as you type. Reuses ArchiveCardTile
 * for results grid and CardDetailModal for card detail/edit.
 */
export default function SearchPage() {
  const { t, locale } = useI18n()
  const { snap, service, ready } = useDb()
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ card: Card } | null>(null)

  const allCards = service.listAll()
  const results = useMemo(
    () => searchCards(allCards, query),
    [allCards, query],
  )

  const resetQuery = () => setQuery('')

  return (
    <main className="page">
      <Toolbar region="system">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('search.crumb')}</span>
      </Toolbar>

      <div className="content">
        <input
          autoFocus
          className="search-input"
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {query.trim() === '' ? (
          <p className="search-hint">{t('search.empty')}</p>
        ) : results.length === 0 ? (
          <p className="search-hint">{t('search.noMatch', { q: query })}</p>
        ) : (
          <>
            <p className="search-count">{t('search.resultsCount', { n: results.length })}</p>
            <ul className="grid">
              {results.map((card) => (
                <li key={card.id}>
                  <ArchiveCardTile
                    card={card}
                    variant="tile"
                    selected={false}
                    selectMode={false}
                    onClick={() => setDetail({ card })}
                    onToggleSelect={() => {}}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {detail && (
        <CardDetailModal
          card={detail.card}
          actions={['archive', 'softDelete', 'sendToCanvas']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            setDetail({ card: { ...detail.card, ...patch } })
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

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.crumb { font-family: var(--font-mono); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.crumb--here { color: var(--color-black); }
.crumb-sep { color: var(--color-gray); }
.content { max-width: 1120px; margin: 0 auto; padding: var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
.search-input {
  width: 100%; height: 48px; padding: 0 var(--space-3);
  font-family: var(--font-body); font-size: var(--font-size-lg);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  background: var(--color-white); color: var(--color-black);
  outline: none;
}
.search-input:focus { border-color: var(--color-black); border-width: 2px; padding: 0 calc(var(--space-3) - 1px); }
.search-hint { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
.search-count { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); text-transform: uppercase; letter-spacing: 0.12em; }
.grid {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
}
`
