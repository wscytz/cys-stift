import { describe, expect, it } from 'vitest'
import { createProposalReviewState, reduceProposalReview } from '../proposal-reducer'
import type { ProposalPayloadV1 } from '../proposal-contract'

const payload: ProposalPayloadV1 = {
  kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [],
  items: [
    { itemId: 'first', lane: 'semantic', evidence: [{ refId: 'src', role: 'targets' }], dependsOn: [], conflictsWith: [], reason: '', action: { type: 'relation.reverse', arrowId: 'edge' } },
    { itemId: 'second', lane: 'semantic', evidence: [{ refId: 'src', role: 'targets' }], dependsOn: ['first'], conflictsWith: [], reason: '', action: { type: 'relation.reverse', arrowId: 'edge' } },
  ],
}

describe('proposal reducer', () => {
  it('requires explicit dependency acceptance and preserves decision/execution separation', () => {
    let state = createProposalReviewState('p', payload)
    const generating = reduceProposalReview(payload, state, { type: 'begin-generation' })
    expect(generating.ok).toBe(true)
    if (!generating.ok) return
    const reviewing = reduceProposalReview(payload, generating.state, { type: 'begin-review' })
    expect(reviewing.ok).toBe(true)
    if (!reviewing.ok) return
    const blocked = reduceProposalReview(payload, reviewing.state, { type: 'decide', itemId: 'second', decision: 'accepted', at: 'now' })
    expect(blocked).toMatchObject({ ok: false, code: 'DEPENDENCIES_REQUIRED', requiredItemIds: ['first'] })
    expect(reviewing.state.record.decisions.second).toBe('pending')
    const accepted = reduceProposalReview(payload, reviewing.state, { type: 'decide', itemId: 'first', decision: 'accepted', at: 'now' })
    expect(accepted.ok).toBe(true)
    if (accepted.ok) expect(accepted.state.record.execution.first?.state).toBe('not-compiled')
  })
})
