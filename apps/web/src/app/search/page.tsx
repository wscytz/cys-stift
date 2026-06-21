'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Toolbar, Tag } from '@cys-stift/ui'
import type { Card, SearchResult } from '@cys-stift/domain'
import { searchCards, bodySnippet } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { CardDetailModal } from '@/features/card/card-detail'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'

/**
 * /search — v0.22.5-search restore / P11 v0.36.0 enhance.
 * Full-text search with live results as you type: title-boosted scoring, tag
 * search, body snippets. Reuses ArchiveCardTile for results grid and
 * CardDetailModal for card detail/edit.
 */
export default function SearchPage() {
  const { t } = useI18n()
  const { snap, service } = useDb()
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ card: Card } | null>(null)

  const allCards = useMemo(() => service.listAll(), [snap, service])
  const results = useMemo(() => {
    const matched = searchCards(allCards, query)
    // G1 (v0.25.1): lift pinned matches to the front. We preserve the
    // score ordering within each group (pinned first, then unpinned).
    const pinned: typeof matched = []
    const rest: typeof matched = []
    for (const r of matched) {
      if (r.card.pinned) pinned.push(r)
      else rest.push(r)
    }
    return [...pinned, ...rest]
  }, [allCards, query])

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
              {results.map((r) => (
                <li key={r.card.id}>
                  <ArchiveCardTile
                    card={r.card}
                    variant="tile"
                    selected={false}
                    selectMode={false}
                    onClick={() => setDetail({ card: r.card })}
                    onToggleSelect={() => {}}
                  />
                  {query.trim() !== '' && r.score > 0 && (
                    <SnippetLine result={r} query={query} />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {detail && (
        <CardDetailModal
          card={detail.card}
          actions={['archive', 'softDelete', 'sendToCanvas', 'pin']}
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

/** Per-result snippet line: shows body excerpt centred on first match. */
function SnippetLine({ result, query }: { result: SearchResult; query: string }) {
  const snippet = bodySnippet(result.card, query)
  if (!snippet) return null
  return (
    <p className="search-snippet">{snippet}</p>
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
.search-snippet {
  margin: var(--space-1) 0 0; font-family: var(--font-mono);
  font-size: var(--font-size-xs); color: var(--color-gray);
  line-height: 1.4; word-break: break-all;
}
.grid {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
}
`
