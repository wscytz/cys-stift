import type { ProposalPayloadV1 } from './proposal-contract'
import type { WorkingSetSnapshotV1 } from './working-set-types'

/** M3-only deterministic fixture. It exists to test scope, evidence, partial
 * decisions and source navigation before a provider or write path is wired. */
export function createStructureAuditFixture(snapshot: WorkingSetSnapshotV1): ProposalPayloadV1 | null {
  const cards = snapshot.geometry.filter((element) => element.kind === 'card')
  const refs = snapshot.sources.filter((source) => source.sourceKind === 'card')
  const first = cards[0]
  const second = cards[1]
  const source = refs[0]
  if (!first || !second || !source) return null
  return {
    kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit',
    summary: 'Fixture proposal for review interaction only.',
    findings: [{
      findingId: 'fixture-orphan', kind: 'orphan-step', title: 'Potential missing handoff',
      explanation: 'Review the selected steps and decide whether their dependency should be explicit.',
      evidence: [{ refId: source.refId, role: 'targets' }], uncertainty: 'high',
      proposalItemIds: ['fixture-relation', 'fixture-idea'],
    }],
    items: [
      {
        itemId: 'fixture-relation', lane: 'semantic', findingId: 'fixture-orphan',
        evidence: [{ refId: source.refId, role: 'targets' }], dependsOn: [], conflictsWith: [],
        reason: 'Make the reviewed dependency visible.',
        action: { type: 'relation.add', from: first.id, to: second.id, relation: 'blocks' },
      },
      {
        itemId: 'fixture-idea', lane: 'idea', findingId: 'fixture-orphan',
        evidence: [{ refId: source.refId, role: 'inspired-by' }], dependsOn: ['fixture-relation'], conflictsWith: [],
        reason: 'Candidate follow-up question; it is not a fact from the source.',
        candidate: { title: 'Clarify the handoff condition', body: 'What evidence marks this step as ready?', promptedByRefIds: [source.refId] },
      },
      {
        itemId: 'fixture-layout', lane: 'layout', findingId: 'fixture-orphan',
        evidence: [{ refId: source.refId, role: 'targets' }], dependsOn: [], conflictsWith: [],
        reason: 'Align reviewed cards for visual comparison.',
        intent: { mode: 'layout', ops: [{ op: 'align', targets: [first.id, second.id], axis: 'left' }] },
      },
    ],
  }
}
