'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tag } from '@cys-stift/ui'
import { PageHeader } from '@/features/page-header'
import type { Card, CardId, SearchResult } from '@cys-stift/domain'
import { searchCards } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { CardDetailModal } from '@/features/card/card-detail'
import { useGlobalEdges } from '@/features/graph/use-global-edges'
import { liveEdgesOnly } from '@/features/graph/aggregate-edges'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'
import { openCardFromOverview } from '@/features/card/card-reentry'
import { readableBodySnippet } from './search-result'
import { SearchFilters } from '@/features/search/search-filters'
import {
  applySearchFilters,
  collectTagValues,
  DEFAULT_SEARCH_FILTER,
  type SearchFilter,
} from '@/features/search/search-filter'

/**
 * /search — v0.22.5-search restore / P11 v0.36.0 enhance.
 * Full-text search with live results as you type: title-boosted scoring, tag
 * search, body snippets. Reuses ArchiveCardTile for results grid and
 * CardDetailModal for card detail/edit.
 */
export default function SearchPage() {
  const { t } = useI18n()
  const router = useRouter()
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
  // B-3「收敛找回」:筛选框架(状态 / tags any-match / 时间),让搜索成为找回的唯一主场。
  const [filter, setFilter] = useState<SearchFilter>(DEFAULT_SEARCH_FILTER)
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
  // B-3「收敛找回」:搜索页承载找回的全部维度。活卡(排除软删)先过筛选框架
  // (状态 / tags any-match / 时间),再走全文 searchCards —— 文本与筛选 AND。
  const liveCards = useMemo(() => allCards.filter((c) => !c.deletedAt), [allCards])
  const filteredCards = useMemo(
    () => applySearchFilters(liveCards, filter, Date.now()),
    [liveCards, filter],
  )
  const tagOptions = useMemo(() => collectTagValues(liveCards), [liveCards])
  const hasActiveFilter =
    filter.tags.length > 0 || filter.status !== 'all' || filter.timeRange !== 'all'
  // 有文本或有筛选才展示结果;两者皆空显示「输入关键词开始搜索」提示。
  const showResults = query.trim() !== '' || hasActiveFilter
  // useDeferredValue:input 保持即时响应,搜索计算退到空闲帧 —— 500 卡时不阻塞每次按键。
  const deferred = useDeferredValue(query)
  const results = useMemo(() => {
    const matched = searchCards(filteredCards, deferred)
    // G1 (v0.25.1): lift pinned matches to the front. We preserve the
    // score ordering within each group (pinned first, then unpinned).
    const pinned: typeof matched = []
    const rest: typeof matched = []
    for (const r of matched) {
      if (r.card.pinned) pinned.push(r)
      else rest.push(r)
    }
    return [...pinned, ...rest]
  }, [filteredCards, deferred])

  return (
    <main id="main" tabIndex={-1} className="page">
      <div className="page-content page-content--wide">
        <PageHeader title={t('search.crumb')} />
        <input
          autoFocus
          className="search-input"
          type="text"
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <SearchFilters filter={filter} onChange={setFilter} tags={tagOptions} />

        {!ready ? (
          <PageLoading />
        ) : !showResults ? (
          <p className="search-hint">{t('search.empty')}</p>
        ) : results.length === 0 ? (
          <p className="search-hint">
            {query.trim() !== '' ? t('search.noMatch', { q: query }) : t('search.noFilterMatch')}
          </p>
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
                    onClick={() => openCardFromOverview(
                      r.card,
                      (href) => router.push(href),
                      (card) => setDetail({ card }),
                    )}
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
  const snippet = readableBodySnippet(result.card, query)
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
