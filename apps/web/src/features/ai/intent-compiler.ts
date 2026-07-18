import type {
  IntentDiagnostic,
  IntentIR,
  IntentMode,
  IntentOp,
  IntentSnapshot,
} from './intent-ir'
import { validateIntent } from './intent-validation'
import { indexIntentSnapshot, missingReferences } from './intent-resolver'
import { solveIntentOp } from './intent-solver'
import {
  deepFreeze,
  hashIntentPlan,
  type IntentApplyPlan,
  type IntentPlanAction,
  type IntentPlanOp,
} from './apply-plan'

export type IntentCompileResult =
  | { ok: true; plan: IntentApplyPlan; diagnostics: IntentDiagnostic[] }
  | { ok: false; diagnostics: IntentDiagnostic[] }

function allowed(mode: IntentMode, op: IntentOp): boolean {
  if (mode === 'create') return true
  if (mode === 'layout') return ['layout', 'place', 'align', 'distribute', 'pin'].includes(op.op)
  if (op.op === 'connect') return op.create === false
  return true
}

function changedActions(
  before: ReadonlyMap<string, import('./intent-ir').IntentCanvasElement>,
  after: ReadonlyMap<string, import('./intent-ir').IntentCanvasElement>,
  ids: readonly string[],
): IntentPlanAction[] {
  return ids.map((id) => ({
    kind: 'upsert', elementId: id,
    expected: before.get(id) ? structuredClone(before.get(id)!) : null,
    next: structuredClone(after.get(id)!),
  }))
}

export function compileIntent(input: IntentIR | unknown, snapshot: IntentSnapshot): IntentCompileResult {
  const validated = validateIntent(input)
  if (!validated.ok) return validated
  const intent = validated.value
  if (intent.baseRevision !== snapshot.revision) {
    return { ok: false, diagnostics: [{ stage: 'resolve', severity: 'error', code: 'STALE_REVISION', message: `Intent revision ${intent.baseRevision} does not match canvas revision ${snapshot.revision}` }] }
  }
  const indexed = indexIntentSnapshot(snapshot)
  if (indexed.diagnostics.some((item) => item.severity === 'error')) return { ok: false, diagnostics: indexed.diagnostics }

  let working = indexed.elements
  const pinned = new Set<string>()
  const createdBy = new Map<string, string>()
  const diagnostics: IntentDiagnostic[] = []
  const ops: IntentPlanOp[] = []

  intent.ops.forEach((op, index) => {
    const opId = `op-${String(index + 1).padStart(3, '0')}`
    const dependencyIds = [...new Set(
      missingReferences(op, indexed.elements)
        .map((id) => createdBy.get(id))
        .filter((id): id is string => !!id),
    )].sort()
    if (!allowed(intent.mode, op)) {
      const message = `${op.op} is not allowed in ${intent.mode} mode`
      diagnostics.push({ stage: 'validate', severity: 'error', code: 'POLICY_VIOLATION', message, opId })
      ops.push({ opId, intent: structuredClone(op), status: 'blocked', reasonCode: 'POLICY_VIOLATION', message, dependencyIds, actions: [] })
      return
    }

    const missing = missingReferences(op, working)
    if (missing.length > 0) {
      const message = `Missing references: ${missing.join(', ')}`
      diagnostics.push({ stage: 'resolve', severity: 'error', code: 'MISSING_REFERENCE', message, opId })
      ops.push({ opId, intent: structuredClone(op), status: 'blocked', reasonCode: 'MISSING_REFERENCE', message, dependencyIds, actions: [] })
      return
    }

    if (op.op === 'pin') {
      pinned.add(op.target)
      ops.push({ opId, intent: structuredClone(op), status: 'ready', dependencyIds, actions: [] })
      return
    }

    const solved = solveIntentOp(op, working, pinned)
    if (solved.diagnostics.some((item) => item.severity === 'error')) {
      diagnostics.push(...solved.diagnostics.map((item) => ({ ...item, opId })))
      ops.push({ opId, intent: structuredClone(op), status: 'blocked', reasonCode: solved.diagnostics[0]?.code ?? 'SOLVE_FAILED', message: solved.diagnostics[0]?.message, dependencyIds, actions: [] })
      return
    }
    const actions = changedActions(working, solved.elements, solved.changedIds)
    working = solved.elements
    for (const action of actions) {
      if (action.expected === null) createdBy.set(action.elementId, opId)
    }
    ops.push({ opId, intent: structuredClone(op), status: 'ready', dependencyIds, actions })
  })

  const content = { version: 1 as const, baseRevision: intent.baseRevision, ops }
  const planHash = hashIntentPlan(content)
  const plan: IntentApplyPlan = {
    version: 1,
    planId: `intent-plan-${planHash}`,
    baseRevision: intent.baseRevision,
    planHash,
    ops,
  }
  return { ok: true, plan: deepFreeze(plan) as IntentApplyPlan, diagnostics }
}
