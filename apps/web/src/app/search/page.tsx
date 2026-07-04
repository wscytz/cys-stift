'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import Link from 'next/link'
import { Toolbar, Tag } from '@cys-stift/ui'
import type { Card, CardId, SearchResult } from '@cys-stift/domain'
import { searchCards, bodySnippet } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { CardDetailModal } from '@/features/card/card-detail'
import { useGlobalEdges } from '@/features/graph/use-global-edges'
import { liveEdgesOnly } from '@/features/graph/aggregate-edges'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'

/**
 * /search — v0.22.5-search restore / P11 v0.36.0 enhance.
 * Full-text search with live results as you type: title-boosted scoring, tag
 * search, body snippets. Reuses ArchiveCardTile for results grid and
 * CardDetailModal for card detail/edit.
 */
export default function SearchPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  // 跨画布 backlinks(只读):聚合全局边后过滤端点已软删的(G7 防泄露),传 CardDetailModal
  // 显示「这张卡和谁有关系」。canEditRelations 不传(默认 false=只读,无 × 删除/+ 添加钮)。
  const { edges } = useGlobalEdges()
  const liveEdges = useMemo(
    () => liveEdgesOnly(edges, service.listAll()),
    // snap 是 useSyncExternalStore 快照,数据变化才换引用(同 graph 页 liveEdges 口径)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, snap, service],
  )
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ card: Card } | null>(null)
  // BUG-1 fix: detail 是 local state,跨 tab 软删/归档后 useDb re-render 但 detail 不清
  // → modal 残留幽灵卡。从 store 实时取卡 + 过滤软删,变 null 则 modal 自动卸载
  // (与 canvas/timeline/graph effectiveDetail 同口径)。
  const effectiveDetail = detail
    ? (() => {
        const live = service.get(detail.card.id)
        return live && !live.deletedAt ? { card: live } : null
      })()
    : null

  const allCards = useMemo(() => service.listAll(), [snap, service])
  // useDeferredValue:input 保持即时响应,搜索计算退到空闲帧 —— 500 卡时不阻塞每次按键。
  const deferred = useDeferredValue(query)
  const results = useMemo(() => {
    const matched = searchCards(allCards, deferred)
    // G1 (v0.25.1): lift pinned matches to the front. We preserve the
    // score ordering within each group (pinned first, then unpinned).
    const pinned: typeof matched = []
    const rest: typeof matched = []
    for (const r of matched) {
      if (r.card.pinned) pinned.push(r)
      else rest.push(r)
    }
    return [...pinned, ...rest]
  }, [allCards, deferred])

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="system">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('search.crumb')}</h1>
      </Toolbar>

      <div className="page-content page-content--wide">
        <input
          autoFocus
          className="search-input"
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {!ready ? (
          <PageLoading />
        ) : query.trim() === '' ? (
          <p className="search-hint">{t('search.empty')}</p>
        ) : results.length === 0 ? (
          <p className="search-hint">{t('search.noMatch', { q: query })}</p>
        ) : (
          <>
            <p className="mono-label">{t('search.resultsCount', { n: results.length })}</p>
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

      {effectiveDetail && (
        <CardDetailModal
          card={effectiveDetail.card}
          globalEdges={liveEdges}
          getCardTitle={(id) => service.get(id as CardId)?.title}
          actions={['archive', 'softDelete', 'sendToCanvas', 'pin']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(effectiveDetail.card.id, patch)
            if (updated) setDetail({ card: updated })
            return updated != null
          }}
          onTogglePin={() => {
            const updated = service.update(effectiveDetail.card.id, {
              pinned: !effectiveDetail.card.pinned,
            })
            if (updated) setDetail({ card: updated })
          }}
          onConfirmDelete={() => {
            service.softDelete(effectiveDetail.card.id)
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
.search-input {
  width: 100%; height: 48px; padding: 0 var(--space-3);
  font-family: var(--font-body); font-size: var(--font-size-lg);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  background: var(--color-white); color: var(--color-black);
  outline: none;
}
.search-input:focus-visible { border-color: var(--color-black); border-width: 2px; padding: 0 calc(var(--space-3) - 1px); }
.search-hint { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
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
