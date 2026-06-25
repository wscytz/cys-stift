import { describe, it, expect } from 'vitest'
import {
  findDuplicateGroups,
  normaliseUrl,
  normaliseCode,
  normaliseTitle,
} from '../services/duplicate-detect'
import type { Card } from '../types'

const NOW = new Date('2026-06-25T00:00:00Z')

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
    capturedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    archived: overrides.archived ?? false,
    deletedAt: overrides.deletedAt,
    canvasPosition: overrides.canvasPosition,
    pinned: overrides.pinned ?? false,
    color: overrides.color,
  } as Card
}

const link = (url: string) => ({ url, fetchedAt: NOW })
const code = (code: string, language = 'ts') => ({ language, code })

// ── 归一化 ──────────────────────────────────────────────────────────────────

describe('normaliseUrl', () => {
  it('去 fragment', () => {
    expect(normaliseUrl('https://x.com/a#section')).toBe('https://x.com/a')
  })
  it('去末尾斜杠(非根)', () => {
    expect(normaliseUrl('https://x.com/a/')).toBe('https://x.com/a')
  })
  it('小写 scheme + host,保留路径大小写', () => {
    expect(normaliseUrl('HTTPS://Ex.COM/Path')).toBe('https://ex.com/Path')
  })
  it('去 utm_ 追踪参数,保留有意义 query', () => {
    expect(normaliseUrl('https://x.com/a?utm_source=rss&page=2')).toBe('https://x.com/a?page=2')
  })
  it('去 fbclid / gclid', () => {
    expect(normaliseUrl('https://x.com/a?fbclid=abc')).toBe('https://x.com/a')
  })
})

describe('normaliseCode', () => {
  it('去全部空白 + 小写', () => {
    expect(normaliseCode('  const X = 1;\n  const Y = 2;')).toBe('constx=1;consty=2;')
  })
})

describe('normaliseTitle', () => {
  it('小写 + 折叠空白', () => {
    expect(normaliseTitle('  Hello   World  ')).toBe('hello world')
  })
})

// ── findDuplicateGroups ─────────────────────────────────────────────────────

describe('findDuplicateGroups', () => {
  it('空 / 单卡 → 无组', () => {
    expect(findDuplicateGroups([])).toEqual([])
    expect(findDuplicateGroups([card('a', 't')])).toEqual([])
  })

  it('URL 重复:两卡同 URL(归一化后)→ 一组 url', () => {
    const a = card('a', 'A', '', { links: [link('https://x.com/article')] })
    const b = card('b', 'B', '', { links: [link('https://x.com/article#top')] })
    const groups = findDuplicateGroups([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.dimension).toBe('url')
    expect(groups[0]!.cardIds).toEqual(['a', 'b'])
  })

  it('URL 重复:不同 utm/大小写/末尾斜杠 算同一组', () => {
    const a = card('a', 'A', '', { links: [link('https://Ex.COM/a/?utm_source=rss')] })
    const b = card('b', 'B', '', { links: [link('https://ex.com/a')] })
    const groups = findDuplicateGroups([a, b])
    expect(groups.filter((g) => g.dimension === 'url')).toHaveLength(1)
  })

  it('代码片段重复:缩进/大小写不同算同一组', () => {
    const a = card('a', 'A', '', { codeSnippets: [code('const X = 1;')] })
    const b = card('b', 'B', '', { codeSnippets: [code('  CONST X = 1;')] })
    const groups = findDuplicateGroups([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.dimension).toBe('code')
    expect(groups[0]!.cardIds).toEqual(['a', 'b'])
  })

  it('标题重复:title 归一化等值 → 一组 title', () => {
    const a = card('a', '  Hello World ')
    const b = card('b', 'hello  world')
    const groups = findDuplicateGroups([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.dimension).toBe('title')
  })

  it('一张卡多维度重复 → 出现在多个组(既同 URL 又同标题)', () => {
    const a = card('a', 'Same', '', { links: [link('https://x.com')] })
    const b = card('b', 'same', '', { links: [link('https://x.com')] })
    const groups = findDuplicateGroups([a, b])
    expect(groups.map((g) => g.dimension).sort()).toEqual(['title', 'url'])
  })

  it('无重复 → 空数组', () => {
    const a = card('a', 'A', '', { links: [link('https://x.com')] })
    const b = card('b', 'B', '', { links: [link('https://y.com')] })
    expect(findDuplicateGroups([a, b])).toEqual([])
  })

  it('≥3 卡同 URL → 一组含 3 个 id(按入参顺序)', () => {
    const a = card('a', 'A', '', { links: [link('https://x.com')] })
    const b = card('b', 'B', '', { links: [link('https://x.com')] })
    const c = card('c', 'C', '', { links: [link('https://x.com')] })
    const groups = findDuplicateGroups([a, b, c])
    const urlGroup = groups.find((g) => g.dimension === 'url')!
    expect(urlGroup.cardIds).toEqual(['a', 'b', 'c'])
  })

  it('空标题不算重复(归一化后为空 → 跳过)', () => {
    const a = card('a', '  ')
    const b = card('b', '')
    expect(findDuplicateGroups([a, b])).toEqual([])
  })

  it('一张卡多个 link,其中一个与其他卡重复 → 命中', () => {
    const a = card('a', 'A', '', { links: [link('https://x.com'), link('https://unique.com')] })
    const b = card('b', 'B', '', { links: [link('https://x.com')] })
    const groups = findDuplicateGroups([a, b])
    expect(groups.filter((g) => g.dimension === 'url')).toHaveLength(1)
  })
})
