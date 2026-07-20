import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { CardService, type Card, type CardId, type CardRepository } from '@cys-stift/domain'
import { buildWorkingSet } from '../working-set'

async function runScale(count: number) {
  const cards = new Map<CardId, Card>()
  const host = new InMemoryCanvasHost()
  const ids: string[] = []
  host.applyWithoutEcho(() => {
    for (let index = 0; index < count; index++) {
      const id = `card:${index}` as CardId
      ids.push(id)
      cards.set(id, { id, title: `Step ${index}`, body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], source: { kind: 'unknown' }, capturedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), canvasPosition: { canvasId: 'canvas' as never, x: (index % 100) * 280, y: Math.floor(index / 100) * 160, w: 240, h: 120, z: index }, tags: [], pinned: false, archived: false })
      host.upsert({ id, kind: 'card', x: (index % 100) * 280, y: Math.floor(index / 100) * 160, w: 240, h: 120, rotation: 0 })
    }
  })
  host.setSelectedIds(ids)
  const repo: CardRepository = { insert: () => {}, update: () => {}, delete: () => {}, getById: (id) => cards.get(id) ?? null, listInbox: () => [], listOnCanvas: () => [...cards.values()], listAll: () => [...cards.values()] }
  const started = performance.now()
  const result = await buildWorkingSet({ host, service: new CardService(repo), canvasId: 'canvas', scope: { kind: 'selection' }, maxChars: 1_000_000 })
  return { elapsedMs: performance.now() - started, result }
}

describe('proposal working-set scale benchmark', () => {
  it.each([1_000, 5_000])('builds a bounded %i-card scope deterministically', async (count) => {
    const { elapsedMs, result } = await runScale(count)
    expect(result.snapshot.geometry).toHaveLength(count)
    expect(result.snapshot.sources).toHaveLength(count)
    expect(result.snapshot.manifest.truncated).toBe(false)
    expect(elapsedMs).toBeLessThan(15_000)
  }, 25_000)
})
