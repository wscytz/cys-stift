import type { CanvasHost } from '@cys-stift/canvas-engine'
import type { CardService } from '@cys-stift/domain'
import { compileCompositePlan } from './composite-plan'
import { compileIdeaProposalPlan } from './idea-compiler'
import { compileLayoutProposalPlan } from './layout-compiler'
import type { ProposalEnvelopeV1, ProposalItemV1, ProposalReviewRecordV1 } from './proposal-contract'
import { compileSemanticProposalPlan } from './semantic-compiler'
import { createProposalCommitPlan, type ProposalCommitPlanV1 } from './proposal-transaction'

export type ProposalPlanResult =
  | { ok: true; plan: ProposalCommitPlanV1 }
  | { ok: false; code: string; itemIds: string[] }

function subset(
  envelope: ProposalEnvelopeV1,
  review: ProposalReviewRecordV1,
  items: ProposalItemV1[],
): { envelope: ProposalEnvelopeV1; review: ProposalReviewRecordV1 } {
  const itemIds = new Set(items.map((item) => item.itemId))
  const scopedItems = items.map((item) => ({
    ...item,
    dependsOn: item.dependsOn.filter((itemId) => itemIds.has(itemId)),
    conflictsWith: item.conflictsWith.filter((itemId) => itemIds.has(itemId)),
    atomicGroupId: undefined,
  })) as ProposalItemV1[]
  return {
    envelope: {
      ...envelope,
      payload: {
        ...envelope.payload,
        items: scopedItems,
        findings: envelope.payload.findings.map((finding) => ({
          ...finding,
          proposalItemIds: finding.proposalItemIds.filter((itemId) => itemIds.has(itemId)),
        })),
      },
    },
    review: {
      ...review,
      decisions: Object.fromEntries(Object.entries(review.decisions).filter(([itemId]) => itemIds.has(itemId))),
      execution: Object.fromEntries(Object.entries(review.execution).filter(([itemId]) => itemIds.has(itemId))),
    },
  }
}

/** Compiles every accepted lane into one immutable transaction plan. Lane
 * compilers remain separate, but the user never has to Apply Ideas and Layout
 * in unrelated transactions after accepting them together. */
export async function compileProposalPlan(
  host: CanvasHost,
  envelope: ProposalEnvelopeV1,
  review: ProposalReviewRecordV1,
  service: CardService,
): Promise<ProposalPlanResult> {
  const composite = await compileCompositePlan(envelope.proposalId, envelope.payload, review, { allowDeferred: true })
  if (!composite.ok) return composite
  const accepted = composite.plan.orderedItemIds.map((id) => envelope.payload.items.find((item) => item.itemId === id)!)
  if (accepted.length === 0) return { ok: false, code: 'NO_ACCEPTED_ITEMS', itemIds: [] }

  const logicAndLayout = accepted.filter((item) => item.lane !== 'idea')
  const ideas = accepted.filter((item) => item.lane === 'idea')
  const plans: ProposalCommitPlanV1[] = []

  if (logicAndLayout.length > 0) {
    const scoped = subset(envelope, review, logicAndLayout)
    const compiled = logicAndLayout.some((item) => item.lane === 'layout')
      ? await compileLayoutProposalPlan(host, scoped.envelope, scoped.review, service)
      : await compileSemanticProposalPlan(host, scoped.envelope, scoped.review)
    if (!compiled.ok) return compiled
    plans.push(compiled.plan)
  }

  if (ideas.length > 0) {
    const scoped = subset(envelope, review, ideas)
    const compiled = await compileIdeaProposalPlan(host, scoped.envelope, scoped.review, service)
    if (!compiled.ok) return compiled
    plans.push(compiled.plan)
  }

  return {
    ok: true,
    plan: await createProposalCommitPlan({
      planId: composite.plan.planId,
      proposalId: envelope.proposalId,
      canvasId: envelope.canvasId,
      itemIds: composite.plan.orderedItemIds,
      cardChanges: plans.flatMap((plan) => plan.cardChanges),
      elementChanges: plans.flatMap((plan) => plan.elementChanges),
    }),
  }
}
