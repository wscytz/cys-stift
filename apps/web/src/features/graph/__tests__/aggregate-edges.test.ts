import { describe, it, expect } from 'vitest'
import { aggregateEdges, cardsToNodes } from '../aggregate-edges'
import type { Card } from '@cys-stift/domain'
import type { CanvasFreeformSnapshot } from '@/lib/canvas-freeform-store'

// 构造一个 freeform snapshot,含若干 arrow 元素
function snap(elements: unknown[]): CanvasFreeformSnapshot {
  return { v: 1, app: 'cys-stift', elements: elements as never }
}
function arrow(over: Record<string, unknown>) {
  return { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, text: '', color: 'black', ...over }
}

describe('aggregateEdges', () => {
  it('collects arrows with from/to into GraphEdge', async () => {
    const canvases = [{ id: 'c1' as never }]
    const load = async () => snap([
      arrow({ id: 'a1', from: 'cardA', to: 'cardB', color: 'red', text: 'blocks', dash: 'solid', arrowhead: 'arrow' }),
    ])
    const edges = await aggregateEdges(canvases, load)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ from: 'cardA', to: 'cardB', isWikilink: false })
    expect(edges[0]!.relationType?.id).toBe('blocks')
    expect(edges[0]!.signature).toMatchObject({ color: 'red', dash: 'solid', arrowhead: 'arrow' })
  })

  it('marks wikilink arrows (meta.wikilink===true)', async () => {
    const load = async () => snap([
      arrow({ id: 'a2', from: 'cardA', to: 'cardB', color: 'blue', dash: 'dashed', arrowhead: 'none', meta: { wikilink: true } }),
    ])
    const edges = await aggregateEdges([{ id: 'c1' as never }], load)
    expect(edges[0]!.isWikilink).toBe(true)
    expect(edges[0]!.relationType).toBe(null) // 双链 text 不是 relation id
  })

  it('skips arrows missing from/to', async () => {
    const load = async () => snap([
      arrow({ id: 'a3', from: 'cardA' }), // 无 to
      arrow({ id: 'a4', to: 'cardB' }),   // 无 from
    ])
    const edges = await aggregateEdges([{ id: 'c1' as never }], load)
    expect(edges).toHaveLength(0)
  })

  it('merges multiple canvases + dedupes same from/to/relationType', async () => {
    const canvases = [{ id: 'c1' as never }, { id: 'c2' as never }]
    const load = async (id: unknown) => {
      if (String(id) === 'c1') return snap([arrow({ id: 'x1', from: 'A', to: 'B', color: 'red', text: 'blocks' })])
      return snap([arrow({ id: 'x2', from: 'A', to: 'B', color: 'red', text: 'blocks' })]) // 同签名 → 去重
    }
    const edges = await aggregateEdges(canvases, load)
    expect(edges).toHaveLength(1) // 去重
  })

  it('keeps different relationTypes between same pair', async () => {
    const canvases = [{ id: 'c1' as never }, { id: 'c2' as never }]
    const load = async (id: unknown) => {
      if (String(id) === 'c1') return snap([arrow({ id: 'x1', from: 'A', to: 'B', color: 'red', text: 'blocks' })])
      return snap([arrow({ id: 'x2', from: 'A', to: 'B', color: 'grey', text: 'related-to' })]) // 不同签名 → 保留
    }
    const edges = await aggregateEdges(canvases, load)
    expect(edges).toHaveLength(2)
  })

  it('skips non-arrow elements', async () => {
    const load = async () => snap([
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    ])
    const edges = await aggregateEdges([{ id: 'c1' as never }], load)
    expect(edges).toHaveLength(0)
  })
})

describe('cardsToNodes', () => {
  function card(over: Partial<Card>): Card {
    return {
      id: 'x' as never, title: '', body: '', type: 'note', tags: [], links: [],
      codeSnippets: [], quotes: [], media: [], source: { kind: 'manual', deviceId: 'web' } as never,
      capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), archived: false, pinned: false,
      ...over,
    } as Card
  }
  it('derives tagColor from first tag', () => {
    const nodes = cardsToNodes([card({ id: 'c1' as never, tags: [{ value: 't', color: 'var(--color-red)' } as never] })])
    expect(nodes[0]!.tagColor).toBe('var(--color-red)')
  })
  it('tagColor null when no tags', () => {
    const nodes = cardsToNodes([card({ id: 'c2' as never })])
    expect(nodes[0]!.tagColor).toBeNull()
  })
  it('preserves archived + type + title', () => {
    const nodes = cardsToNodes([card({ id: 'c3' as never, title: 'T', type: 'code', archived: true })])
    expect(nodes[0]).toMatchObject({ id: 'c3', title: 'T', type: 'code', archived: true })
  })
})
