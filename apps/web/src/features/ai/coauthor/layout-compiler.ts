import { InMemoryCanvasHost, type CanvasElement, type CanvasHost } from '@cys-stift/canvas-engine'
import type { CardService, CanvasId } from '@cys-stift/domain'
import { compileIntent } from '../intent-compiler'
import { intentSnapshotFromHost, toCanvasElement, toIntentElement } from '../intent-host-adapter'
import { validateIntent } from '../intent-validation'
import type { IntentIR } from '../intent-ir'
import type { ProposalEnvelopeV1, ProposalItemV1, ProposalReviewRecordV1 } from './proposal-contract'
import { compileCompositePlan } from './composite-plan'
import { compileSemanticItem, type SemanticOperation } from './semantic-compiler'
import { createProposalCommitPlan, type ProposalCommitPlanV1 } from './proposal-transaction'
import { isFullyInsideFrame } from '@/features/canvas/frame-membership'

export type LayoutCompileResult = { ok: true; intent: IntentIR } | { ok: false; code: string }

/** Converts the model's declarative layout draft into the existing guarded
 * Intent IR. Coordinates remain solely a solver output. */
export function compileLayoutItem(item: ProposalItemV1, baseRevision: string, keepPositionIds: ReadonlySet<string> = new Set()): LayoutCompileResult {
  if (item.lane !== 'layout') return { ok: false, code: 'NOT_LAYOUT' }
  // A model-supplied pin is only a suggestion. Position locks are review-owned
  // decisions, so discard model pins and inject the explicit user choices.
  const modelOps = item.intent.ops.filter((op) => op.op !== 'pin')
  const pins = [...keepPositionIds].sort().map((target) => ({ op: 'pin' as const, target }))
  const candidate: IntentIR = { kind: 'cys-intent', version: 1, baseRevision, mode: item.intent.mode, ops: [...pins, ...modelOps] }
  const validated = validateIntent(candidate)
  return validated.ok ? { ok: true, intent: validated.value } : { ok: false, code: validated.diagnostics[0]?.code ?? 'INVALID_LAYOUT_INTENT' }
}

export type LayoutPlanResult = { ok: true; plan: ProposalCommitPlanV1 } | { ok: false; code: string; itemIds: string[] }

function titleOrderIsAvailable(item: ProposalItemV1, host: CanvasHost): boolean {
  if (item.lane !== 'layout') return true
  const needsTitles = item.intent.ops.some((op) => op.op === 'layout' && op.order === 'title')
  if (!needsTitles) return true
  const elements = new Map(host.getElements().map((element) => [element.id, element]))
  return item.intent.ops
    .filter((op): op is Extract<typeof op, { op: 'layout' }> => op.op === 'layout' && op.order === 'title')
    .every((op) => op.targets.every((id: string) => {
      const element = elements.get(id)
      return !!element?.text?.trim()
    }))
}

function leavesFrame(expected: CanvasElement, next: CanvasElement, elements: readonly CanvasElement[]): boolean {
  return elements
    .filter((element) => element.kind === 'frame' && isFullyInsideFrame(expected, element))
    .some((frame) => !isFullyInsideFrame(next, frame))
}

/** Compile semantic decisions first, then solve layout against that projected
 * scene. The live host is never mutated during preview compilation. */
export async function compileLayoutProposalPlan(
  host: CanvasHost,
  envelope: ProposalEnvelopeV1,
  review: ProposalReviewRecordV1,
  service: CardService,
): Promise<LayoutPlanResult> {
  const composite = await compileCompositePlan(envelope.proposalId, envelope.payload, review)
  if (!composite.ok) return composite
  const accepted = composite.plan.orderedItemIds.map((id) => envelope.payload.items.find((item) => item.itemId === id)!)
  if (accepted.some((item) => item.lane === 'idea')) return { ok: false, code: 'IDEA_REQUIRES_SEPARATE_ACCEPT', itemIds: accepted.filter((item) => item.lane === 'idea').map((item) => item.itemId) }
  const projected = new InMemoryCanvasHost()
  projected.applyWithoutEcho(() => { for (const element of host.getElements()) projected.upsert(structuredClone(element)) })
  const semanticOps: SemanticOperation[] = []
  for (const item of accepted.filter((candidate) => candidate.lane === 'semantic')) {
    const compiled = compileSemanticItem(projected, item, envelope.proposalId)
    if (!compiled.ok) return { ok: false, code: compiled.code, itemIds: [compiled.itemId] }
    semanticOps.push(...compiled.operations)
    for (const operation of compiled.operations) operation.type === 'remove' ? projected.remove(operation.id) : projected.upsert(operation.next)
  }
  const layoutItems = accepted.filter((item) => item.lane === 'layout')
  if (layoutItems.length === 0) return { ok: false, code: 'NO_LAYOUT_ITEM', itemIds: [] }
  const layoutOps: Array<{ itemId: string; expected: CanvasElement; next: CanvasElement }> = []
  for (const item of layoutItems) {
    if (item.intent.ops.some((op) => op.op === 'layout' && (op.mode === 'tree' || op.mode === 'dag'))) {
      return { ok: false, code: 'LAYOUT_MODE_UNSUPPORTED', itemIds: [item.itemId] }
    }
    if (!titleOrderIsAvailable(item, projected)) return { ok: false, code: 'TITLE_ORDER_UNAVAILABLE', itemIds: [item.itemId] }
    const keepPositionIds = new Set(review.keepPositionIds ?? [])
    const validIds = new Set(projected.getElements().map((element) => element.id))
    if ([...keepPositionIds].some((id) => !validIds.has(id))) return { ok: false, code: 'KEEP_POSITION_TARGET_MISSING', itemIds: [item.itemId] }
    const compiled = compileLayoutItem(item, envelope.baseRevisions.geometry, keepPositionIds)
    if (!compiled.ok) return { ok: false, code: compiled.code, itemIds: [item.itemId] }
    const snapshot = { ...intentSnapshotFromHost(projected), revision: envelope.baseRevisions.geometry }
    const solved = compileIntent(compiled.intent, snapshot)
    if (!solved.ok || solved.plan.ops.some((op) => op.status === 'blocked')) return { ok: false, code: solved.ok ? (solved.plan.ops.find((op) => op.status === 'blocked')?.reasonCode ?? 'LAYOUT_BLOCKED') : (solved.diagnostics[0]?.code ?? 'LAYOUT_BLOCKED'), itemIds: [item.itemId] }
    for (const operation of solved.plan.ops.flatMap((op) => op.actions)) {
      const expected = host.getElement(operation.elementId)
      if (!expected) continue
      const next = toCanvasElement(operation.next)
      if (leavesFrame(expected, next, projected.getElements())) return { ok: false, code: 'FRAME_CONTAINMENT', itemIds: [item.itemId] }
      layoutOps.push({ itemId: item.itemId, expected, next })
      projected.upsert(next)
    }
  }
  const combined = new Map<string, { itemId: string; id: string; expected: CanvasElement | null; next: CanvasElement | null }>()
  for (const operation of semanticOps) combined.set(operation.id, { itemId: operation.itemId, id: operation.id, expected: operation.expected, next: operation.type === 'remove' ? null : operation.next })
  for (const operation of layoutOps) {
    const existing = combined.get(operation.next.id)
    combined.set(operation.next.id, { itemId: operation.itemId, id: operation.next.id, expected: existing?.expected ?? operation.expected, next: operation.next })
  }
  const cardChanges = [...combined.values()].flatMap((change) => {
    if (change.next?.kind !== 'card' && change.expected?.kind !== 'card') return []
    const id = change.next?.id ?? change.expected?.id
    const current = service.get(id as never)
    if (!current) return []
    const next = change.next
    return [{ itemId: change.itemId, id: current.id, expected: current, next: next ? { ...current, canvasPosition: { canvasId: envelope.canvasId as CanvasId, x: next.x, y: next.y, w: next.w, h: next.h, z: current.canvasPosition?.z ?? 0, rotation: next.rotation ?? 0 }, updatedAt: current.updatedAt } : null }]
  })
  const plan = await createProposalCommitPlan({
    planId: composite.plan.planId, proposalId: envelope.proposalId, canvasId: envelope.canvasId, itemIds: composite.plan.orderedItemIds,
    cardChanges,
    elementChanges: [...combined.values()],
  })
  return { ok: true, plan }
}
