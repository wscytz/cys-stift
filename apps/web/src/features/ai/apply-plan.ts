import type { IntentCanvasElement, IntentDiagnostic, IntentOp } from './intent-ir'

export interface IntentPlanAction {
  kind: 'upsert'
  elementId: string
  expected: IntentCanvasElement | null
  next: IntentCanvasElement
}

export interface IntentPlanOp {
  opId: string
  intent: IntentOp
  status: 'ready' | 'blocked'
  reasonCode?: string
  message?: string
  dependencyIds: string[]
  actions: IntentPlanAction[]
}

export interface IntentApplyPlan {
  version: 1
  planId: string
  baseRevision: string
  planHash: string
  ops: IntentPlanOp[]
}

export interface IntentApplyResult {
  opId: string
  status: 'applied' | 'skipped' | 'blocked' | 'failed'
  reasonCode?: string
  message?: string
  dependencyIds: string[]
}

export interface IntentApplyReport {
  planId: string
  baseRevision: string
  planHash: string
  totalOps: number
  applied: number
  skipped: number
  blocked: number
  failed: number
  cardsCreated: number
  cardsUpdated: number
  freeformChanged: number
  results: IntentApplyResult[]
  diagnostics: IntentDiagnostic[]
}

export type IntentPersistResult =
  | { ok: true }
  | { ok: false; code: 'quota' | 'conflict' | 'storage'; message: string }

export interface IntentCommitPort {
  getRevision(): string
  getElement(id: string): IntentCanvasElement | undefined
  persist(actions: readonly IntentPlanAction[]): Promise<IntentPersistResult>
  apply(actions: readonly IntentPlanAction[]): void
  compensate?(actions: readonly IntentPlanAction[]): Promise<boolean>
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(',')}}`
}

export function hashIntentPlan(value: unknown): string {
  const text = stableValue(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function reportFromResults(plan: IntentApplyPlan, results: IntentApplyResult[], diagnostics: IntentDiagnostic[]): IntentApplyReport {
  const count = (status: IntentApplyResult['status']) => results.filter((result) => result.status === status).length
  const changed = plan.ops
    .filter((op) => results.some((result) => result.opId === op.opId && result.status === 'applied'))
    .flatMap((op) => op.actions)
  const uniqueChanged = (predicate: (action: IntentPlanAction) => boolean) =>
    new Set(changed.filter(predicate).map((action) => action.elementId)).size
  return {
    planId: plan.planId,
    baseRevision: plan.baseRevision,
    planHash: plan.planHash,
    totalOps: plan.ops.length,
    applied: count('applied'),
    skipped: count('skipped'),
    blocked: count('blocked'),
    failed: count('failed'),
    cardsCreated: uniqueChanged((action) => action.next.kind === 'card' && action.expected === null),
    cardsUpdated: uniqueChanged((action) => action.next.kind === 'card' && action.expected !== null),
    freeformChanged: uniqueChanged((action) => action.next.kind !== 'card'),
    results,
    diagnostics,
  }
}

export async function commitIntentPlan(plan: IntentApplyPlan, port: IntentCommitPort): Promise<IntentApplyReport> {
  const blockedResults: IntentApplyResult[] = plan.ops
    .filter((op) => op.status === 'blocked')
    .map((op) => ({
      opId: op.opId, status: 'blocked', reasonCode: op.reasonCode,
      message: op.message, dependencyIds: op.dependencyIds,
    }))
  const ready = plan.ops.filter((op) => op.status === 'ready')
  if (port.getRevision() !== plan.baseRevision) {
    const diagnostics: IntentDiagnostic[] = [{ stage: 'commit', severity: 'error', code: 'STALE_REVISION', message: 'Canvas changed after preview' }]
    return reportFromResults(plan, [
      ...blockedResults,
      ...ready.map((op): IntentApplyResult => ({ opId: op.opId, status: 'blocked', reasonCode: 'STALE_REVISION', message: 'Canvas changed after preview', dependencyIds: op.dependencyIds })),
    ], diagnostics)
  }

  // Expected values are sequential within a plan. When two operations touch
  // the same element, op 2 expects op 1's projected value, not the live base.
  const projected = new Map<string, IntentCanvasElement | null>()
  for (const op of ready) {
    for (const action of op.actions) {
      const current = projected.has(action.elementId)
        ? projected.get(action.elementId) ?? null
        : port.getElement(action.elementId) ?? null
      if (stableValue(current) !== stableValue(action.expected)) {
        const diagnostics: IntentDiagnostic[] = [{ stage: 'commit', severity: 'error', code: 'EXPECTED_VALUE_MISMATCH', message: `Element ${action.elementId} changed after preview`, opId: op.opId }]
        return reportFromResults(plan, [
          ...blockedResults,
          ...ready.map((candidate): IntentApplyResult => ({ opId: candidate.opId, status: 'blocked', reasonCode: 'EXPECTED_VALUE_MISMATCH', message: `Element ${action.elementId} changed after preview`, dependencyIds: candidate.dependencyIds })),
        ], diagnostics)
      }
      projected.set(action.elementId, action.next)
    }
  }

  const actions = ready.flatMap((op) => op.actions)
  const persisted = await port.persist(actions)
  if (!persisted.ok) {
    const diagnostics: IntentDiagnostic[] = [{ stage: 'commit', severity: 'error', code: persisted.code.toUpperCase(), message: persisted.message }]
    return reportFromResults(plan, [
      ...blockedResults,
      ...ready.map((op): IntentApplyResult => ({ opId: op.opId, status: 'failed', reasonCode: persisted.code.toUpperCase(), message: persisted.message, dependencyIds: op.dependencyIds })),
    ], diagnostics)
  }

  try {
    port.apply(actions)
  } catch (error) {
    const compensated = port.compensate ? await port.compensate(actions) : false
    const message = `Host commit failed: ${(error as Error).message}; compensation ${compensated ? 'complete' : 'unavailable'}`
    const diagnostics: IntentDiagnostic[] = [{ stage: 'commit', severity: 'error', code: 'HOST_COMMIT_FAILED', message }]
    return reportFromResults(plan, [
      ...blockedResults,
      ...ready.map((op): IntentApplyResult => ({ opId: op.opId, status: 'failed', reasonCode: 'HOST_COMMIT_FAILED', message, dependencyIds: op.dependencyIds })),
    ], diagnostics)
  }

  return reportFromResults(plan, [
    ...blockedResults,
    ...ready.map((op): IntentApplyResult => ({ opId: op.opId, status: 'applied', dependencyIds: op.dependencyIds })),
  ], [])
}
