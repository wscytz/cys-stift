import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { compileSemanticItem, compileSemanticProposalPlan } from '../semantic-compiler'
import type { ProposalEnvelopeV1, ProposalItemV1, ProposalReviewRecordV1 } from '../proposal-contract'

function item(action: Extract<ProposalItemV1, { lane: 'semantic' }>['action']): Extract<ProposalItemV1, { lane: 'semantic' }> {
  return { itemId: 'item', lane: 'semantic', evidence: [{ refId: 'src', role: 'targets' }], dependsOn: [], conflictsWith: [], reason: '', action }
}

describe('compileSemanticItem', () => {
  it('compiles only a scoped relation with expected null before value', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }); host.upsert({ id: 'b', kind: 'card', x: 2, y: 0, w: 1, h: 1, rotation: 0 })
    const result = compileSemanticItem(host, item({ type: 'relation.add', from: 'a', to: 'b', relation: 'blocks' }))
    expect(result).toMatchObject({ ok: true, operations: [{ type: 'upsert', expected: null }] })
  })
  it('fails closed on missing targets and reverse keeps exact before', () => {
    const host = new InMemoryCanvasHost(); host.upsert({ id: 'edge', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' })
    expect(compileSemanticItem(host, item({ type: 'relation.add', from: 'missing', to: 'b', relation: 'blocks' }))).toMatchObject({ ok: false, code: 'MISSING_ENDPOINT' })
    expect(compileSemanticItem(host, item({ type: 'relation.reverse', arrowId: 'edge' }))).toMatchObject({ ok: true, operations: [{ expected: { id: 'edge' }, next: { from: 'b', to: 'a' } }] })
  })

  it('builds a proposal-bound immutable plan for an explicitly accepted subset', async () => {
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => { host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }); host.upsert({ id: 'b', kind: 'card', x: 2, y: 0, w: 1, h: 1, rotation: 0 }) })
    const semantic = item({ type: 'relation.add', from: 'a', to: 'b', relation: 'blocks' })
    const envelope: ProposalEnvelopeV1 = {
      kind: 'cys-proposal-envelope', version: 1, proposalId: 'proposal:unique', snapshotId: 'ws', canvasId: 'canvas',
      baseRevisions: { content: 'c', relations: 'r', geometry: 'g' }, sourceRefs: [], promptVersion: 'p', schemaVersion: 1,
      provider: { id: 'fixture', model: 'fixture' }, payloadHash: 'hash',
      payload: { kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [], items: [semantic] },
    }
    const review: ProposalReviewRecordV1 = { proposalId: envelope.proposalId, decisions: { item: 'accepted' }, execution: { item: { state: 'not-compiled' } }, staleCauses: [] }
    const result = await compileSemanticProposalPlan(host, envelope, review)
    expect(result).toMatchObject({ ok: true, plan: { itemIds: ['item'], elementChanges: [{ id: 'proposal-arrow:proposal%3Aunique:item', expected: null }] } })
  })
})
