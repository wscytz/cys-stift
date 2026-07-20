import type {
  ExecutionState,
  ProposalPayloadV1,
  ProposalReviewRecordV1,
  ReviewDecision,
} from './proposal-contract'

export type ProposalLifecycle =
  | 'capturing'
  | 'generating'
  | 'reviewing'
  | 'compiling'
  | 'previewing'
  | 'committing'
  | 'committed'
  | 'cancelled'
  | 'interrupted'
  | 'stale'
  | 'failed'
  | 'undone'
  | 'archived'

export interface ProposalReviewState {
  lifecycle: ProposalLifecycle
  record: ProposalReviewRecordV1
}

export type ProposalReviewEvent =
  | { type: 'begin-generation' }
  | { type: 'begin-review' }
  | { type: 'decide'; itemId: string; decision: Exclude<ReviewDecision, 'pending'>; at: string }
  | { type: 'set-keep-position'; elementId: string; enabled: boolean; at: string }
  | { type: 'start-compiling' }
  | { type: 'show-preview' }
  | { type: 'start-commit' }
  | { type: 'commit-succeeded' }
  | { type: 'mark-stale'; itemIds: string[]; reasonCode: string }
  | { type: 'set-execution'; itemId: string; state: ExecutionState; reasonCode?: string }
  | { type: 'cancel' }
  | { type: 'fail' }
  | { type: 'undo' }
  | { type: 'archive' }

export type ProposalReducerResult =
  | { ok: true; state: ProposalReviewState }
  | { ok: false; code: string; message: string; state: ProposalReviewState; requiredItemIds?: string[] }

const TRANSITIONS: Record<ProposalLifecycle, readonly ProposalLifecycle[]> = {
  capturing: ['generating', 'cancelled', 'archived'],
  generating: ['reviewing', 'interrupted', 'failed', 'cancelled', 'archived'],
  reviewing: ['compiling', 'stale', 'cancelled', 'archived'],
  compiling: ['previewing', 'failed', 'stale', 'archived'],
  previewing: ['committing', 'reviewing', 'stale', 'cancelled', 'archived'],
  committing: ['committed', 'failed', 'stale', 'archived'],
  committed: ['undone', 'archived'],
  cancelled: ['archived'],
  interrupted: ['archived'],
  stale: ['reviewing', 'archived'],
  failed: ['reviewing', 'archived'],
  undone: ['archived'],
  archived: [],
}

function transition(state: ProposalReviewState, next: ProposalLifecycle): ProposalReducerResult {
  if (!TRANSITIONS[state.lifecycle].includes(next)) {
    return { ok: false, code: 'INVALID_TRANSITION', message: `${state.lifecycle} cannot transition to ${next}`, state }
  }
  return { ok: true, state: { ...state, lifecycle: next } }
}

function itemById(payload: ProposalPayloadV1, itemId: string) {
  return payload.items.find((item) => item.itemId === itemId)
}

export function createProposalReviewState(proposalId: string, payload: ProposalPayloadV1): ProposalReviewState {
  const decisions: Record<string, ReviewDecision> = {}
  const execution: ProposalReviewRecordV1['execution'] = {}
  for (const item of payload.items) {
    decisions[item.itemId] = 'pending'
    execution[item.itemId] = { state: 'not-compiled' }
  }
  return {
    lifecycle: 'capturing',
    record: {
      proposalId,
      decisions,
      decisionUpdatedAt: {},
      execution,
      keepPositionIds: [],
      keepPositionUpdatedAt: {},
      staleCauses: [],
    },
  }
}

/** Pure state machine: acceptance never auto-accepts prerequisites, and an
 * execution state never silently changes the user's review decision. */
export function reduceProposalReview(
  payload: ProposalPayloadV1,
  state: ProposalReviewState,
  event: ProposalReviewEvent,
): ProposalReducerResult {
  switch (event.type) {
    case 'begin-generation': return transition(state, 'generating')
    case 'begin-review': return transition(state, 'reviewing')
    case 'start-compiling': return transition(state, 'compiling')
    case 'show-preview': return transition(state, 'previewing')
    case 'start-commit': return transition(state, 'committing')
    case 'commit-succeeded': return transition(state, 'committed')
    case 'cancel': return transition(state, 'cancelled')
    case 'fail': return transition(state, 'failed')
    case 'undo': return transition(state, 'undone')
    case 'archive': return transition(state, 'archived')
    case 'decide': {
      if (state.lifecycle !== 'reviewing') return { ok: false, code: 'NOT_REVIEWING', message: 'Decisions are only allowed while reviewing', state }
      const item = itemById(payload, event.itemId)
      if (!item) return { ok: false, code: 'UNKNOWN_ITEM', message: `Unknown item ${event.itemId}`, state }
      if (event.decision === 'accepted') {
        const requiredItemIds = item.dependsOn.filter((id) => state.record.decisions[id] !== 'accepted')
        if (requiredItemIds.length) return { ok: false, code: 'DEPENDENCIES_REQUIRED', message: 'Accept prerequisites explicitly first', state, requiredItemIds }
        const conflicting = item.conflictsWith.find((id) => state.record.decisions[id] === 'accepted')
        if (conflicting) return { ok: false, code: 'CONFLICT_ACCEPTED', message: `Conflicts with accepted item ${conflicting}`, state }
      }
      return {
        ok: true,
        state: {
          ...state,
          record: {
            ...state.record,
            decisions: { ...state.record.decisions, [item.itemId]: event.decision },
            decisionUpdatedAt: { ...state.record.decisionUpdatedAt, [item.itemId]: event.at },
            execution: Object.fromEntries(Object.keys(state.record.execution).map((itemId) => [itemId, { state: 'not-compiled' as const }])),
            reviewedAt: event.at,
          },
        },
      }
    }
    case 'set-keep-position': {
      if (state.lifecycle !== 'reviewing') return { ok: false, code: 'NOT_REVIEWING', message: 'Position locks are only editable while reviewing', state }
      const layoutTargets = new Set(payload.items.flatMap((item) => item.lane === 'layout'
        ? item.intent.ops.flatMap((op) => 'targets' in op ? op.targets : 'target' in op ? [op.target] : [])
        : []))
      if (!layoutTargets.has(event.elementId)) return { ok: false, code: 'UNKNOWN_LAYOUT_TARGET', message: `Unknown layout target ${event.elementId}`, state }
      const keepPositionIds = new Set(state.record.keepPositionIds ?? [])
      if (event.enabled) keepPositionIds.add(event.elementId)
      else keepPositionIds.delete(event.elementId)
      return {
        ok: true,
        state: {
          ...state,
          record: {
            ...state.record,
            keepPositionIds: [...keepPositionIds].sort(),
            keepPositionUpdatedAt: { ...state.record.keepPositionUpdatedAt, [event.elementId]: event.at },
            execution: Object.fromEntries(Object.keys(state.record.execution).map((itemId) => [itemId, { state: 'not-compiled' as const }])),
            reviewedAt: event.at,
          },
        },
      }
    }
    case 'mark-stale': {
      if (!TRANSITIONS[state.lifecycle].includes('stale')) return { ok: false, code: 'INVALID_TRANSITION', message: 'State cannot become stale', state }
      const execution = { ...state.record.execution }
      for (const itemId of event.itemIds) {
        if (!itemById(payload, itemId)) return { ok: false, code: 'UNKNOWN_ITEM', message: `Unknown item ${itemId}`, state }
        execution[itemId] = { state: 'stale', reasonCode: event.reasonCode }
      }
      return { ok: true, state: { lifecycle: 'stale', record: { ...state.record, execution } } }
    }
    case 'set-execution': {
      if (!itemById(payload, event.itemId)) return { ok: false, code: 'UNKNOWN_ITEM', message: `Unknown item ${event.itemId}`, state }
      const current = state.record.execution[event.itemId]?.state ?? 'not-compiled'
      const allowed: Record<ExecutionState, readonly ExecutionState[]> = {
        'not-compiled': ['blocked', 'ready', 'stale'], blocked: ['not-compiled', 'stale'], ready: ['applying', 'blocked', 'stale'],
        stale: [], applying: ['applied', 'failed', 'rolled-back'], applied: ['rolled-back'], failed: ['rolled-back'], 'rolled-back': [],
      }
      if (!allowed[current].includes(event.state)) return { ok: false, code: 'INVALID_EXECUTION_TRANSITION', message: `${current} cannot transition to ${event.state}`, state }
      return {
        ok: true,
        state: { ...state, record: { ...state.record, execution: { ...state.record.execution, [event.itemId]: { state: event.state, ...(event.reasonCode ? { reasonCode: event.reasonCode } : {}) } } } },
      }
    }
  }
}
