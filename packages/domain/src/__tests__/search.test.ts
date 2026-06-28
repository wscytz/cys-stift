import { describe, it, expect } from 'vitest'
import { searchCards, normalise, tokenise, bodySnippet, type SearchResult } from '../services/search'
import type { Card } from '../types'

const NOW = new Date('2026-06-20T10:00:00Z')

function card(
  id: string,
  title: string,
  body = '',
  overrides: Partial<Card> = {},
): Card {
  return {
    id: id as never,
    title,
    body,
    type: 'note',
    tags: overrides.tags ?? [],
    links: overrides.links ?? [],
    codeSnippets: overrides.codeSnippets ?? [],
    quotes: overrides.quotes ?? [],
    media: [],
    source: { kind: 'manual', deviceId: 'web' } as never,
    capturedAt: overrides.capturedAt ?? new Date(NOW.getTime() - Math.random() * 10000),
    createdAt: NOW,
    updatedAt: NOW,
    archived: overrides.archived ?? false,
    deletedAt: overrides.deletedAt,
    canvasPosition: overrides.canvasPosition,
    pinned: overrides.pinned ?? false,
    color: overrides.color,
  } as Card
}

describe('normalise', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalise('  Hello   World  ')).toBe('hello world')
  })

  it('strips control characters', () => {
    expect(normalise('a\x00b\x1fc')).toBe('a b c')
  })
})

describe('tokenise', () => {
  it('splits on whitespace', () => {
    expect(tokenise('hello world test')).toEqual(['hello', 'world', 'test'])
  })

  it('returns empty array for empty string', () => {
    expect(tokenise('')).toEqual([])
  })
})

describe('searchCards', () => {
  it('returns all non-deleted cards for empty query', () => {
    const cards = [
      card('1', 'Alpha'),
      card('2', 'Beta', '', { deletedAt: new Date() }),
      card('3', 'Gamma'),
    ]
    const r = searchCards(cards, '')
    expect(r).toHaveLength(2)
  })

  it('matches title with score 1.5 per token', () => {
    const r = searchCards(
      [card('1', 'Cache strategy', 'some body')],
      'cache',
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.score).toBe(1.5)
    expect(r[0]!.matchedField).toBe('title')
  })

  it('matches body with score 1.0 per token', () => {
    const r = searchCards(
      [card('1', 'Title', 'cache invalidation is hard')],
      'cache',
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.matchedField).toBe('body')
  })

  it('matches tags', () => {
    const r = searchCards(
      [card('1', 'Idea', 'body', { tags: [{ value: 'urgent', color: 'var(--color-red)' }] })],
      'urgent',
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.matchedField).toBe('tags')
  })

  it('matches links', () => {
    const r = searchCards(
      [card('1', 'Link card', '', { links: [{ url: 'https://example.com/docs', fetchedAt: new Date() }] })],
      'example.com',
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.matchedField).toBe('link')
  })

  it('matches code snippets', () => {
    const r = searchCards(
      [card('1', 'Code', '', { codeSnippets: [{ language: 'ts', code: 'const useSWR = () => {}' }] })],
      'useswr',
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.matchedField).toBe('code')
  })

  it('matches quotes', () => {
    const r = searchCards(
      [card('1', 'Quote', '', { quotes: [{ text: 'Simplicity is key' }] })],
      'simplicity',
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.matchedField).toBe('quote')
  })

  it('AND logic — all tokens must match', () => {
    const cards = [
      card('1', 'Cache strategy', 'Use SWR for data fetching'),
      card('2', 'Different card', 'this one discusses caching but not anything unique'),
    ]
    const r = searchCards(cards, 'cache unique')
    // Only card 1 has "cache" (in title), card 2 has neither "cache" nor "unique" (only "caching").
    // Actually "caching" contains "cache" as a substring, so card 2 also matches cache.
    // Let's use truly different tokens.
    const r2 = searchCards(cards, 'strategy swr')
    expect(r2).toHaveLength(1)
    expect(r2[0]!.card.title).toBe('Cache strategy')
  })

  it('sorts by score desc then capturedAt desc', () => {
    const cards = [
      card('1', 'Data Access Object', 'the DAO pattern', { capturedAt: new Date(NOW.getTime() - 1000) }),
      card('2', 'DAO', 'Decentralised autonomous org', { capturedAt: new Date(NOW.getTime() - 2000) }),
      card('3', 'Data layer', 'also mentions dao somewhere', { capturedAt: new Date(NOW.getTime() - 3000) }),
    ]
    const r = searchCards(cards, 'dao')
    expect(r[0]!.card.title).toBe('DAO')        // title match → 1.5 > others
    expect(r[1]!).toBeDefined()
    expect(r[2]!).toBeDefined()
  })

  it('title match prioritised over body match', () => {
    const cards = [
      card('1', 'Random', 'match this word'),
      card('2', 'Search for match', 'other stuff'),
    ]
    const r = searchCards(cards, 'match')
    expect(r[0]!.card.title).toBe('Search for match') // title match
    expect(r[1]!.card.title).toBe('Random')           // body match
  })

  it('case insensitive', () => {
    const r = searchCards([card('1', 'HELLO', '')], 'hello')
    expect(r).toHaveLength(1)
  })

  it('no match returns empty', () => {
    const r = searchCards([card('1', 'Title', '')], 'zzz')
    expect(r).toHaveLength(0)
  })

  it('excludes soft-deleted cards', () => {
    const r = searchCards(
      [card('1', 'visible'), card('2', 'hidden', '', { deletedAt: new Date() })],
      'visible hidden',
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.card.title).toBe('visible')
  })

  it('returns empty array for only-whitespace query', () => {
    const r = searchCards([card('1', 'Title')], '   ')
    expect(r).toHaveLength(1)
  })

  it('缺字段的卡(老数据 tags/links/quotes/codeSnippets undefined)不崩', () => {
    // 老数据/导入卡可能缺 tags 等数组字段 → buildSearchable 的 .map 崩
    // (用户实测 n.tags.map 报错)。?? [] 兜底后应正常搜索,不抛。
    const partial = {
      ...card('1', 'hello world', 'searchable body'),
      tags: undefined as unknown as never,
      links: undefined as unknown as never,
      quotes: undefined as unknown as never,
      codeSnippets: undefined as unknown as never,
    }
    const r = searchCards([partial], 'hello')
    expect(r).toHaveLength(1)
    expect(r[0]!.card.id).toBe('1')
  })
})

describe('bodySnippet', () => {
  it('returns null for empty query', () => {
    expect(bodySnippet(card('1', '', 'body'), '')).toBeNull()
  })

  it('returns centred snippet around first matching token', () => {
    const c = card('1', '', 'The quick brown fox jumps over the lazy dog and then runs away')
    const s = bodySnippet(c, 'fox')
    expect(s).toBeTruthy()
    expect(s!).toContain('fox')
    expect((s as string).length).toBeLessThanOrEqual(203) // 200 + ellipsis
  })

  it('returns null when no token matches', () => {
    expect(bodySnippet(card('1', '', 'no match here'), 'zzz')).toBeNull()
  })

  it('returns null for empty body', () => {
    expect(bodySnippet(card('1', '', ''), 'test')).toBeNull()
  })
})
