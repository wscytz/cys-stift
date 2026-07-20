import { itemCapability } from './proposal-capabilities'
import type { ProposalItemV1, ProposalPayloadV1, ProposalReviewRecordV1 } from './proposal-contract'
import { canonicalJson, sha256Hex } from './working-set-revision'

export interface CompositePlanV1 {
  planId: string
  proposalId: string
  acceptedItemIds: string[]
  orderedItemIds: string[]
  hash: string
}

export type CompositePlanResult = { ok: true; plan: CompositePlanV1 } | { ok: false; code: string; itemIds: string[] }

/** Rechecks decision closure immediately before preview/commit. Review UI state
 * is advisory; it cannot grant an invalid subset execution authority. */
export async function compileCompositePlan(proposalId: string, payload: ProposalPayloadV1, review: ProposalReviewRecordV1, options?: { allowDeferred?: boolean }): Promise<CompositePlanResult> {
  const accepted = payload.items.filter((item) => review.decisions[item.itemId] === 'accepted')
  const acceptedIds = new Set(accepted.map((item) => item.itemId))
  const acceptedGroups = new Set(accepted.map((item) => item.atomicGroupId).filter((id): id is string => !!id))
  for (const groupId of acceptedGroups) {
    const missing = payload.items.filter((item) => item.atomicGroupId === groupId && !acceptedIds.has(item.itemId)).map((item) => item.itemId)
    if (missing.length) return { ok: false, code: 'ATOMIC_GROUP_INCOMPLETE', itemIds: missing }
  }
  for (const item of accepted) {
    if (itemCapability(item) === 'deferred' && !options?.allowDeferred) return { ok: false, code: 'DEFERRED_CAPABILITY', itemIds: [item.itemId] }
    const missing = item.dependsOn.filter((id) => !acceptedIds.has(id))
    if (missing.length) return { ok: false, code: 'DEPENDENCY_NOT_ACCEPTED', itemIds: [item.itemId, ...missing] }
    const conflicts = item.conflictsWith.filter((id) => acceptedIds.has(id))
    if (conflicts.length) return { ok: false, code: 'CONFLICT_ACCEPTED', itemIds: [item.itemId, ...conflicts] }
  }
  const byId = new Map(accepted.map((item) => [item.itemId, item] as const))
  const ordered: ProposalItemV1[] = []; const seen = new Set<string>(); const visiting = new Set<string>()
  const visit = (id: string): boolean => {
    if (seen.has(id)) return true
    if (visiting.has(id)) return false
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependsOn ?? []) if (!visit(dependency)) return false
    visiting.delete(id); seen.add(id); const item = byId.get(id); if (item) ordered.push(item); return true
  }
  for (const item of accepted) if (!visit(item.itemId)) return { ok: false, code: 'DEPENDENCY_CYCLE', itemIds: accepted.map((item) => item.itemId) }
  const acceptedItemIds = ordered.map((item) => item.itemId)
  const hash = await sha256Hex(canonicalJson({ proposalId, payloadHashable: ordered, acceptedItemIds }))
  return { ok: true, plan: { planId: `plan:${hash}`, proposalId, acceptedItemIds, orderedItemIds: acceptedItemIds, hash } }
}
