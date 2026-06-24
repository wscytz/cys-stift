import { describe, it, expect } from 'vitest'
import { exportCanvasMarkdown } from '../export-markdown'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { Card, CardId, CardService } from '@cys-stift/domain'

function fakeCard(id: string, title: string, body = ''): Card {
  return {
    id: id as unknown as CardId, title, body, type: 'note',
    media: [], links: [], codeSnippets: [], quotes: [], tags: [],
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    pinned: false, archived: false,
  } as unknown as Card
}

function fakeService(cards: Card[]): CardService {
  const map = new Map(cards.map((c) => [String(c.id), c]))
  return { get: (id: CardId) => map.get(String(id)) ?? null } as unknown as CardService
}

describe('exportCanvasMarkdown', () => {
  it('returns null for an empty canvas', () => {
    const host = new InMemoryCanvasHost()
    const svc = fakeService([])
    expect(exportCanvasMarkdown(host, svc, 'cv-1' as never, 'Empty')).toBeNull()
  })

  it('renders canvas name as H1 and each card as H2 with body', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 0, y: 100, w: 100, h: 80, rotation: 0 })
    const svc = fakeService([fakeCard('c1', '苹果', '红的'), fakeCard('c2', '橘子', '黄的')])
    const md = exportCanvasMarkdown(host, svc, 'cv-1' as never, '水果')
    expect(md).toContain('# 水果')
    expect(md).toContain('## 苹果')
    expect(md).toContain('红的')
    expect(md).toContain('## 橘子')
  })

  it('renders relation arrows as cross-reference links', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 0, y: 100, w: 100, h: 80, rotation: 0 })
    host.upsert({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'c1', to: 'c2', color: 'red', dash: 'solid', arrowhead: 'arrow', text: 'blocks',
    })
    const svc = fakeService([fakeCard('c1', 'A'), fakeCard('c2', 'B')])
    const md = exportCanvasMarkdown(host, svc, 'cv-1' as never, 'G')
    expect(md).toMatch(/blocks.*B|B.*blocks/i)
  })

  it('orders cards top-to-bottom by canvas y when no relations', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c2', kind: 'card', x: 0, y: 100, w: 100, h: 80, rotation: 0 })
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    const svc = fakeService([fakeCard('c1', 'Top'), fakeCard('c2', 'Bottom')])
    const md = exportCanvasMarkdown(host, svc, 'cv-1' as never, 'G')
    expect(md!.indexOf('## Top')).toBeLessThan(md!.indexOf('## Bottom'))
  })
})
