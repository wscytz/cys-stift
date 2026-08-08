import { describe, it, expect } from 'vitest'
import type { Card } from '@cys-stift/domain'
import {
  applySearchFilters,
  collectTagValues,
  DEFAULT_SEARCH_FILTER,
} from '../search-filter'

// ── 为什么有这个文件 ──────────────────────────────────────────────────────────
// B-3「收敛找回」把 tags/timeline/archive 的找回维度收敛进 /search 的筛选框架。
// applySearchFilters 是纯函数(状态/tags any-match/时间),单测守语义精度——
// 三个维度各自正确 + 叠加正确,避免回归(尤其「空 tags 不过滤」「时间按 capturedAt」)。

function makeCard(over: Partial<Omit<Card, 'id'>> & { id?: string } = {}): Card {
  return {
    id: 'c',
    title: 'T',
    body: '',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    tags: [],
    source: { kind: 'manual', deviceId: 'd' } as never,
    capturedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    pinned: false,
    archived: false,
    ...over,
  } as unknown as Card
}

const NOW = Date.parse('2026-03-01T00:00:00Z')

describe('applySearchFilters — 状态筛选', () => {
  it('默认 filter 全保留(不改现行为)', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b', archived: true })]
    expect(applySearchFilters(cards, DEFAULT_SEARCH_FILTER, NOW).map((c) => c.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('status=active 只留未归档', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b', archived: true })]
    const out = applySearchFilters(cards, { ...DEFAULT_SEARCH_FILTER, status: 'active' }, NOW)
    expect(out.map((c) => c.id)).toEqual(['a'])
  })

  it('status=archived 只留归档', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b', archived: true })]
    const out = applySearchFilters(cards, { ...DEFAULT_SEARCH_FILTER, status: 'archived' }, NOW)
    expect(out.map((c) => c.id)).toEqual(['b'])
  })
})

describe('applySearchFilters — tags any-match', () => {
  it('选中任一 tag 即命中', () => {
    const cards = [
      makeCard({ id: 'a', tags: [{ value: 'x', color: 'red' } as never] }),
      makeCard({ id: 'b', tags: [{ value: 'y', color: 'red' } as never] }),
      makeCard({ id: 'c', tags: [] }),
    ]
    const out = applySearchFilters(cards, { ...DEFAULT_SEARCH_FILTER, tags: ['x', 'y'] }, NOW)
    expect(out.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('空 tags 选择 = 不过滤', () => {
    const cards = [
      makeCard({ id: 'a', tags: [{ value: 'x', color: 'red' } as never] }),
      makeCard({ id: 'b', tags: [] }),
    ]
    expect(applySearchFilters(cards, DEFAULT_SEARCH_FILTER, NOW)).toHaveLength(2)
  })
})

describe('applySearchFilters — 时间(capturedAt 截止)', () => {
  it('30d 只留近 30 天内的', () => {
    const cards = [
      makeCard({ id: 'recent', capturedAt: new Date('2026-02-15T00:00:00Z') }),
      makeCard({ id: 'old', capturedAt: new Date('2025-12-01T00:00:00Z') }),
    ]
    const out = applySearchFilters(cards, { ...DEFAULT_SEARCH_FILTER, timeRange: '30d' }, NOW)
    expect(out.map((c) => c.id)).toEqual(['recent'])
  })

  it('all 不过滤时间', () => {
    const cards = [
      makeCard({ id: 'recent', capturedAt: new Date('2026-02-15T00:00:00Z') }),
      makeCard({ id: 'old', capturedAt: new Date('2025-12-01T00:00:00Z') }),
    ]
    expect(applySearchFilters(cards, DEFAULT_SEARCH_FILTER, NOW)).toHaveLength(2)
  })
})

describe('applySearchFilters — 三维叠加', () => {
  it('active + tag + 30d 全命中才算', () => {
    const cards = [
      makeCard({
        id: 'a',
        archived: false,
        tags: [{ value: 'x', color: 'red' } as never],
        capturedAt: new Date('2026-02-15T00:00:00Z'),
      }),
      makeCard({
        id: 'b',
        archived: true,
        tags: [{ value: 'x', color: 'red' } as never],
        capturedAt: new Date('2026-02-15T00:00:00Z'),
      }),
      makeCard({
        id: 'c',
        archived: false,
        tags: [{ value: 'x', color: 'red' } as never],
        capturedAt: new Date('2025-12-01T00:00:00Z'),
      }),
      makeCard({
        id: 'd',
        archived: false,
        tags: [],
        capturedAt: new Date('2026-02-15T00:00:00Z'),
      }),
    ]
    const out = applySearchFilters(cards, { tags: ['x'], status: 'active', timeRange: '30d' }, NOW)
    expect(out.map((c) => c.id)).toEqual(['a'])
  })
})

describe('collectTagValues', () => {
  it('去重 + 排序', () => {
    const cards = [
      makeCard({ tags: [{ value: 'b', color: 'red' } as never, { value: 'a', color: 'blue' } as never] }),
      makeCard({ tags: [{ value: 'a', color: 'red' } as never] }),
    ]
    expect(collectTagValues(cards)).toEqual(['a', 'b'])
  })
})
