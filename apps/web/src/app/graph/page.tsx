'use client'

/**
 * /graph — 关系图谱页(P? graph)。
 *
 * 异步聚合所有画布的 freeform 箭头 → GraphEdge[],卡片 → GraphNode[],
 * 过滤后交给 <GraphCanvas>(d3-force + Canvas 2D)。点节点弹共享 CardDetailModal。
 *
 * 静态导出:无 'use server' / API route;数据全走客户端 store。
 */
import { useMemo, useState } from 'react'
import { Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { CardDetailModal } from '@/features/card/card-detail'
import { GraphCanvas } from '@/features/graph/graph-canvas'
import { GraphFilters } from '@/features/graph/graph-filters'
import {
  cardsToNodes,
  type GraphEdge,
} from '@/features/graph/aggregate-edges'
import { useGlobalEdges } from '@/features/graph/use-global-edges'
import { filterGraph, type GraphFilter } from '@/features/graph/graph-filter'

export default function GraphPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()

  // 异步聚合边(提升为 hook,供详情页 backlinks 共用)。
  const { edges, loaded: edgesLoaded } = useGlobalEdges()
  const loaded = ready && edgesLoaded

  // 节点:未软删的卡片。
  const nodes = useMemo(
    () => cardsToNodes(service.listAll().filter((c) => !c.deletedAt)),
    // snap 是 useSyncExternalStore 快照引用,数据变化才重新分配。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, service],
  )

  // 可选标签色(去重,给 select)。
  const allTags = useMemo(
    () => Array.from(new Set(nodes.map((n) => n.tagColor).filter((v): v is string => Boolean(v)))),
    [nodes],
  )

  // 过滤器状态。
  const [filter, setFilter] = useState<GraphFilter>({
    hideArchived: true,
    tag: null,
    type: null,
  })

  const filtered = useMemo(() => filterGraph(nodes, edges, filter), [nodes, edges, filter])

  // 点节点弹 modal。
  const cardById = useMemo(() => {
    const m = new Map<CardId, Card>()
    for (const c of service.listAll()) m.set(c.id, c)
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, service])
  const [detail, setDetail] = useState<Card | null>(null)

  const isLoading = !ready || !loaded
  const isEmpty = filtered.nodes.length === 0

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="system">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('graph.title')}</h1>
      </Toolbar>

      <div className="page-content page-content--wide">
        <GraphFilters filter={filter} onChange={setFilter} tags={allTags} />

        {isLoading ? (
          <PageLoading />
        ) : isEmpty ? (
          <div className="graph-empty">
            <p className="graph-empty__title">{t('graph.emptyTitle')}</p>
            <p className="graph-empty__hint">{t('graph.emptyHint')}</p>
          </div>
        ) : (
          <div className="graph-canvas-wrap">
            <GraphCanvas
              nodes={filtered.nodes}
              edges={filtered.edges}
              onNodeClick={(id) => {
                const card = cardById.get(id as CardId)
                if (card) setDetail(card)
              }}
            />
          </div>
        )}
      </div>

      {detail && (
        <CardDetailModal
          card={detail}
          actions={['archive', 'softDelete', 'sendToCanvas', 'pin']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.id, patch)
            if (updated) setDetail(updated)
          }}
          onTogglePin={() => {
            const updated = service.update(detail.id, { pinned: !detail.pinned })
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

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.graph-canvas-wrap {
  margin-top: var(--space-3);
  height: calc(100vh - 220px);
  min-height: 400px;
  border: var(--border-hairline);
  background: var(--color-white);
}
.graph-empty {
  margin-top: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: center;
  text-align: center;
}
.graph-empty__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  color: var(--color-black);
}
.graph-empty__hint {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-gray);
}
`
