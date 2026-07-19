import { describe, expect, it } from 'vitest'
import { CardService, type CardRepository, type Card, type CardId, type CanvasId } from '@cys-stift/domain'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { loadCardsIntoEditor } from '@/features/canvas/canvas-binding'
import { searchCanvasCards } from '@/features/canvas/canvas-search-panel'
import { coreLoopCards, CORE_LOOP_CANVAS_ID } from './fixtures/core-loop'

class FixtureRepository implements CardRepository {
  private cards: Card[]

  constructor(cards: Card[]) {
    this.cards = cards
  }

  insert(card: Card): void {
    if (this.cards.some((current) => current.id === card.id)) throw new Error('duplicate id')
    this.cards.push(card)
  }

  update(card: Card): void {
    const index = this.cards.findIndex((current) => current.id === card.id)
    if (index < 0) throw new Error('missing card')
    this.cards[index] = card
  }

  delete(id: CardId): void {
    this.cards = this.cards.filter((card) => card.id !== id)
  }

  getById(id: CardId): Card | null {
    return this.cards.find((card) => card.id === id) ?? null
  }

  listInbox(): Card[] {
    return this.cards.filter((card) => !card.canvasPosition && !card.archived && !card.deletedAt)
  }

  listOnCanvas(canvasId: CanvasId): Card[] {
    return this.cards.filter((card) => card.canvasPosition?.canvasId === canvasId)
  }

  listAll(): Card[] {
    return this.cards
  }
}

describe('core loop fixture: capture -> canvas -> search -> continue editing', () => {
  it('keeps the card recoverable and readable at every hand-off', () => {
    const repo = new FixtureRepository(coreLoopCards())
    const service = new CardService(repo)

    // Capture starts in Inbox and keeps the Markdown source intact.
    const captured = service.get('core-capture' as CardId)
    expect(captured?.canvasPosition).toBeUndefined()
    expect(service.listInbox()).toHaveLength(2)

    // Organize later: moving the card must give it a real canvas position.
    expect(service.moveToCanvas('core-capture' as CardId, {
      canvasId: CORE_LOOP_CANVAS_ID,
      x: 120,
      y: 80,
      w: 240,
      h: 120,
      z: 1,
    })).toBe(true)
    const host = new InMemoryCanvasHost()
    loadCardsIntoEditor(host, service, CORE_LOOP_CANVAS_ID)
    expect(host.getElement('core-capture')?.kind).toBe('card')

    // Search works on the readable projection, not raw `###` syntax.
    const results = searchCanvasCards(service.listOnCanvas(CORE_LOOP_CANVAS_ID), '研究线索')
    expect(results).toHaveLength(1)
    expect(results[0]?.snippet).toContain('研究线索')
    expect(results[0]?.snippet).not.toContain('###')

    // Continue editing in the workbench and keep the card on the same canvas.
    const updated = service.update('core-capture' as CardId, {
      body: '### 研究线索\n已补充下一步',
      title: '捕获后的想法（已继续）',
    })
    expect(updated?.title).toContain('已继续')
    expect(service.get('core-capture' as CardId)?.canvasPosition?.canvasId).toBe(CORE_LOOP_CANVAS_ID)
  })
})
