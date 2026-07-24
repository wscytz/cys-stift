import { describe, it, expect } from 'vitest'
import { v8ToDomainFields, sameTagValues, sameLinkUrls } from '../v8-fields'

/**
 * v8-fields 共享转换的单测。这是批次① 修复的关键:三处落库路径
 * (canvas-host-builder / agent-confirm-card / canvas/page)都走它,
 * 杜绝 v8 字段(@type/@tags/@links/@code/@quote)静默丢弃。
 */
describe('v8ToDomainFields', () => {
  it('tags 值列表 → TagRef[](颜色走 stableTagColor)', () => {
    const r = v8ToDomainFields({ tags: ['前端', '实验'] })
    expect(r.tags).toHaveLength(2)
    expect(r.tags?.[0]).toMatchObject({ value: '前端' })
    expect(typeof r.tags?.[0]?.color).toBe('string')
    expect(r.tags?.[1]).toMatchObject({ value: '实验' })
  })

  it('links URL 列表 → LinkPreview[](fetchedAt=now)', () => {
    const r = v8ToDomainFields({ links: ['https://a.com', 'https://b.com'] })
    expect(r.links).toHaveLength(2)
    expect(r.links?.[0]?.url).toBe('https://a.com')
    expect(r.links?.[1]?.url).toBe('https://b.com')
    expect(r.links?.[0]?.fetchedAt).toBeInstanceOf(Date)
  })

  it('code/quotes/cardType 直传(codeSnippets/quotes/type 键名对齐 domain)', () => {
    const code = [{ language: 'ts', code: 'const x = 1', caption: '示例' }]
    const quotes = [{ text: '简单优于复杂', by: '设计原则' }]
    const r = v8ToDomainFields({ cardType: 'code', code, quotes })
    expect(r.type).toBe('code')
    expect(r.codeSnippets).toEqual(code)
    expect(r.quotes).toEqual(quotes)
  })

  it('缺省字段不出现在结果里(缺省 = apply 侧"缺省不改")', () => {
    const r = v8ToDomainFields({})
    expect(r.type).toBeUndefined()
    expect(r.tags).toBeUndefined()
    expect(r.links).toBeUndefined()
    expect(r.codeSnippets).toBeUndefined()
    expect(r.quotes).toBeUndefined()
  })
})

describe('sameTagValues / sameLinkUrls(update diff:相同则不重写,保用户自定义色/已抓 title)', () => {
  it('tags 值序列相同 → true(忽略颜色,DSL 只携值)', () => {
    expect(
      sameTagValues([{ value: 'a', color: 'var(--color-red)' }], [{ value: 'a', color: 'var(--color-blue)' }]),
    ).toBe(true)
  })
  it('tags 值不同 → false', () => {
    expect(
      sameTagValues([{ value: 'a', color: 'var(--color-red)' }], [{ value: 'b', color: 'var(--color-red)' }]),
    ).toBe(false)
  })
  it('tags 长度不同 → false', () => {
    expect(sameTagValues([{ value: 'a', color: 'var(--color-red)' }], [])).toBe(false)
  })
  it('links URL 序列相同 → true(忽略 fetchedAt)', () => {
    expect(
      sameLinkUrls([{ url: 'https://a', fetchedAt: new Date(1) }], [{ url: 'https://a', fetchedAt: new Date(2) }]),
    ).toBe(true)
  })
  it('links URL 不同 → false', () => {
    expect(
      sameLinkUrls([{ url: 'https://a', fetchedAt: new Date(1) }], [{ url: 'https://b', fetchedAt: new Date(2) }]),
    ).toBe(false)
  })
})
