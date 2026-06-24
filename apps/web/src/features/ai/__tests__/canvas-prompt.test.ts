import { describe, it, expect } from 'vitest'
import { buildCanvasPrompt } from '../canvas-prompt'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasId, Card, CardId, CardService } from '@cys-stift/domain'

function fakeCard(id: string, title: string): Card {
  return {
    id: id as unknown as CardId, title, body: '', type: 'note',
    media: [], links: [], codeSnippets: [], quotes: [], tags: [],
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    pinned: false, archived: false,
  } as unknown as Card
}

describe('buildCanvasPrompt', () => {
  it('wraps the canvas snapshot with DSL grammar instructions', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    const svc = { get: (id: CardId) => (String(id) === 'c1' ? fakeCard('c1', '苹果') : null) } as unknown as CardService
    const prompt = buildCanvasPrompt(host, svc, 'cv-1' as unknown as CanvasId)
    expect(prompt).toContain('苹果')
    expect(prompt.toLowerCase()).toMatch(/dsl|grammar|canvas/)
    expect(prompt.length).toBeGreaterThan(50)
  })
})
