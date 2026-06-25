import { describe, it, expect } from 'vitest'
import { groupCardsByDay } from '../group-by-day'

/**
 * groupCardsByDay — 按 getDate 返回的 Date 的 UTC 日(ISO yyyy-mm-dd)分组。
 * 纯函数,零依赖;Map 保输入序(调用方先排序即得日倒/正序)。
 * spec: docs/superpowers/specs/2026-06-25-timeline-view-design.md §4
 */
describe('groupCardsByDay — UTC day grouping', () => {
  it('空输入 → 空 Map', () => {
    const groups = groupCardsByDay([], () => new Date())
    expect(groups).toBeInstanceOf(Map)
    expect(groups.size).toBe(0)
  })

  it('单日分组:同日多卡进同一个 bucket', () => {
    const day = new Date('2026-06-25T12:00:00.000Z')
    const cards = [{ id: 'a', d: day }, { id: 'b', d: day }]
    const groups = groupCardsByDay(cards, (c) => c.d)
    expect(groups.size).toBe(1)
    const bucket = groups.get('2026-06-25')
    expect(bucket?.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('多日:Map key 顺序 = 输入顺序(先倒序排好 → 日倒序)', () => {
    const d1 = new Date('2026-06-25T00:00:00.000Z')
    const d2 = new Date('2026-06-24T00:00:00.000Z')
    const d3 = new Date('2026-06-23T00:00:00.000Z')
    // 输入已按 capturedAt 倒序
    const cards = [
      { id: 'a', d: d1 },
      { id: 'b', d: d2 },
      { id: 'c', d: d3 },
    ]
    const groups = groupCardsByDay(cards, (c) => c.d)
    expect([...groups.keys()]).toEqual(['2026-06-25', '2026-06-24', '2026-06-23'])
  })

  it('同日多卡保输入顺序(bucket 内)', () => {
    const day = new Date('2026-06-25T05:00:00.000Z')
    const cards = [
      { id: 'first', d: day },
      { id: 'second', d: day },
      { id: 'third', d: day },
    ]
    const groups = groupCardsByDay(cards, (c) => c.d)
    expect(groups.get('2026-06-25')?.map((c) => c.id)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('UTC 日边界:23:59Z 与次日 00:01Z 进不同 bucket', () => {
    const late = new Date('2026-06-25T23:59:00.000Z')
    const earlyNext = new Date('2026-06-26T00:01:00.000Z')
    const cards = [
      { id: 'late', d: late },
      { id: 'early', d: earlyNext },
    ]
    const groups = groupCardsByDay(cards, (c) => c.d)
    expect(groups.size).toBe(2)
    expect(groups.get('2026-06-25')?.map((c) => c.id)).toEqual(['late'])
    expect(groups.get('2026-06-26')?.map((c) => c.id)).toEqual(['early'])
  })
})
