/**
 * Public acceptance invariants for the canvas editing chain.
 *
 * The demo promise is narrow and state-based: insert, move, and content-only
 * edits go through the same clean-plan gate; unrelated elements keep their
 * state; blocked proposals mutate nothing; serialized text round-trips.
 *
 * These cases used to live only in the private offline harness. Keeping the
 * key invariants here makes CI guard them without cross-repo paths.
 */
import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import {
  parseDslWithDiagnostics,
  serializeCanvas,
  type DslOp,
} from '@wscytz/dsl'
import {
  applyPlanIfClean,
  type CardCreateHandler,
  type CardUpdateHandler,
} from '../apply-layout'

const STARTER_DSL = `[card #a create] @pos(0, 0) @size(240, 120) @title("Alpha") @content("starter a") @group("row1")
[card #b create] @pos(280, 0) @size(240, 120) @title("Beta") @content("starter b") @group("row1")
[card #c create] @pos(840, 0) @size(240, 120) @title("Gamma") @content("starter c") @group("row1")
[card #d create] @pos(0, 160) @size(240, 120) @title("Delta") @content("starter d") @group("row2")
[card #e create] @pos(280, 160) @size(240, 120) @title("Epsilon") @content("starter e") @group("row2")
[card #f create] @pos(840, 160) @size(240, 120) @title("Zeta") @content("starter f") @group("row2")
[arrow #e1] from #a to #b @dash(solid)
[arrow #e2] from #b to #c @dash(solid)
[arrow #e3] from #d to #e @dash(solid)
[arrow #e4] from #e to #f @dash(solid)
[arrow #e5] from #c to #f @dash(dashed)`

const INSERT_G_DSL = `[card #g create] right-of #b @gap(40) @size(240, 120) @title("Bridge") @content("inserted g") @group("row1")
[arrow #e6] from #b to #g @dash(solid)
[arrow #e7] from #g to #c @dash(solid)
[arrow #e2 delete]`

const MOVE_E_DSL = '[card #e] right-of #f @gap(40)'
const UPDATE_A_DSL = '[card #a] @title("Alpha updated") @content("field edit applied")'
const MISSING_ANCHOR_DSL = '[card #e] right-of #ghost @gap(40)'
const CREATE_EXISTING_DSL = '[card #a create] @pos(0, 0) @size(240, 120) @title("conflict")'

type CardText = { title?: string; content?: string }

type Snapshot = {
  elements: Record<string, unknown>
  cards: Record<string, CardText>
}

function cardHandlers(cards: Map<string, CardText>) {
  const onCardCreate: CardCreateHandler = (params) => {
    cards.set(params.cardId, {
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.content !== undefined ? { content: params.content } : {}),
    })
    return { ok: true }
  }
  const onCardUpdate: CardUpdateHandler = (params) => {
    const previous = cards.get(params.cardId) ?? {}
    cards.set(params.cardId, {
      ...previous,
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.content !== undefined ? { content: params.content } : {}),
    })
  }
  const onCardRemove = (cardId: string) => {
    cards.delete(cardId)
  }
  return { onCardCreate, onCardUpdate, onCardRemove }
}

function applyDsl(
  host: InMemoryCanvasHost,
  cards: Map<string, CardText>,
  dsl: string,
): ReturnType<typeof applyPlanIfClean> {
  const parsed = parseDslWithDiagnostics(dsl)
  expect(parsed.errors).toEqual([])
  const handlers = cardHandlers(cards)
  return applyPlanIfClean(
    host,
    parsed.ops,
    new Set(),
    handlers.onCardCreate,
    handlers.onCardUpdate,
    handlers.onCardRemove,
  )
}

function makeStarter(): { host: InMemoryCanvasHost; cards: Map<string, CardText> } {
  const host = new InMemoryCanvasHost()
  const cards = new Map<string, CardText>()
  const outcome = applyDsl(host, cards, STARTER_DSL)
  if (!outcome.ok) throw new Error(`starter blocked: ${JSON.stringify(outcome.diagnostics)}`)
  expect(outcome.report.applied).toBe(11)
  return { host, cards }
}

function cloneElement(element: unknown): unknown {
  return JSON.parse(JSON.stringify(element))
}

function snapshot(host: InMemoryCanvasHost, cards: Map<string, CardText>): Snapshot {
  const elements = Object.fromEntries(
    host.getElements().map((element) => [element.id, cloneElement(element)]),
  )
  const cardEntries = [...cards.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, value]) => [id, { ...value }])
  return { elements, cards: Object.fromEntries(cardEntries) }
}

function expectUnchanged(
  before: Snapshot,
  after: Snapshot,
  changedElementIds: string[] = [],
  changedCardIds: string[] = [],
): void {
  const changedElements = new Set(changedElementIds)
  const changedCards = new Set(changedCardIds)
  const elementIds = new Set([...Object.keys(before.elements), ...Object.keys(after.elements)])
  for (const id of elementIds) {
    if (changedElements.has(id)) continue
    expect(after.elements[id]).toEqual(before.elements[id])
  }
  const cardIds = new Set([...Object.keys(before.cards), ...Object.keys(after.cards)])
  for (const id of cardIds) {
    if (changedCards.has(id)) continue
    expect(after.cards[id]).toEqual(before.cards[id])
  }
}

function addCreateFlags(dsl: string): string {
  return dsl
    .split('\n')
    .map((line) => line.replace(/^\[card #([^\]]+)\]/, '[card #$1 create]'))
    .join('\n')
}

function opsOf(dsl: string): DslOp[] {
  const parsed = parseDslWithDiagnostics(dsl)
  expect(parsed.errors).toEqual([])
  return parsed.ops
}

describe('acceptance: three edit shapes share the clean-plan gate', () => {
  it('insert creates the new element and removes only the declared edge', () => {
    const { host, cards } = makeStarter()
    const before = snapshot(host, cards)
    const outcome = applyDsl(host, cards, INSERT_G_DSL)
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics))
    const after = snapshot(host, cards)

    expect(outcome.report).toMatchObject({
      applied: 4,
      skipped: 0,
      failed: 0,
      cardsCreated: 1,
      cardsUpdated: 0,
      cardsDeleted: 0,
      freeformChanged: 3,
    })
    expect(outcome.report.sanitizeDiagnostics ?? []).toEqual([])
    expect(after.cards.g).toEqual({ title: 'Bridge', content: 'inserted g' })
    expect(after.elements.g).toMatchObject({ kind: 'card', x: 560, y: 0, w: 240, h: 120 })
    expect(after.elements.e6).toMatchObject({ kind: 'arrow', from: 'b', to: 'g' })
    expect(after.elements.e7).toMatchObject({ kind: 'arrow', from: 'g', to: 'c' })
    expect(after.elements.e2).toBeUndefined()
    expect(Object.keys(after.cards).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expectUnchanged(before, after, ['g', 'e2', 'e6', 'e7'], ['g'])
  })

  it('move changes only the target geometry and no card text', () => {
    const { host, cards } = makeStarter()
    const before = snapshot(host, cards)
    const outcome = applyDsl(host, cards, MOVE_E_DSL)
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics))
    const after = snapshot(host, cards)

    expect(outcome.report).toMatchObject({
      applied: 1,
      skipped: 0,
      failed: 0,
      cardsCreated: 0,
      cardsUpdated: 1,
      freeformChanged: 0,
    })
    expect(after.elements.e).toMatchObject({ x: 1120, y: 160, w: 240, h: 120 })
    expect(after.cards).toEqual(before.cards)
    expectUnchanged(before, after, ['e'])
  })

  it('content-only update keeps every element and all other cards exactly in place', () => {
    const { host, cards } = makeStarter()
    const before = snapshot(host, cards)
    const outcome = applyDsl(host, cards, UPDATE_A_DSL)
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics))
    const after = snapshot(host, cards)

    expect(outcome.report).toMatchObject({
      applied: 1,
      skipped: 0,
      failed: 0,
      cardsCreated: 0,
      cardsUpdated: 1,
      freeformChanged: 0,
    })
    expect(after.cards.a).toEqual({
      title: 'Alpha updated',
      content: 'field edit applied',
    })
    expect(after.elements).toEqual(before.elements)
    expectUnchanged(before, after, [], ['a'])
  })
})

describe('acceptance: blocked proposals do not mutate state', () => {
  it('missing anchor reports the missing id and leaves the canvas untouched', () => {
    const { host, cards } = makeStarter()
    const before = snapshot(host, cards)
    const outcome = applyDsl(host, cards, MISSING_ANCHOR_DSL)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(
      outcome.diagnostics.some((diagnostic) => diagnostic.message.includes('#ghost')),
    ).toBe(true)
    expect(snapshot(host, cards)).toEqual(before)
  })

  it('creating an existing card id is blocked by sanitize without touching the card', () => {
    const { host, cards } = makeStarter()
    const before = snapshot(host, cards)
    const outcome = applyDsl(host, cards, CREATE_EXISTING_DSL)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(
      outcome.diagnostics.some(
        (diagnostic) =>
          diagnostic.message.includes('已存在') || diagnostic.message.includes('冲突'),
      ),
    ).toBe(true)
    expect(snapshot(host, cards)).toEqual(before)
  })
})

describe('acceptance: serialized text round-trips', () => {
  it('reapplying the serialized insert result reproduces state and text byte-for-byte', () => {
    const { host, cards } = makeStarter()
    const inserted = applyDsl(host, cards, INSERT_G_DSL)
    if (!inserted.ok) throw new Error(JSON.stringify(inserted.diagnostics))
    const before = snapshot(host, cards)
    const serialized = serializeCanvas(host.getElements(), (id) => cards.get(id))

    const freshHost = new InMemoryCanvasHost()
    const freshCards = new Map<string, CardText>()
    const parsed = parseDslWithDiagnostics(addCreateFlags(serialized))
    expect(parsed.errors).toEqual([])
    const handlers = cardHandlers(freshCards)
    const reapplied = applyPlanIfClean(
      freshHost,
      parsed.ops,
      new Set(),
      handlers.onCardCreate,
      handlers.onCardUpdate,
      handlers.onCardRemove,
    )
    if (!reapplied.ok) throw new Error(JSON.stringify(reapplied.diagnostics))

    expect(reapplied.report.applied).toBe(13)
    expect(snapshot(freshHost, freshCards)).toEqual(before)
    expect(serializeCanvas(freshHost.getElements(), (id) => freshCards.get(id))).toBe(serialized)
  })
})

describe('acceptance: parsed ops stay explicit', () => {
  it('parses the move and update proposals into exactly one op', () => {
    expect(opsOf(MOVE_E_DSL)).toHaveLength(1)
    expect(opsOf(UPDATE_A_DSL)).toHaveLength(1)
  })
})
