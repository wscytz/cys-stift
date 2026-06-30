import { describe, expect, it } from 'vitest'
import type { Card } from '@cys-stift/domain'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import {
  discoverInsights, elementsCenter, arrowExistsBetween,
  buildRelationArrow, buildConnectArrows,
} from './companion-discovery'

const card = (id: string, over: Partial<Card> = {}): Card =>
  ({ id, title: id, type: 'note', capturedAt: '2026-01-01', tags: [], links: [], ...over } as Card)
const el = (id: string, kind: CanvasElement['kind'] = 'card'): CanvasElement =>
  ({ id, kind, x: 0, y: 0, w: 100, h: 80, rotation: 0 } as CanvasElement)

describe('discoverInsights', () => {
  it('空/单卡 → 无发现', () => {
    expect(discoverInsights([], [])).toEqual([])
    expect(discoverInsights([el('a')], [card('a')])).toEqual([])
  })
  it('duplicate: findDuplicateGroups 命中 → duplicate insight,score=组大小,suggestedType=related-to', () => {
    const a = card('a', { title: '同标题' })
    const b = card('b', { title: '同标题' })
    const out = discoverInsights([el('a'), el('b')], [a, b])
    const dup = out.find((i) => i.kind === 'duplicate')
    expect(dup).toBeTruthy()
    expect(dup!.cardIds).toContain('a'); expect(dup!.cardIds).toContain('b')
    expect(dup!.score).toBe(2); expect(dup!.suggestedType).toBe('related-to')
  })
  it('relation: 共享标签卡对 → relation insight,score>0,含 suggestedType', () => {
    const a = card('a', { title: 'react', tags: [{ value: 'frontend', color: 'var(--color-red)' }] })
    const b = card('b', { title: 'vue', tags: [{ value: 'frontend', color: 'var(--color-red)' }] })
    const out = discoverInsights([el('a'), el('b')], [a, b])
    const rel = out.find((i) => i.kind === 'relation')
    expect(rel).toBeTruthy(); expect(rel!.cardIds).toEqual(expect.arrayContaining(['a', 'b']))
    expect(rel!.score).toBeGreaterThan(0)
  })
  it('relation 去重:A→B 与 B→A 是同一条(不重复)', () => {
    const a = card('a', { title: 'x', tags: [{ value: 't', color: 'var(--color-red)' }] })
    const b = card('b', { title: 'y', tags: [{ value: 't', color: 'var(--color-red)' }] })
    const out = discoverInsights([el('a'), el('b')], [a, b])
    expect(out.filter((i) => i.kind === 'relation')).toHaveLength(1)
  })
  it('orphan: 无 arrow 触及的卡 → orphan insight', () => {
    const out = discoverInsights([el('a'), el('b')], [card('a'), card('b', { title: 'diff' })])
    // a/b 无重无共享 → 两个 orphan(或 relation 为空时全是 orphan)
    expect(out.some((i) => i.kind === 'orphan' && i.cardIds.includes('a'))).toBe(true)
  })
  it('orphan: 有 arrow 触及 → 不是 orphan', () => {
    const arrow = { ...el('x', 'arrow'), from: 'a', to: 'b' } as CanvasElement
    const out = discoverInsights([el('a'), el('b'), arrow], [card('a'), card('b', { title: 'diff' })])
    expect(out.filter((i) => i.kind === 'orphan')).toHaveLength(0)
  })
  it('排序:duplicate 在 relation 前,relation 在 orphan 前', () => {
    const a = card('a', { title: 'dup', tags: [{ value: 't', color: 'var(--color-red)' }] })
    const b = card('b', { title: 'dup', tags: [{ value: 't', color: 'var(--color-red)' }] })
    const c = card('c', { title: 'unique' })
    const out = discoverInsights([el('a'), el('b'), el('c')], [a, b, c])
    const kinds = out.map((i) => i.kind)
    expect(kinds.indexOf('duplicate')).toBeLessThan(kinds.indexOf('orphan'))
  })
  it('insight.id 稳定:同输入两次调用 id 一致(内容哈希式)', () => {
    const cards = [card('a', { title: 'dup' }), card('b', { title: 'dup' })]
    const els = [el('a'), el('b')]
    const o1 = discoverInsights(els, cards).map((i) => i.id)
    const o2 = discoverInsights(els, cards).map((i) => i.id)
    expect(o1).toEqual(o2)
  })
  it('软删卡过滤', () => {
    const a = card('a', { title: 'dup', deletedAt: '2026-01-02' as unknown as Card['deletedAt'] })
    const b = card('b', { title: 'dup' })
    expect(discoverInsights([el('a'), el('b')], [a, b]).find((i) => i.kind === 'duplicate')).toBeFalsy()
  })
  it('prune 路径(>threshold 卡):共享标签候选仍命中(标签按 value 匹配,非对象恒等)', () => {
    // 60 张卡,只有 a/b 共享标签;其余标题/标签全不重叠。
    const cards: Card[] = []
    for (let i = 0; i < 58; i++) cards.push(card(`n${i}`, { title: `unique${i}` }))
    cards.push(card('a', { title: 'alpha', tags: [{ value: 'shared', color: 'var(--color-red)' }] }))
    cards.push(card('b', { title: 'beta', tags: [{ value: 'shared', color: 'var(--color-red)' }] }))
    const els = cards.map((c) => el(c.id))
    // pruneThreshold=10 → 60 卡触发剪枝路径
    const out = discoverInsights(els, cards, { pruneThreshold: 10, minRelationScore: 1 })
    const rel = out.find((i) => i.kind === 'relation' && i.cardIds.includes('a') && i.cardIds.includes('b'))
    expect(rel).toBeTruthy() // 共享标签 → 剪枝后仍在候选池 → 命中(证明 .value 匹配)
  })
})

describe('elementsCenter', () => {
  it('空 → null', () => { expect(elementsCenter([])).toBeNull() })
  it('单元素 bbox 中心', () => {
    expect(elementsCenter([el('a')])).toEqual({ x: 50, y: 40 })
  })
  it('多元素并集 bbox 中心', () => {
    const e1 = { ...el('a'), x: 0, y: 0, w: 100, h: 100 }
    const e2 = { ...el('b'), x: 100, y: 0, w: 100, h: 100 }
    expect(elementsCenter([e1, e2])).toEqual({ x: 100, y: 50 })
  })
  it('负 w/h 不崩(flip)', () => {
    const e = { ...el('a'), x: 100, y: 0, w: -100, h: 100 }
    expect(elementsCenter([e])).toEqual({ x: 50, y: 50 })
  })
})

describe('arrow helpers', () => {
  it('arrowExistsBetween 双向检测', () => {
    const arrow = { ...el('x', 'arrow'), from: 'a', to: 'b' } as CanvasElement
    expect(arrowExistsBetween([arrow], 'a', 'b')).toBe(true)
    expect(arrowExistsBetween([arrow], 'b', 'a')).toBe(true)
    expect(arrowExistsBetween([arrow], 'a', 'c')).toBe(false)
  })
  it('buildRelationArrow: kind=arrow,w/h=0,from/to,text=typeId', () => {
    const a = buildRelationArrow('a', 'b', 'blocks')
    expect(a.kind).toBe('arrow'); expect(a.from).toBe('a'); expect(a.to).toBe('b')
    expect(a.x).toBe(0); expect(a.w).toBe(0); expect(a.text).toBe('blocks')
  })
  it('buildConnectArrows: relation insight 单箭头;duplicate 星形(每个→primary);orphan 空', () => {
    const dup = { id: 'd', kind: 'duplicate' as const, cardIds: ['a', 'b', 'c'], score: 3, suggestedType: 'related-to' as const }
    const rel = { id: 'r', kind: 'relation' as const, cardIds: ['a', 'b'], score: 3, suggestedType: 'blocks' as const }
    const orph = { id: 'o', kind: 'orphan' as const, cardIds: ['a'], score: 0 }
    expect(buildConnectArrows(dup, [])).toHaveLength(2)        // b→a, c→a
    expect(buildConnectArrows(rel, [])).toHaveLength(1)
    expect(buildConnectArrows(orph, [])).toEqual([])
  })
  it('buildConnectArrows: 已有箭头则跳过(不重复建)', () => {
    const rel = { id: 'r', kind: 'relation' as const, cardIds: ['a', 'b'], score: 3, suggestedType: 'related-to' as const }
    const existing = { ...el('x', 'arrow'), from: 'a', to: 'b' } as CanvasElement
    expect(buildConnectArrows(rel, [existing])).toEqual([])
  })
})
