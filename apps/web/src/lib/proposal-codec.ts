import type { ProposalEnvelopeV1, ProposalReviewRecordV1 } from '@/features/ai/coauthor/proposal-contract'
import type { IntentOp } from '@/features/ai/intent-ir'
import { validateProposalPayload } from '@/features/ai/coauthor/proposal-validation'
import { canonicalJson, sha256Hex } from '@/features/ai/coauthor/working-set-revision'

export interface StoredProposalV1 {
  v: 1
  envelope: ProposalEnvelopeV1
  review: ProposalReviewRecordV1
  updatedAt: number
}

/** Minimal structural validation at the persistence boundary. Payload contents
 * are validated before construction; corrupt storage is quarantined instead
 * of being converted into an empty, apparently successful review list. */
function intentTargets(op: IntentOp): string[] {
  if ('targets' in op && Array.isArray(op.targets)) return op.targets
  return []
}

export async function decodeStoredProposal(raw: string): Promise<StoredProposalV1 | null> {
  try {
    const value = JSON.parse(raw) as Partial<StoredProposalV1>
    if (value.v !== 1 || !value.envelope || !value.review || typeof value.updatedAt !== 'number') return null
    if (value.envelope.kind !== 'cys-proposal-envelope' || value.envelope.version !== 1) return null
    if (typeof value.envelope.proposalId !== 'string' || value.review.proposalId !== value.envelope.proposalId) return null
    if (!Array.isArray(value.envelope.sourceRefs)) return null
    if (!value.envelope.payload || value.envelope.payload.kind !== 'cys-proposal-payload') return null
    if (!value.review.decisions || !value.review.execution || !Array.isArray(value.review.staleCauses)) return null
    if (await sha256Hex(canonicalJson(value.envelope.payload)) !== value.envelope.payloadHash) return null
    const elementIds = new Set(value.envelope.sourceRefs.map((ref) => ref.entityId))
    const arrowIds = new Set<string>()
    for (const item of value.envelope.payload.items) {
      if (item.lane === 'semantic') {
        if (item.action.type === 'relation.add') { elementIds.add(item.action.from); elementIds.add(item.action.to) }
        else arrowIds.add(item.action.arrowId)
      } else if (item.lane === 'layout') for (const op of item.intent.ops) for (const id of intentTargets(op)) elementIds.add(id)
    }
    const validated = validateProposalPayload(value.envelope.payload, {
      sourceRefIds: new Set(value.envelope.sourceRefs.map((ref) => ref.refId)),
      elementIds,
      arrowIds,
      baseRevision: value.envelope.baseRevisions.geometry,
    })
    if (!validated.ok) return null
    return value as StoredProposalV1
  } catch { return null }
}
