import { describe, it, expect } from 'vitest'
import { searchCards } from '../services/search'
import type { Card } from '../types'

const NOW = new Date('2026-06-20T10:00:00Z')

const cards: Card[] = [
  {
    id: '1' as any, title: 'UX audit card 中文 English mixed', body: 'Body with CJK and Latin.', type: 'note',
    source: { kind: 'manual', deviceId: 'web' }, links: [], codeSnippets: [], quotes: [], media: [],
    capturedAt: new Date(NOW.getTime() - 1000), createdAt: NOW, updatedAt: NOW,
    archived: false, deletedAt: undefined, canvasPosition: undefined, workspaceId: 'default' as any,
  },
  {
    id: '2' as any, title: 'Cache strategy', body: 'Use SWR for data fetching.', type: 'note',
    source: { kind: 'manual', deviceId: 'web' }, links: [{ url: 'https://swr.vercel.app' }], codeSnippets: [], quotes: [], media: [],
    capturedAt: new Date(NOW.getTime() - 2000), createdAt: NOW, updatedAt: NOW,
    archived: false, deletedAt: undefined, canvasPosition: undefined, workspaceId: 'default' as any,
  },
  {
    id: '3' as any, title: 'API design', body: 'REST over GraphQL.', type: 'note',
    source: { kind: 'manual', deviceId: 'web' }, links: [], codeSnippets: [{ language: 'ts', code: 'const x = 1' }], quotes: [], media: [],
    capturedAt: new Date(NOW.getTime() - 3000), createdAt: NOW, updatedAt: NOW,
    archived: false, deletedAt: undefined, canvasPosition: undefined, workspaceId: 'default' as any,
  },
  {
    id: '4' as any, title: 'Deleted card', body: 'Should not appear.', type: 'quote',
    source: { kind: 'manual', deviceId: 'web' }, links: [], codeSnippets: [], quotes: [{ text: 'Quote text', attribution: '' }], media: [],
    capturedAt: new Date(NOW.getTime() - 4000), createdAt: NOW, updatedAt: NOW,
    archived: false, deletedAt: NOW, canvasPosition: undefined, workspaceId: 'default' as any,
  },
  {
    id: '5' as any, title: 'TypeScript patterns', body: 'Use branded types for IDs.', type: 'code',
    source: { kind: 'manual', deviceId: 'web' }, links: [], codeSnippets: [], quotes: [{ text: 'Any fool can write code', attribution: 'Martin Fowler' }], media: [],
    capturedAt: new Date(NOW.getTime() - 5000), createdAt: NOW, updatedAt: NOW,
    archived: true, deletedAt: undefined, canvasPosition: undefined, workspaceId: 'default' as any,
  },
]

describe('searchCards', () => {
  it('empty query returns all non-deleted', () => {
    const r = searchCards(cards, '')
    expect(r).toHaveLength(4)
    expect(r.some((c) => c.title === 'Deleted card')).toBe(false)
  })

  it('matches title', () => {
    const r = searchCards(cards, 'cache')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Cache strategy')
  })

  it('case insensitive', () => {
    const r = searchCards(cards, 'SWR')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Cache strategy')
  })

  it('AND logic', () => {
    const r = searchCards(cards, 'cache SWR')
    expect(r).toHaveLength(1)
  })

  it('no match', () => {
    const r = searchCards(cards, 'zzz')
    expect(r).toHaveLength(0)
  })

  it('matches body', () => {
    const r = searchCards(cards, 'branded')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('TypeScript patterns')
  })

  it('matches link URL', () => {
    const r = searchCards(cards, 'swr.vercel.app')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Cache strategy')
  })

  it('excludes soft-deleted', () => {
    const r = searchCards(cards, 'deleted')
    expect(r).toHaveLength(0)
  })

  it('sorts by capturedAt desc', () => {
    const r = searchCards(cards, '')
    for (let i = 1; i < r.length; i++) {
      expect(+r[i].capturedAt).toBeLessThanOrEqual(+r[i - 1].capturedAt)
    }
  })
})
