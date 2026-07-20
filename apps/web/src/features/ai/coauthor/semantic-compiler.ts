import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import type { ProposalEnvelopeV1, ProposalItemV1, ProposalReviewRecordV1 } from './proposal-contract'
import { itemCapability } from './proposal-capabilities'
import { compileCompositePlan } from './composite-plan'
import { createProposalCommitPlan, type ProposalCommitPlanV1 } from './proposal-transaction'

export type SemanticOperation =
  | { itemId: string; type: 'upsert'; id: string; expected: CanvasElement | null; next: CanvasElement }
  | { itemId: string; type: 'remove'; id: string; expected: CanvasElement }

export type SemanticCompileResult = { ok: true; operations: SemanticOperation[] } | { ok: false; itemId: string; code: string }

function arrowId(proposalId: string, itemId: string): string {
  return `proposal-arrow:${encodeURIComponent(proposalId)}:${encodeURIComponent(itemId)}`
}

export function compileSemanticItem(host: CanvasHost, item: ProposalItemV1, proposalId = 'local'): SemanticCompileResult {
  if (item.lane !== 'semantic') return { ok: false, itemId: item.itemId, code: 'NOT_SEMANTIC' }
  if (itemCapability(item) !== 'executable') return { ok: false, itemId: item.itemId, code: 'DEFERRED_CAPABILITY' }
  switch (item.action.type) {
    case 'relation.add': {
      const from = host.getElement(item.action.from); const to = host.getElement(item.action.to)
      if (!from || !to) return { ok: false, itemId: item.itemId, code: 'MISSING_ENDPOINT' }
      const id = arrowId(proposalId, item.itemId); const expected = host.getElement(id) ?? null
      if (expected) return { ok: false, itemId: item.itemId, code: 'RELATION_ALREADY_EXISTS' }
      return { ok: true, operations: [{ itemId: item.itemId, type: 'upsert', id, expected: null, next: { id, kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: from.id, to: to.id, text: item.action.relation, color: item.action.relation === 'blocks' ? 'red' : 'grey', dash: item.action.relation === 'blocks' ? 'solid' : 'dotted', arrowhead: 'arrow' } }] }
    }
    case 'relation.remove': {
      const expected = host.getElement(item.action.arrowId)
      return expected?.kind === 'arrow' ? { ok: true, operations: [{ itemId: item.itemId, type: 'remove', id: expected.id, expected }] } : { ok: false, itemId: item.itemId, code: 'MISSING_ARROW' }
    }
    case 'relation.reverse': {
      const expected = host.getElement(item.action.arrowId)
      if (!expected || expected.kind !== 'arrow' || !expected.from || !expected.to) return { ok: false, itemId: item.itemId, code: 'MISSING_ARROW' }
      return { ok: true, operations: [{ itemId: item.itemId, type: 'upsert', id: expected.id, expected, next: { ...expected, from: expected.to, to: expected.from } }] }
    }
  }
}

export type SemanticPlanResult =
  | { ok: true; plan: ProposalCommitPlanV1 }
  | { ok: false; code: string; itemIds: string[] }

export async function compileSemanticProposalPlan(
  host: CanvasHost,
  envelope: ProposalEnvelopeV1,
  review: ProposalReviewRecordV1,
): Promise<SemanticPlanResult> {
  const composite = await compileCompositePlan(envelope.proposalId, envelope.payload, review)
  if (!composite.ok) return composite
  const items = composite.plan.orderedItemIds.map((id) => envelope.payload.items.find((item) => item.itemId === id)!)
  const unsupported = items.filter((item) => item.lane !== 'semantic').map((item) => item.itemId)
  if (unsupported.length) return { ok: false, code: 'UNSUPPORTED_ACCEPTED_LANE', itemIds: unsupported }
  const operations: SemanticOperation[] = []
  for (const item of items) {
    const result = compileSemanticItem(host, item, envelope.proposalId)
    if (!result.ok) return { ok: false, code: result.code, itemIds: [result.itemId] }
    operations.push(...result.operations)
  }
  const plan = await createProposalCommitPlan({
    planId: composite.plan.planId,
    proposalId: envelope.proposalId,
    canvasId: envelope.canvasId,
    itemIds: composite.plan.orderedItemIds,
    cardChanges: [],
    elementChanges: operations.map((operation) => ({
      itemId: operation.itemId,
      id: operation.id,
      expected: operation.expected,
      next: operation.type === 'remove' ? null : operation.next,
    })),
  })
  return { ok: true, plan }
}
