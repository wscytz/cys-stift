import { describe, it, expect } from 'vitest'
import type { Card } from '@cys-stift/domain'
import { recommendRelations } from '../relation-recommend'

/**
 * relation-recommend 单测。覆盖四个打分信号 + 排除/排序/截断/类型建议。
 * card() 工厂对齐 relation-types.test.ts 的最小 Card 造法。
 */
function card(id: string, title: string, body = '', tags: string[] = []): Card {
  return {
    id: id as never,
    title,
    body,
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: tags.map((value) => ({ value, color: 'var(--color-red)' })),
    pinned: false,
    archived: false,
  }
}

describe('recommendRelations — title-mention (中文子串主力信号)', () => {
  it('current 正文提到 other 标题 → 推荐 title-mention', () => {
    const cur = card('1', '做早餐', '今天先看看 做早餐 的步骤再说')
    const other = card('2', '做早餐', '煎蛋烤面包')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(1)
    expect(r[0]!.otherCardId).toBe('2')
    expect(r[0]!.reasons).toContain('title-mention')
  })

  it('other 正文提到 current 标题(反向)→ 也推荐', () => {
    const cur = card('1', '做早餐', '随便')
    const other = card('2', '笔记', '参考 做早餐 流程改进')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(1)
    expect(r[0]!.reasons).toContain('title-mention')
  })

  it('标题短于 2 字不参与互提(避免单字误命中)', () => {
    const cur = card('1', '吃', '我吃了一个苹果') // 单字标题
    const other = card('2', '吃', '')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(0)
  })
})

describe('recommendRelations — title-similar (Jaccard)', () => {
  it('英文标题高重合 → title-similar', () => {
    const cur = card('1', 'React hooks', '')
    const other = card('2', 'React hooks patterns', '')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(1)
    expect(r[0]!.reasons).toContain('title-similar')
  })

  it('标题完全无关 → 不因标题相似推荐', () => {
    const cur = card('1', 'React hooks', '')
    const other = card('2', 'Cooking pasta recipe', '')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(0)
  })
})

describe('recommendRelations — shared-tag', () => {
  it('共享标签 → shared-tag,每共享一个加分', () => {
    const cur = card('1', 'A', '', ['react', 'ui'])
    const other = card('2', 'B', '', ['react', 'ui', 'misc'])
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(1)
    expect(r[0]!.reasons).toContain('shared-tag')
    // 2 个共享标签 → 1.5 * 2 = 3
    expect(r[0]!.score).toBe(3)
  })

  it('无共享标签 → 不因标签推荐', () => {
    const cur = card('1', 'A', '', ['react'])
    const other = card('2', 'B', '', ['vue'])
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(0)
  })
})

describe('recommendRelations — content-overlap (英文词)', () => {
  it('正文共享 ≥3 个英文词 → content-overlap', () => {
    const cur = card('1', 'A', 'react hooks state management patterns')
    const other = card('2', 'B', 'react hooks state in practice')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(1)
    expect(r[0]!.reasons).toContain('content-overlap')
  })

  it('正文共享不足 3 词 → 不推荐', () => {
    const cur = card('1', 'A', 'react hooks today')
    const other = card('2', 'B', 'react hooks') // 只共享 2 词
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(0)
  })
})

describe('recommendRelations — 排除/排序/截断', () => {
  it('excludeCardIds 排除已连接的卡', () => {
    const cur = card('1', 'React hooks', '')
    const connected = card('2', 'React hooks tips', '')
    const fresh = card('3', 'React hooks guide', '')
    const r = recommendRelations(cur, [connected, fresh], {
      excludeCardIds: new Set(['2']),
    })
    expect(r.map((x) => x.otherCardId)).toEqual(['3'])
  })

  it('软删除卡跳过', () => {
    const cur = card('1', 'React hooks', '')
    const dead = card('2', 'React hooks tips', '')
    dead.deletedAt = new Date()
    const r = recommendRelations(cur, [dead])
    expect(r).toHaveLength(0)
  })

  it('自己跳过', () => {
    const cur = card('1', 'React hooks', 'React hooks are great')
    const r = recommendRelations(cur, [cur])
    expect(r).toHaveLength(0)
  })

  it('按 score desc 排序', () => {
    const cur = card('1', '做早餐', '做早餐 步骤', ['cook'])
    // high: 标题互提(3) + 标签(1.5) = 4.5
    const high = card('2', '做早餐', 'x', ['cook'])
    // low: 仅标题互提(3)
    const low = card('3', '做早餐', 'x')
    const r = recommendRelations(cur, [low, high])
    expect(r.map((x) => x.otherCardId)).toEqual(['2', '3'])
    expect(r[0]!.score).toBeGreaterThan(r[1]!.score)
  })

  it('limit 截断', () => {
    const cur = card('1', '做早餐', '做早餐 做早餐 做早餐')
    const others = Array.from({ length: 8 }, (_, i) => card(String(2 + i), '做早餐', ''))
    const r = recommendRelations(cur, others, { limit: 3 })
    expect(r).toHaveLength(3)
  })

  it('无任何信号 → 空', () => {
    const cur = card('1', '完全独立', '没有共同点')
    const other = card('2', '毫不相干', '各自孤立')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(0)
  })
})

describe('recommendRelations — 建议关系类型', () => {
  it('关键词命中 blocks → suggestedType = blocks', () => {
    const cur = card('1', '登录功能', '这个 todo 阻塞 了上线')
    const other = card('2', '登录功能', '修复 blocker')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(1)
    expect(r[0]!.suggestedType.id).toBe('blocks')
  })

  it('无关键词命中 → 默认 related-to', () => {
    const cur = card('1', '做早餐', '做早餐 的方法')
    const other = card('2', '做早餐', '煎蛋')
    const r = recommendRelations(cur, [other])
    expect(r).toHaveLength(1)
    expect(r[0]!.suggestedType.id).toBe('related-to')
  })
})
