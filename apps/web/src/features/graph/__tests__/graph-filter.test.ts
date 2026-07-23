import { describe, it, expect } from 'vitest'
import { filterGraph, type GraphFilter } from '../graph-filter'
import type { GraphNode, GraphEdge } from '../aggregate-edges'
import type { CardType } from '@cys-stift/domain'

function node(over: Partial<GraphNode>): GraphNode {
  return {
    id: 'n',
    title: '',
    type: 'note',
    tagColor: null,
    archived: false,
    hrefTargets: [],
    ...over,
  }
}

function edge(from: string, to: string): GraphEdge {
  return {
    from,
    to,
    signature: { color: 'black', dash: 'solid', arrowhead: 'arrow' },
    relationType: null,
    isWikilink: false,
    arrowId: `${from}->${to}`,
    canvasId: 'c1' as never,
  }
}

const noop: GraphFilter = { hideArchived: false, tag: null, type: null }

describe('filterGraph', () => {
  it('returns all nodes/edges when filter is no-op', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' })]
    const edges = [edge('a', 'b')]
    const res = filterGraph(nodes, edges, noop)
    expect(res.nodes).toHaveLength(2)
    expect(res.edges).toHaveLength(1)
  })

  it('hideArchived removes archived nodes and their dangling edges', () => {
    const nodes = [
      node({ id: 'a', archived: false }),
      node({ id: 'b', archived: true }),
      node({ id: 'c', archived: false }),
    ]
    const edges = [edge('a', 'b'), edge('a', 'c')] // a-b 悬空(b 被去)
    const res = filterGraph(nodes, edges, { hideArchived: true, tag: null, type: null })
    expect(res.nodes.map((n) => n.id)).toEqual(['a', 'c'])
    expect(res.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['a->c'])
  })

  it('tag filter keeps only nodes whose tagColor matches', () => {
    const nodes = [
      node({ id: 'a', tagColor: 'var(--color-red)' }),
      node({ id: 'b', tagColor: 'var(--color-blue)' }),
      node({ id: 'c', tagColor: null }),
    ]
    const edges = [edge('a', 'b'), edge('a', 'c')]
    const res = filterGraph(nodes, edges, { hideArchived: false, tag: 'var(--color-red)', type: null })
    expect(res.nodes.map((n) => n.id)).toEqual(['a'])
    expect(res.edges).toHaveLength(0) // a 的邻居都被过滤 → 全悬空
  })

  it('type filter keeps only nodes whose type matches', () => {
    const types: CardType[] = ['note', 'image', 'link', 'code', 'quote']
    const nodes = types.map((t) => node({ id: t, type: t }))
    const res = filterGraph(nodes, [], { hideArchived: false, tag: null, type: 'code' })
    expect(res.nodes.map((n) => n.id)).toEqual(['code'])
  })

  it('keeps an edge only if both endpoints survive node filtering', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c', archived: true })]
    const edges = [
      edge('a', 'b'), // 双端都在 → 留
      edge('a', 'c'), // c 被去 → 弃
      edge('b', 'c'), // c 被去 → 弃
    ]
    const res = filterGraph(nodes, edges, { hideArchived: true, tag: null, type: null })
    expect(res.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['a->b'])
  })
})
