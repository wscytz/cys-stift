import type { CardService, CardId, CreateCardInput } from '@cys-stift/domain'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import type { ProposalEnvelopeV1, ProposalItemV1, ProposalReviewRecordV1 } from './proposal-contract'
import { compileCompositePlan } from './composite-plan'
import { compileSemanticItem } from './semantic-compiler'
import { createProposalCommitPlan, type ProposalCommitPlanV1 } from './proposal-transaction'

export type IdeaCompileResult = { ok: true; input: CreateCardInput } | { ok: false; code: string }

/** Produces a local CardService input only. ID generation and persistence stay
 * outside the model-owned payload so a model never controls persistent IDs. */
export function compileIdeaItem(proposalId: string, item: ProposalItemV1): IdeaCompileResult {
  if (item.lane !== 'idea') return { ok: false, code: 'NOT_IDEA' }
  return {
    ok: true,
    input: {
      title: item.candidate.title,
      ...(item.candidate.body ? { body: item.candidate.body } : {}),
      source: { kind: 'ai-proposal', proposalId, itemId: item.itemId },
    },
  }
}

function localCardId(proposalId: string, itemId: string): CardId {
  // proposalId and itemId are system-validated unique identities. Deriving
  // the card ID from them makes repeated/cross-tab compilation produce the
  // same immutable plan hash while expected:null still blocks double apply.
  return `ai-card:${encodeURIComponent(proposalId)}:${encodeURIComponent(itemId)}` as CardId
}

function proposalTimestamp(envelope: ProposalEnvelopeV1): Date {
  const time = envelope.createdAt ? Date.parse(envelope.createdAt) : Number.NaN
  // Old persisted envelopes predate the timestamp field. Epoch is a stable
  // compatibility fallback; all newly generated envelopes carry the snapshot
  // creation time above.
  return new Date(Number.isFinite(time) ? time : 0)
}

export type IdeaPlanResult = { ok: true; plan: ProposalCommitPlanV1 } | { ok: false; code: string; itemIds: string[] }

export async function compileIdeaProposalPlan(host: CanvasHost, envelope: ProposalEnvelopeV1, review: ProposalReviewRecordV1, service: CardService): Promise<IdeaPlanResult> {
  const composite = await compileCompositePlan(envelope.proposalId, envelope.payload, review, { allowDeferred: true })
  if (!composite.ok) return composite
  const accepted = composite.plan.orderedItemIds.map((id) => envelope.payload.items.find((item) => item.itemId === id)!)
  if (accepted.some((item) => item.lane === 'layout')) return { ok: false, code: 'LAYOUT_REQUIRES_SEPARATE_ACCEPT', itemIds: accepted.filter((item) => item.lane === 'layout').map((item) => item.itemId) }
  const elementChanges: ProposalCommitPlanV1['elementChanges'] = []
  for (const item of accepted.filter((candidate) => candidate.lane === 'semantic')) {
    const compiled = compileSemanticItem(host, item, envelope.proposalId)
    if (!compiled.ok) return { ok: false, code: compiled.code, itemIds: [compiled.itemId] }
    elementChanges.push(...compiled.operations.map((operation) => ({ itemId: operation.itemId, id: operation.id, expected: operation.expected, next: operation.type === 'remove' ? null : operation.next })))
  }
  const cardChanges = [] as ProposalCommitPlanV1['cardChanges']
  const timestamp = proposalTimestamp(envelope)
  for (const item of accepted.filter((candidate) => candidate.lane === 'idea')) {
    const compiled = compileIdeaItem(envelope.proposalId, item)
    if (!compiled.ok) return { ok: false, code: compiled.code, itemIds: [item.itemId] }
    const id = localCardId(envelope.proposalId, item.itemId)
    const materialized = service.materializeWithId(id, compiled.input)
    cardChanges.push({
      itemId: item.itemId,
      id,
      expected: null,
      next: { ...materialized, capturedAt: timestamp, createdAt: timestamp, updatedAt: timestamp },
    })
  }
  if (cardChanges.length === 0) return { ok: false, code: 'NO_IDEA_ITEM', itemIds: [] }
  return { ok: true, plan: await createProposalCommitPlan({ planId: composite.plan.planId, proposalId: envelope.proposalId, canvasId: envelope.canvasId, itemIds: composite.plan.orderedItemIds, cardChanges, elementChanges }) }
}
