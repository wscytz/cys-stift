/**
 * D5 tag-ops：聚合 + 改名/改色/删/合 纯函数测试。
 */
import { describe, it, expect } from 'vitest'
import type { Card, TagColor, TagRef } from '@cys-stift/domain'
import { aggregateTags, renameTag, recolorTag, deleteTag, mergeTag } from '../tag-ops'

const RED = 'var(--color-red)' as TagColor
const BLUE = 'var(--color-blue)' as TagColor

function mk(id: string, tags: Array<[string, TagColor]>): Card {
  return {
    id,
    title: id,
    body: '',
    type: 'note',
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: tags.map(([value, color]) => ({ value, color } as TagRef)),
    pinned: false,
    archived: false,
  } as unknown as Card
}

describe('aggregateTags', () => {
  it('按 value 聚合 + count 降序', () => {
    const agg = aggregateTags([
      mk('1', [['a', RED]]),
      mk('2', [['a', RED], ['b', BLUE]]),
      mk('3', []),
    ])
    expect(agg).toEqual([
      { value: 'a', color: RED, count: 2 },
      { value: 'b', color: BLUE, count: 1 },
    ])
  })

  it('color 分歧取多数', () => {
    const agg = aggregateTags([
      mk('1', [['a', RED]]),
      mk('2', [['a', RED]]),
      mk('3', [['a', BLUE]]),
    ])
    expect(agg[0]!.color).toBe(RED)
    expect(agg[0]!.count).toBe(3)
  })

  it('count 同按 value 字典序', () => {
    const agg = aggregateTags([mk('1', [['b', RED]]), mk('2', [['a', BLUE]])])
    expect(agg.map((t) => t.value)).toEqual(['a', 'b'])
  })
})

describe('renameTag', () => {
  it('改名保留 color，只输出受影响卡', () => {
    const changes = renameTag([mk('1', [['a', RED]]), mk('2', [['b', BLUE]])], 'a', 'A')
    expect(changes).toEqual([{ id: '1', tags: [{ value: 'A', color: RED }] }])
  })
  it('oldValue===newValue 无操作', () => {
    expect(renameTag([mk('1', [['a', RED]])], 'a', 'a')).toEqual([])
  })
  it('空 newValue 无操作', () => {
    expect(renameTag([mk('1', [['a', RED]])], 'a', '')).toEqual([])
  })
})

describe('recolorTag', () => {
  it('改色', () => {
    const changes = recolorTag([mk('1', [['a', RED]])], 'a', BLUE)
    expect(changes[0]!.tags).toEqual([{ value: 'a', color: BLUE }])
  })
  it('已是目标色的卡不输出', () => {
    expect(recolorTag([mk('1', [['a', RED]])], 'a', RED)).toEqual([])
  })
})

describe('deleteTag', () => {
  it('移除 value，保留其它 tag', () => {
    const changes = deleteTag([mk('1', [['a', RED], ['b', BLUE]])], 'a')
    expect(changes[0]!.tags).toEqual([{ value: 'b', color: BLUE }])
  })
  it('卡无该 value 不输出', () => {
    expect(deleteTag([mk('1', [['a', RED]])], 'z')).toEqual([])
  })
})

describe('mergeTag', () => {
  it('source → target（移 source，加 target）', () => {
    const changes = mergeTag([mk('1', [['src', RED]])], 'src', { value: 'tgt', color: BLUE })
    expect(changes[0]!.tags).toEqual([{ value: 'tgt', color: BLUE }])
  })
  it('已有 target：移 source，target 用给定 color', () => {
    const changes = mergeTag([mk('1', [['src', RED], ['tgt', RED]])], 'src', {
      value: 'tgt',
      color: BLUE,
    })
    const t = changes[0]!.tags.find((x) => x.value === 'tgt')!
    expect(t.color).toBe(BLUE)
    expect(changes[0]!.tags.find((x) => x.value === 'src')).toBeUndefined()
  })
  it('source===target.value 无操作', () => {
    expect(mergeTag([mk('1', [['a', RED]])], 'a', { value: 'a', color: BLUE })).toEqual([])
  })
  it('只输出含 source 的卡', () => {
    const changes = mergeTag(
      [mk('1', [['src', RED]]), mk('2', [['other', BLUE]])],
      'src',
      { value: 'tgt', color: BLUE },
    )
    expect(changes).toHaveLength(1)
    expect(changes[0]!.id).toBe('1')
  })
})
