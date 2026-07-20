import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import { CardService, type Card, type CardId, type CardRepository } from '@cys-stift/domain'
import { compileLayoutItem, compileLayoutProposalPlan } from '../layout-compiler'
import { proposalPlanChangedIds } from '../proposal-transaction'
import { canonicalJson } from '../working-set-revision'
import type { ProposalEnvelopeV1, ProposalItemV1, ProposalReviewRecordV1 } from '../proposal-contract'

const layout: Extract<ProposalItemV1, { lane: 'layout' }> = {
  itemId: 'layout', lane: 'layout', evidence: [{ refId: 'src', role: 'targets' }], dependsOn: [], conflictsWith: [], reason: '',
  intent: { mode: 'layout', ops: [{ op: 'align', targets: ['a', 'b'], axis: 'left' }] },
}

function setup(item: Extract<ProposalItemV1, { lane: 'layout' }>, elements: CanvasElement[], options?: { keep?: string[]; pinnedCards?: string[] }) {
  const host = new InMemoryCanvasHost()
  host.applyWithoutEcho(() => { for (const element of elements) host.upsert(element) })
  const cards: Card[] = elements.filter((element) => element.kind === 'card').map((element, index) => ({
    id: element.id as CardId, title: element.id, body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
    source: { kind: 'unknown' }, capturedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    canvasPosition: { canvasId: 'canvas' as never, x: element.x, y: element.y, w: element.w, h: element.h, z: index },
    tags: [], pinned: options?.pinnedCards?.includes(element.id) ?? false, archived: false,
  }))
  const repo: CardRepository = {
    insert: () => {}, update: () => {}, delete: () => {}, getById: (id) => cards.find((card) => card.id === id) ?? null,
    listInbox: () => [], listOnCanvas: () => cards, listAll: () => cards,
  }
  const envelope: ProposalEnvelopeV1 = {
    kind: 'cys-proposal-envelope', version: 1, proposalId: 'p', snapshotId: 'ws', canvasId: 'canvas',
    baseRevisions: { content: 'c', relations: 'r', geometry: 'g' }, sourceRefs: [], promptVersion: 'p', schemaVersion: 1,
    provider: { id: 'fixture', model: 'fixture' }, payloadHash: 'h',
    payload: { kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [], items: [item] },
  }
  const review: ProposalReviewRecordV1 = {
    proposalId: 'p', decisions: { layout: 'accepted' }, execution: { layout: { state: 'not-compiled' } },
    keepPositionIds: options?.keep ?? [], staleCauses: [],
  }
  return { host, service: new CardService(repo), envelope, review }
}

const card = (id: string, x: number, y: number, w = 100, h = 80): CanvasElement => ({ id, kind: 'card', x, y, w, h, rotation: 0 })

describe('compileLayoutItem', () => {
  it('adds the system revision and validates the declarative intent', () => {
    expect(compileLayoutItem(layout, 'revision')).toMatchObject({ ok: true, intent: { baseRevision: 'revision' } })
  })

  it('solves layout into deterministic expected/next changes without mutating the host', async () => {
    const item = { ...layout, intent: { mode: 'layout' as const, ops: [{ op: 'align' as const, targets: ['a', 'b'], axis: 'top' as const }] } }
    const fixture = setup(item, [card('a', 0, 0), card('b', 200, 120)])
    const first = await compileLayoutProposalPlan(fixture.host, fixture.envelope, fixture.review, fixture.service)
    const second = await compileLayoutProposalPlan(fixture.host, fixture.envelope, fixture.review, fixture.service)
    expect(first).toMatchObject({ ok: true, plan: { cardChanges: [{ id: 'b', expected: { canvasPosition: { y: 120 } }, next: { canvasPosition: { y: 0 } } }] } })
    expect(fixture.host.getElement('b')?.y).toBe(120)
    if (!first.ok || !second.ok) throw new Error('expected deterministic layout plans')
    expect(canonicalJson(first.plan)).toBe(canonicalJson(second.plan))
    expect(proposalPlanChangedIds(first.plan)).toEqual(['b'])
  })

  it('uses only explicit review locks and does not reinterpret Card.pinned or model pin ops', async () => {
    const item = {
      ...layout,
      intent: { mode: 'layout' as const, ops: [{ op: 'pin' as const, target: 'b' }, { op: 'align' as const, targets: ['a', 'b', 'c'], axis: 'top' as const }] },
    }
    const unlocked = setup(item, [card('a', 0, 0), card('b', 200, 120), card('c', 400, 200)], { pinnedCards: ['b'] })
    const unlockedPlan = await compileLayoutProposalPlan(unlocked.host, unlocked.envelope, unlocked.review, unlocked.service)
    if (!unlockedPlan.ok) throw new Error(`expected unlocked layout plan: ${unlockedPlan.code}`)
    expect(unlockedPlan.plan.cardChanges.find((change) => String(change.id) === 'b')?.next?.canvasPosition?.y).toBe(0)

    const locked = setup(item, [card('a', 0, 0), card('b', 200, 120), card('c', 400, 200)], { keep: ['b'] })
    const lockedPlan = await compileLayoutProposalPlan(locked.host, locked.envelope, locked.review, locked.service)
    if (!lockedPlan.ok) throw new Error(`expected locked layout plan: ${lockedPlan.code}`)
    expect(lockedPlan.plan.cardChanges.map((change) => String(change.id))).not.toContain('b')
    expect(lockedPlan.plan.cardChanges.map((change) => String(change.id))).toContain('c')
  })

  it('disables title ordering when the Intent snapshot has no titles', async () => {
    const item = { ...layout, intent: { mode: 'layout' as const, ops: [{ op: 'layout' as const, targets: ['a', 'b'], mode: 'grid' as const, order: 'title' as const }] } }
    const fixture = setup(item, [card('a', 0, 0), card('b', 200, 120)])
    expect(await compileLayoutProposalPlan(fixture.host, fixture.envelope, fixture.review, fixture.service)).toEqual({ ok: false, code: 'TITLE_ORDER_UNAVAILABLE', itemIds: ['layout'] })
  })

  it('treats scope-external cards as immutable obstacles', async () => {
    const item = { ...layout, intent: { mode: 'layout' as const, ops: [{ op: 'layout' as const, targets: ['a', 'b'], mode: 'flow-row' as const, gap: [40, 40] as [number, number] }] } }
    const fixture = setup(item, [card('a', 0, 0), card('obstacle', 140, 0), card('b', 500, 0)])
    const result = await compileLayoutProposalPlan(fixture.host, fixture.envelope, fixture.review, fixture.service)
    if (!result.ok) throw new Error(`expected obstacle-aware plan: ${result.code}`)
    expect(result.plan.cardChanges.find((change) => change.id === 'b')?.next?.canvasPosition?.x).toBe(280)
    expect(proposalPlanChangedIds(result.plan)).not.toContain('obstacle')
  })

  it('fails closed when a solved target would leave its containing frame', async () => {
    const item = { ...layout, intent: { mode: 'layout' as const, ops: [{ op: 'place' as const, target: 'a', relation: 'right-of' as const, anchor: 'b', gap: 40 }] } }
    const frame: CanvasElement = { id: 'frame', kind: 'frame', x: 0, y: 0, w: 300, h: 200, rotation: 0 }
    const fixture = setup(item, [frame, card('a', 20, 40), card('b', 180, 40)])
    expect(await compileLayoutProposalPlan(fixture.host, fixture.envelope, fixture.review, fixture.service)).toEqual({ ok: false, code: 'FRAME_CONTAINMENT', itemIds: ['layout'] })
  })
})
