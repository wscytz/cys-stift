import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { CardService, type Card, type CardId, type CardRepository } from '@cys-stift/domain'
import { compileProposalPlan } from '../proposal-compiler'
import type { ProposalEnvelopeV1, ProposalItemV1, ProposalReviewRecordV1 } from '../proposal-contract'

function card(id: string, x: number, y: number): Card {
  return {
    id: id as CardId, title: id, body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
    source: { kind: 'unknown' }, capturedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    canvasPosition: { canvasId: 'canvas' as never, x, y, w: 100, h: 80, z: 0 }, tags: [], pinned: false, archived: false,
  }
}

describe('compileProposalPlan', () => {
  it('combines accepted Logic, Ideas and Layout into one transaction plan', async () => {
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => {
      host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
      host.upsert({ id: 'b', kind: 'card', x: 200, y: 120, w: 100, h: 80, rotation: 0 })
    })
    const cards = [card('a', 0, 0), card('b', 200, 120)]
    const repo: CardRepository = {
      insert: () => {}, update: () => {}, delete: () => {}, getById: (id) => cards.find((entry) => entry.id === id) ?? null,
      listInbox: () => [], listOnCanvas: () => cards, listAll: () => cards,
    }
    const service = new CardService(repo)
    const items: ProposalItemV1[] = [
      { itemId: 'logic', lane: 'semantic', evidence: [{ refId: 'src', role: 'targets' }], dependsOn: [], conflictsWith: [], reason: 'connect', action: { type: 'relation.add', from: 'a', to: 'b', relation: 'blocks' } },
      { itemId: 'idea', lane: 'idea', evidence: [{ refId: 'src', role: 'inspired-by' }], dependsOn: ['logic'], conflictsWith: [], reason: 'follow up', candidate: { title: 'Verify handoff', promptedByRefIds: ['src'] } },
      { itemId: 'layout', lane: 'layout', evidence: [{ refId: 'src', role: 'targets' }], dependsOn: ['logic'], conflictsWith: [], reason: 'align', intent: { mode: 'layout', ops: [{ op: 'align', targets: ['a', 'b'], axis: 'top' }] } },
    ]
    const envelope: ProposalEnvelopeV1 = {
      kind: 'cys-proposal-envelope', version: 1, proposalId: 'proposal:all', snapshotId: 'ws', canvasId: 'canvas',
      baseRevisions: { content: 'c', relations: 'r', geometry: 'g' }, sourceRefs: [], promptVersion: 'p', schemaVersion: 1,
      provider: { id: 'fixture', model: 'fixture' }, payloadHash: 'hash',
      payload: { kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [], items },
    }
    const review: ProposalReviewRecordV1 = {
      proposalId: envelope.proposalId,
      decisions: { logic: 'accepted', idea: 'accepted', layout: 'accepted' },
      execution: {}, staleCauses: [],
    }

    const result = await compileProposalPlan(host, envelope, review, service)
    if (!result.ok) throw new Error(JSON.stringify(result))
    expect(result).toMatchObject({
      ok: true,
      plan: {
        itemIds: ['logic', 'idea', 'layout'],
        cardChanges: [
          { id: 'b', next: { canvasPosition: { y: 0 } } },
          { expected: null, next: { title: 'Verify handoff', source: { kind: 'ai-proposal', proposalId: 'proposal:all', itemId: 'idea' } } },
        ],
        elementChanges: [
          { itemId: 'logic', next: { kind: 'arrow', from: 'a', to: 'b' } },
          { itemId: 'layout', id: 'b', next: { y: 0 } },
        ],
      },
    })
    expect(host.getElements()).toHaveLength(2)
    expect(service.listAll()).toHaveLength(2)
  })
})
