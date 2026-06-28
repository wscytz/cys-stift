import type { Card, CardType, CanvasId } from '@cys-stift/domain'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import type { CanvasFreeformSnapshot } from '@/lib/canvas-freeform-store'
import { inferRelationType, type RelationType } from '@/features/canvas/relation-types'

export interface GraphEdge {
  from: string
  to: string
  signature: { color: string; dash: 'solid' | 'dashed' | 'dotted'; arrowhead: 'arrow' | 'triangle' | 'none' }
  relationType: RelationType | null
  isWikilink: boolean
  arrowId: string
  canvasId: CanvasId
}

export interface GraphNode {
  id: string
  title: string
  type: CardType
  tagColor: string | null
  archived: boolean
}

// 双链标记:wiki-links.ts 的 syncWikiLinkArrows 给 arrow 设 meta.wikilink===true。
// CanvasElement.meta 已类型化为 Record<string, unknown> | undefined,直接读 wikilink。
function isWikilinkArrow(el: CanvasElement): boolean {
  return el.meta?.wikilink === true
}

/**
 * 遍历所有画布 freeform,收集 arrow 元素 → GraphEdge[]。
 * 双链(references 签名 + meta.wikilink)和关系箭头都进;去重同 from/to/relationType。
 * loadFreeform 注入(解耦,单测传 mock);web 调用传 canvasFreeformStore.load。
 */
export async function aggregateEdges(
  canvases: { id: CanvasId }[],
  loadFreeform: (id: CanvasId) => Promise<CanvasFreeformSnapshot | null>,
): Promise<GraphEdge[]> {
  const snaps = await Promise.all(
    canvases.map(async (c) => ({ id: c.id, snap: await loadFreeform(c.id) })),
  )
  const seen = new Set<string>()
  const edges: GraphEdge[] = []
  for (const { id: canvasId, snap } of snaps) {
    if (!snap) continue
    for (const el of snap.elements) {
      if (el.kind !== 'arrow') continue
      const from = el.from
      const to = el.to
      if (!from || !to) continue
      const rt = inferRelationType(el)
      const wikilink = isWikilinkArrow(el)
      // 去重键:from/to/relationType(或 wikilink)
      const dedupKey = `${from}->${to}|${rt?.id ?? (wikilink ? 'wikilink' : 'none')}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)
      edges.push({
        from,
        to,
        signature: {
          color: el.color ?? 'black',
          dash: el.dash ?? 'solid',
          arrowhead: el.arrowhead ?? 'none',
        },
        relationType: rt,
        isWikilink: wikilink,
        arrowId: el.id,
        canvasId,
      })
    }
  }
  return edges
}

/** Card[] → GraphNode[](主标签色 = tags[0]?.color)。 */
export function cardsToNodes(cards: Card[]): GraphNode[] {
  return cards.map((c) => ({
    id: String(c.id),
    title: c.title,
    type: c.type,
    tagColor: c.tags?.[0]?.color ?? null,
    archived: c.archived,
  }))
}
