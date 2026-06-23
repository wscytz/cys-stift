import { describe, expect, it } from 'vitest'
import { autoRelate } from '../auto-relate'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { Card, CardService, CardId } from '@cys-stift/domain'

// Minimal Card-like object for keyword inference.
function card(id: string, title: string, body = ''): Card {
  return {
    id: id as never,
    title,
    body,
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'd' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    archived: false,
  }
}

function stubService(cards: Card[]): CardService {
  return {
    get: (id: CardId) => cards.find((c) => c.id === id) ?? undefined,
  } as unknown as CardService
}

describe('autoRelate (host)', () => {
  it('creates arrows when keyword inference hits (≥2 cards)', () => {
    const cards = [card('a', 'Fix login bug', '这是阻塞项 block todo'), card('b', 'Login page', '')]
    const host = new InMemoryCanvasHost()
    const r = autoRelate(host, ['a', 'b'], stubService(cards))
    // 'block'/'阻塞'/'todo' keywords → blocks relation should hit.
    expect(r.arrowsCreated).toBeGreaterThanOrEqual(1)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows.length).toBe(r.arrowsCreated)
    const arrow = arrows[0]!
    expect(arrow.from).toBe('a')
    expect(arrow.to).toBe('b')
    expect(arrow.color).toBeDefined()
    expect(arrow.text).toBeDefined()
  })

  it('skips pairs with no keyword hit (no arrows created)', () => {
    const cards = [card('a', 'Hello world', 'nothing relevant'), card('b', 'Random', 'also nothing')]
    const host = new InMemoryCanvasHost()
    const r = autoRelate(host, ['a', 'b'], stubService(cards))
    expect(r.arrowsCreated).toBe(0)
    expect(host.getElements().filter((e) => e.kind === 'arrow').length).toBe(0)
  })

  it('returns 0 for <2 cards', () => {
    expect(autoRelate(new InMemoryCanvasHost(), ['a'], stubService([])).arrowsCreated).toBe(0)
  })

  it('skips pairs when a card is missing from the service', () => {
    const cards = [card('a', 'blocks b', '')] // b not in service
    const host = new InMemoryCanvasHost()
    const r = autoRelate(host, ['a', 'b'], stubService(cards))
    expect(r.arrowsCreated).toBe(0)
  })
})
