import type { CardType } from '@cys-stift/domain'
import type { GraphNode, GraphEdge } from './aggregate-edges'

export interface GraphFilter {
  hideArchived: boolean
  tag: string | null
  type: CardType | null
}

export function filterGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  filter: GraphFilter,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const filtered = nodes.filter((n) => {
    if (filter.hideArchived && n.archived) return false
    if (filter.tag && n.tagColor !== filter.tag) return false
    if (filter.type && n.type !== filter.type) return false
    return true
  })
  const idSet = new Set(filtered.map((n) => n.id))
  const filteredEdges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to))
  return { nodes: filtered, edges: filteredEdges }
}
