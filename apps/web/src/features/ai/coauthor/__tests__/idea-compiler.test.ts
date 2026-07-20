import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { CardService, type Card, type CardRepository } from '@cys-stift/domain'
import { compileIdeaProposalPlan } from '../idea-compiler'
import type { ProposalEnvelopeV1, ProposalReviewRecordV1 } from '../proposal-contract'

function service(): CardService {
  const cards: Card[] = []
  const repo: CardRepository = {
    insert: (card) => cards.push(card), update: () => {}, delete: () => {}, getById: (id) => cards.find((card) => card.id === id) ?? null,
    listInbox: () => cards, listOnCanvas: () => [], listAll: () => cards,
    applyBatch: (changes) => { for (const change of changes) { if (change.next) cards.push(change.next) }; return true },
  }
  return new CardService(repo)
}

describe('idea proposal compiler', () => {
  it('keeps an accepted Idea in the transaction plan with local provenance', async () => {
    const envelope: ProposalEnvelopeV1 = {
      kind: 'cys-proposal-envelope', version: 1, proposalId: 'proposal:idea', snapshotId: 'ws', canvasId: 'canvas',
      baseRevisions: { content: 'c', relations: 'r', geometry: 'g' }, sourceRefs: [], promptVersion: 'p', schemaVersion: 1,
      provider: { id: 'fixture', model: 'fixture' }, payloadHash: 'hash', payload: {
        kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [], items: [{
          itemId: 'idea', lane: 'idea', evidence: [{ refId: 'src', role: 'inspired-by' }], dependsOn: [], conflictsWith: [], reason: 'candidate',
          candidate: { title: 'Follow-up', body: 'Question', promptedByRefIds: ['src'] },
        }],
      },
    }
    const review: ProposalReviewRecordV1 = { proposalId: envelope.proposalId, decisions: { idea: 'accepted' }, execution: { idea: { state: 'not-compiled' } }, staleCauses: [] }
    const cardService = service()
    const host = new InMemoryCanvasHost()
    const result = await compileIdeaProposalPlan(host, envelope, review, cardService)
    expect(result).toMatchObject({ ok: true, plan: { cardChanges: [{ expected: null, next: { title: 'Follow-up', source: { kind: 'ai-proposal', proposalId: 'proposal:idea', itemId: 'idea' } } }] } })
    if (!result.ok) throw new Error(JSON.stringify(result))
    expect(result.plan.cardChanges[0]?.id).toBe('ai-card:proposal%3Aidea:idea')

    const repeated = await compileIdeaProposalPlan(host, envelope, review, cardService)
    if (!repeated.ok) throw new Error(JSON.stringify(repeated))
    expect(repeated.plan.cardChanges[0]?.id).toBe(result.plan.cardChanges[0]?.id)
    expect(repeated.plan.planHash).toBe(result.plan.planHash)
    expect(cardService.listAll()).toEqual([])
  })
})
