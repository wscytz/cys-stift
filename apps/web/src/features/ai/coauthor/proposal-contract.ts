import type { IntentOp } from '../intent-ir'
import type { SourceRefV1, WorkingSetRevisionV1 } from './working-set-types'

export const PROPOSAL_PAYLOAD_VERSION = 1 as const
export const PROPOSAL_CAPS = {
  findings: 128,
  items: 256,
  refsPerItem: 16,
  dependenciesPerItem: 32,
  conflictsPerItem: 32,
  text: 4_000,
  summary: 8_000,
  totalBytes: 1_000_000,
  nestingDepth: 12,
} as const

export type ProposalLane = 'semantic' | 'idea' | 'layout'
export type EvidenceRole = 'supports' | 'contradicts' | 'targets' | 'inspired-by'
export type EvidenceEdgeV1 = { refId: string; role: EvidenceRole }
export type ProposalFindingKind =
  | 'relation-cycle'
  | 'orphan-step'
  | 'duplicate-step'
  | 'missing-precondition'
  | 'unclear-owner-or-output'
  | 'suspicious-block-direction'
  | 'dangling-relation'
  | 'relation-invariant'

export interface ProposalFindingV1 {
  findingId: string
  kind: ProposalFindingKind
  title: string
  explanation: string
  evidence: EvidenceEdgeV1[]
  uncertainty: 'low' | 'medium' | 'high'
  proposalItemIds: string[]
}

export interface ProposalItemBaseV1 {
  itemId: string
  lane: ProposalLane
  findingId?: string
  evidence: EvidenceEdgeV1[]
  dependsOn: string[]
  conflictsWith: string[]
  atomicGroupId?: string
  reason: string
}

export type SemanticActionV1 =
  | { type: 'relation.add'; from: string; to: string; relation: 'blocks' | 'related-to'; label?: string }
  | { type: 'relation.remove'; arrowId: string }
  | { type: 'relation.reverse'; arrowId: string }

export interface LayoutIntentDraftV1 {
  mode: 'layout'
  ops: IntentOp[]
}

export type ProposalItemV1 =
  | (ProposalItemBaseV1 & { lane: 'semantic'; action: SemanticActionV1 })
  | (ProposalItemBaseV1 & { lane: 'idea'; candidate: { title: string; body?: string; promptedByRefIds: string[] } })
  | (ProposalItemBaseV1 & { lane: 'layout'; intent: LayoutIntentDraftV1 })

/** Immutable, model-owned content. No canvas, revision, decision or execution
 * field may appear here. */
export interface ProposalPayloadV1 {
  kind: 'cys-proposal-payload'
  version: typeof PROPOSAL_PAYLOAD_VERSION
  task: 'plan-structure-audit'
  summary: string
  findings: ProposalFindingV1[]
  items: ProposalItemV1[]
}

/** System-owned envelope, assembled only after strict payload validation. */
export interface ProposalEnvelopeV1 {
  kind: 'cys-proposal-envelope'
  version: 1
  proposalId: string
  /** Working-set creation time used to make generated Idea cards stable when
   * the same persisted proposal is compiled in another tab. Optional for
   * pre-determinism stored envelopes. */
  createdAt?: string
  snapshotId: string
  canvasId: string
  baseRevisions: WorkingSetRevisionV1
  /** Stable, text-free anchors retained so a recovered review can still
   * locate its evidence without re-reading or re-sending card bodies. */
  sourceRefs: SourceRefV1[]
  promptVersion: string
  schemaVersion: 1
  provider: { id: string; model: string; finishReason?: string; usage?: { input: number; output: number } }
  payloadHash: string
  payload: ProposalPayloadV1
}

export type ReviewDecision = 'pending' | 'accepted' | 'rejected'
export type ExecutionState = 'not-compiled' | 'blocked' | 'ready' | 'stale' | 'applying' | 'applied' | 'failed' | 'rolled-back'

/** User-owned, mutable state. It is intentionally separate from Payload. */
export interface ProposalReviewRecordV1 {
  proposalId: string
  decisions: Record<string, ReviewDecision>
  /** Per-item clocks let independent decisions from different tabs merge
   * without a stale tab resetting another item back to pending. */
  decisionUpdatedAt?: Record<string, string>
  execution: Record<string, { state: ExecutionState; reasonCode?: string }>
  /** Position locks are review-owned decisions. Card.pinned remains an
   * importance marker and is deliberately not reused as a geometry lock. */
  keepPositionIds?: string[]
  keepPositionUpdatedAt?: Record<string, string>
  reviewedAt?: string
  staleCauses: Array<{ lane: ProposalLane; revision: keyof WorkingSetRevisionV1; message: string }>
}
