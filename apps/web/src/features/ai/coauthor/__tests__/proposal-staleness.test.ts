import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { CardService, type Card, type CardId, type CardRepository } from '@cys-stift/domain'
import { createSourceRef } from '../source-ref'
import { detectProposalStaleness } from '../proposal-staleness'
import type { ProposalEnvelopeV1, ProposalReviewRecordV1 } from '../proposal-contract'

describe('proposal lane staleness', () => {
  it('invalidates accepted Logic on body change without invalidating pure Layout', async () => {
    const card: Card = { id: 'a' as CardId, title: 'A', body: 'before', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], source: { kind: 'unknown' }, capturedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), tags: [], pinned: false, archived: false }
    const repo: CardRepository = { insert: () => {}, update: (next) => Object.assign(card, next), delete: () => {}, getById: () => card, listInbox: () => [card], listOnCanvas: () => [card], listAll: () => [card] }
    const service = new CardService(repo)
    const ref = await createSourceRef('card', 'a', 'body', 'before', '/body')
    const envelope: ProposalEnvelopeV1 = { kind: 'cys-proposal-envelope', version: 1, proposalId: 'p', snapshotId: 'ws', canvasId: 'c', baseRevisions: { content: 'c', relations: 'r', geometry: 'g' }, sourceRefs: [ref], promptVersion: 'p', schemaVersion: 1, provider: { id: 'f', model: 'f' }, payloadHash: 'h', payload: { kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [], items: [
      { itemId: 'logic', lane: 'semantic', evidence: [{ refId: ref.refId, role: 'targets' }], dependsOn: [], conflictsWith: [], reason: '', action: { type: 'relation.remove', arrowId: 'edge' } },
      { itemId: 'layout', lane: 'layout', evidence: [{ refId: ref.refId, role: 'targets' }], dependsOn: [], conflictsWith: [], reason: '', intent: { mode: 'layout', ops: [{ op: 'align', targets: ['a'], axis: 'left' }] } },
    ] } }
    const review: ProposalReviewRecordV1 = { proposalId: 'p', decisions: { logic: 'accepted', layout: 'accepted' }, execution: {}, staleCauses: [] }
    card.body = 'after'
    const result = await detectProposalStaleness(envelope, review, new InMemoryCanvasHost(), service)
    expect(result.staleItemIds).toEqual(['logic'])
    expect(result.causes).toEqual([{ refId: ref.refId, code: 'SOURCE_CHANGED' }])
  })
})
