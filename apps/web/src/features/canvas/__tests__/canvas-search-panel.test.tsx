import { describe, expect, it } from 'vitest'
import type { Card } from '@cys-stift/domain'
import { searchCanvasCards } from '../canvas-search-panel'

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1' as Card['id'],
    title: 'Untitled',
    body: '',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'test' },
    capturedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    tags: [],
    pinned: false,
    archived: false,
    ...overrides,
  }
}

describe('searchCanvasCards', () => {
  it('matches title/body case-insensitively and reports the match source', () => {
    const title = card({ id: 'title' as Card['id'], title: 'Design system' })
    const body = card({ id: 'body' as Card['id'], title: 'Notes', body: '### Design system\n\nUse tokens.' })

    expect(searchCanvasCards([title, body], 'DESIGN')).toMatchObject([
      { card: title, match: 'title' },
      { card: body, match: 'body' },
    ])
  })

  it('ignores archived/deleted cards and honors the result limit', () => {
    const cards = [
      card({ id: 'a' as Card['id'], title: 'A' }),
      card({ id: 'b' as Card['id'], title: 'B' }),
      card({ id: 'archived' as Card['id'], title: 'Archived', archived: true }),
      card({ id: 'deleted' as Card['id'], title: 'Deleted', deletedAt: new Date() }),
    ]

    expect(searchCanvasCards(cards, '', 1)).toEqual([])
    expect(searchCanvasCards(cards, 'a', 1).map((result) => result.card.id)).toEqual(['a'])
    expect(searchCanvasCards(cards, 'e')).toHaveLength(0)
  })

  it('returns a readable body snippet without markdown heading markers', () => {
    const result = searchCanvasCards([
      card({ id: 'markdown' as Card['id'], title: 'Card', body: '### Heading\n\nA useful line' }),
    ], 'useful')[0]

    expect(result?.snippet).toContain('A useful line')
    expect(result?.snippet).not.toContain('###')
  })
})
