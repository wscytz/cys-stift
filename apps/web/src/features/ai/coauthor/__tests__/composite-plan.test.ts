import { describe, expect, it } from 'vitest'
import { compileCompositePlan } from '../composite-plan'
import type { ProposalPayloadV1, ProposalReviewRecordV1 } from '../proposal-contract'

describe('composite proposal plan', () => {
  it('refuses a partially accepted atomic group', async () => {
    const base = { lane: 'semantic' as const, evidence: [{ refId: 'src', role: 'targets' as const }], dependsOn: [], conflictsWith: [], reason: '', atomicGroupId: 'group' }
    const payload: ProposalPayloadV1 = { kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [], items: [
      { ...base, itemId: 'a', action: { type: 'relation.remove', arrowId: 'a' } },
      { ...base, itemId: 'b', action: { type: 'relation.remove', arrowId: 'b' } },
    ] }
    const review: ProposalReviewRecordV1 = { proposalId: 'p', decisions: { a: 'accepted', b: 'rejected' }, execution: {}, staleCauses: [] }
    expect(await compileCompositePlan('p', payload, review)).toEqual({ ok: false, code: 'ATOMIC_GROUP_INCOMPLETE', itemIds: ['b'] })
  })
})
