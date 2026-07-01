'use client'

/**
 * /graph — 关系图谱页(P? graph)。
 *
 * 异步聚合所有画布的 freeform 箭头 → GraphEdge[],卡片 → GraphNode[],
 * 过滤后交给 <GraphCanvas>(d3-force + Canvas 2D)。点节点弹共享 CardDetailModal。
 *
 * 静态导出:无 'use server' / API route;数据全走客户端 store。
 */
import { useMemo, useRef, useState } from 'react'
import { Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { CardDetailModal } from '@/features/card/card-detail'
import { GraphCanvas, type GraphCanvasHandle } from '@/features/graph/graph-canvas'
import { GraphZoomBar } from '@/features/graph/graph-zoom-bar'
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

  // 传 CardDetailModal 的边:过滤 from/to 指向已删卡的边(nodes 已滤 deletedAt,用 nodeIds 兜底)。
  // 图谱内 filterGraph 兜底,但 globalEdges 直传 modal 会泄露已删卡关系到 backlinks(G7)。
  const liveEdges = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id))
    return edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
  }, [edges, nodes])

  // 点节点弹 modal。
  const cardById = useMemo(() => {
    const m = new Map<CardId, Card>()
    for (const c of service.listAll()) m.set(c.id, c)
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, service])
  const [detail, setDetail] = useState<Card | null>(null)
  // BUG-2c — 缩放条:zoom state 提升到页面,GraphCanvas 通过 onZoomChange 上报,
  // GraphZoomBar 读 zoom + 调 imperative 句柄(graphRef.zoomBy/zoomTo/resetView)。
  const graphRef = useRef<GraphCanvasHandle>(null)
  const [zoom, setZoom] = useState(1)
  // BUG-1 fix: detail 是 local state,跨 tab 软删/归档后 useDb re-render 但 detail 不清
  // → modal 残留幽灵卡。从 store 实时取卡 + 过滤软删,变 null 则 modal 自动卸载
  // (与 canvas page effectiveDetail 同口径)。
  const effectiveDetail = detail
    ? (() => {
        const live = service.get(detail.id)
        return live && !live.deletedAt ? live : null
      })()
    : null

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
              ref={graphRef}
              nodes={filtered.nodes}
              edges={filtered.edges}
              onNodeClick={(id) => {
                const card = cardById.get(id as CardId)
                if (card) setDetail(card)
              }}
              onZoomChange={setZoom}
            />
            <GraphZoomBar
              zoom={zoom}
              onZoomBy={(factor) => graphRef.current?.zoomBy(factor)}
              onZoomTo={(z) => graphRef.current?.zoomTo(z)}
              onReset={() => graphRef.current?.resetView()}
            />
          </div>
        )}
      </div>

      {effectiveDetail && (
        <CardDetailModal
          card={effectiveDetail}
          actions={['archive', 'softDelete', 'sendToCanvas', 'pin']}
          onClose={() => setDetail(null)}
          // BR-T5 — 注入全局边 + 卡标题查询,让详情里显示跨画布 backlinks 区。
          // onJumpToCard 第一版:关闭 modal(图谱内高亮节点留 2b)。
          globalEdges={liveEdges}
          getCardTitle={(id) => service.get(id as CardId)?.title}
          onJumpToCard={() => setDetail(null)}
          // RB-T3 — graph 页有 useGlobalEdges + service.listAll,放开详情页建/删关系。
          // allCards 含已删,picker 内部过滤 !deletedAt。建/删走 relation-builder
          // (写 default canvas 的 freeform store),乐观更新见 card-detail 的 localEdges。
          allCards={service.listAll()}
          canEditRelations={true}
          onSave={(patch) => {
            const updated = service.update(effectiveDetail.id, patch)
            if (updated) setDetail(updated)
          }}
          onTogglePin={() => {
            const updated = service.update(effectiveDetail.id, { pinned: !effectiveDetail.pinned })
            if (updated) setDetail(updated)
          }}
          onConfirmDelete={() => {
            service.softDelete(effectiveDetail.id)
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
  position: relative; /* BUG-2c:GraphZoomBar 绝对定位锚到本容器右下 */
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
