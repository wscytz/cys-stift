/**
 * D4 workbench-grouping 纯函数:canvas/type/tag 分组 + pinned 提取。
 */
import { describe, it, expect } from 'vitest'
import type { Card, CanvasId, TagColor, TagRef } from '@cys-stift/domain'
import {
  groupByCanvas,
  groupByType,
  groupByTag,
  extractPinned,
} from '../workbench-grouping'

const RED = 'var(--color-red)' as TagColor

function mk(
  id: string,
  opts: {
    canvasId?: string
    type?: Card['type']
    tags?: Array<[string, TagColor]>
    pinned?: boolean
    title?: string
  } = {},
): Card {
  const { canvasId, type = 'note', tags = [], pinned = false, title = id } = opts
  return {
    id,
    title,
    body: '',
    type,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: tags.map(([value, color]) => ({ value, color } as TagRef)),
    pinned,
    archived: false,
    canvasPosition: canvasId
      ? { canvasId: canvasId as CanvasId, x: 0, y: 0, w: 100, h: 100, z: 0 }
      : undefined,
  } as unknown as Card
}

describe('groupByCanvas', () => {
  it('按 canvasId 分组,顺序跟画布列表', () => {
    const cards = [
      mk('1', { canvasId: 'c2' }),
      mk('2', { canvasId: 'c1' }),
      mk('3', { canvasId: 'c1' }),
    ]
    const names = new Map<CanvasId, string>([
      ['c1' as CanvasId, '画布一'],
      ['c2' as CanvasId, '画布二'],
    ])
    const sections = groupByCanvas(cards, names, '收件箱', '未知')
    expect(sections.map((s) => s.label)).toEqual(['画布二', '画布一'])
    expect(sections[0]!.cards.map((c) => c.id)).toEqual(['1'])
    expect(sections[1]!.cards.map((c) => c.id)).toEqual(['2', '3'])
  })

  it('无 canvasPosition 的卡进收件箱区(末尾,isInbox)', () => {
    const cards = [mk('1', { canvasId: 'c1' }), mk('2', {})]
    const names = new Map<CanvasId, string>([['c1' as CanvasId, '画布一']])
    const sections = groupByCanvas(cards, names, '收件箱', '未知')
    expect(sections).toHaveLength(2)
    expect(sections[1]!.isInbox).toBe(true)
    expect(sections[1]!.label).toBe('收件箱')
    expect(sections[1]!.cards.map((c) => c.id)).toEqual(['2'])
  })

  it('收件箱为空时不产收件箱区', () => {
    const cards = [mk('1', { canvasId: 'c1' })]
    const names = new Map<CanvasId, string>([['c1' as CanvasId, '画布一']])
    const sections = groupByCanvas(cards, names, '收件箱', '未知')
    expect(sections.every((s) => !s.isInbox)).toBe(true)
  })

  it('未知 canvasId → 兜底名', () => {
    const cards = [mk('1', { canvasId: 'ghost' })]
    const sections = groupByCanvas(cards, new Map(), '收件箱', '(已删画布)')
    expect(sections[0]!.label).toBe('(已删画布)')
  })

  it('色条循环分配(>4 画布绕回)', () => {
    const cards = Array.from({ length: 5 }, (_, i) => mk(`c${i}`, { canvasId: `cv${i}` }))
    // 空 names → 5 个画布各一卡,色条索引 0..4 % 4
    const sections = groupByCanvas(cards, new Map(), 'inbox', '?')
    expect(sections).toHaveLength(5)
    expect(sections[4]!.colorBar).toBe(sections[0]!.colorBar) // index 4 % 4 === 0
  })
})

describe('groupByType', () => {
  it('按 type 分组', () => {
    const cards = [mk('1', { type: 'code' }), mk('2', { type: 'note' }), mk('3', { type: 'code' })]
    const sections = groupByType(cards, '其他')
    const labels = sections.map((s) => s.label)
    expect(labels).toContain('code')
    expect(labels).toContain('note')
    const codeSection = sections.find((s) => s.label === 'code')!
    expect(codeSection.cards.map((c) => c.id)).toEqual(['1', '3'])
  })

  it('code 类型色条 = blue', () => {
    const sections = groupByType([mk('1', { type: 'code' })], '其他')
    expect(sections[0]!.colorBar).toBe('var(--color-blue)')
  })
})

describe('groupByTag', () => {
  it('selectedTags 为空 → 空数组(未选标签不分组)', () => {
    expect(groupByTag([mk('1', { tags: [['a', RED]] })], [], new Map())).toEqual([])
  })

  it('任一匹配:一卡多标签可进多分区', () => {
    const cards = [
      mk('1', { tags: [['a', RED], ['b', RED]] }),
      mk('2', { tags: [['a', RED]] }),
    ]
    const sections = groupByTag(cards, ['a', 'b'], new Map())
    expect(sections.map((s) => s.label)).toEqual(['a', 'b']) // 顺序跟 selectedTags
    expect(sections[0]!.cards.map((c) => c.id)).toEqual(['1', '2'])
    expect(sections[1]!.cards.map((c) => c.id)).toEqual(['1']) // 卡1 也在 b
  })

  it('selectedTags 里无卡匹配的 tag → 不产分区', () => {
    const cards = [mk('1', { tags: [['a', RED]] })]
    const sections = groupByTag(cards, ['a', '无匹配'], new Map())
    expect(sections).toHaveLength(1)
    expect(sections[0]!.label).toBe('a')
  })
})

describe('extractPinned', () => {
  it('pinned 进 pinned[],其余进 rest[]', () => {
    const cards = [mk('1', { pinned: true }), mk('2', {}), mk('3', { pinned: true })]
    const { pinned, rest } = extractPinned(cards)
    expect(pinned.map((c) => c.id)).toEqual(['1', '3'])
    expect(rest.map((c) => c.id)).toEqual(['2'])
  })

  it('无 pinned → pinned 空,rest 全量', () => {
    const cards = [mk('1', {}), mk('2', {})]
    const { pinned, rest } = extractPinned(cards)
    expect(pinned).toEqual([])
    expect(rest).toHaveLength(2)
  })
})
