import type { IntentSnapshot } from './intent-ir'
import { decodeIntentJson } from './intent-validation'
import { compileIntent } from './intent-compiler'

export interface IntentBenchmarkOracle {
  compileOk: boolean
  readyOps?: number
  blockedOps?: number
  diagnosticCodes?: string[]
  changedIds?: string[]
}

export interface IntentBenchmarkCase {
  id: string
  schemaVersion: 1
  split: 'seed' | 'held-out'
  snapshot: IntentSnapshot
  oracle: IntentBenchmarkOracle
}

export interface IntentBenchmarkObservation {
  caseId: string
  model: string
  condition: string
  sample: number
  output: string
  error?: string
}

export interface IntentBenchmarkScore {
  caseId: string
  formatValid: boolean
  compileOk: boolean
  oracleMatch: boolean
  endToEnd: boolean
  diagnosticCodes: string[]
  planHash?: string
}

function equalSet(actual: readonly string[], expected: readonly string[]): boolean {
  return [...new Set(actual)].sort().join('\0') === [...new Set(expected)].sort().join('\0')
}

/** Exact deterministic evaluator: no provider calls and no LLM judge. */
export function evaluateIntentObservation(
  testCase: IntentBenchmarkCase,
  observation: IntentBenchmarkObservation,
): IntentBenchmarkScore {
  const decoded = decodeIntentJson(observation.output)
  if (!decoded.ok) {
    const diagnosticCodes = decoded.diagnostics.map((item) => item.code)
    const oracleMatch = testCase.oracle.compileOk === false && equalSet(diagnosticCodes, testCase.oracle.diagnosticCodes ?? [])
    return { caseId: testCase.id, formatValid: false, compileOk: false, oracleMatch, endToEnd: oracleMatch && !observation.error, diagnosticCodes }
  }
  const compiled = compileIntent(decoded.value, testCase.snapshot)
  const diagnostics = compiled.diagnostics.map((item) => item.code)
  const readyOps = compiled.ok ? compiled.plan.ops.filter((op) => op.status === 'ready').length : 0
  const blockedOps = compiled.ok ? compiled.plan.ops.filter((op) => op.status === 'blocked').length : 0
  const changedIds = compiled.ok ? compiled.plan.ops.flatMap((op) => op.actions.map((action) => action.elementId)) : []
  const oracleMatch =
    compiled.ok === testCase.oracle.compileOk &&
    (testCase.oracle.readyOps === undefined || readyOps === testCase.oracle.readyOps) &&
    (testCase.oracle.blockedOps === undefined || blockedOps === testCase.oracle.blockedOps) &&
    (testCase.oracle.diagnosticCodes === undefined || equalSet(diagnostics, testCase.oracle.diagnosticCodes)) &&
    (testCase.oracle.changedIds === undefined || equalSet(changedIds, testCase.oracle.changedIds))
  return {
    caseId: testCase.id,
    formatValid: true,
    compileOk: compiled.ok,
    oracleMatch,
    endToEnd: oracleMatch && !observation.error,
    diagnosticCodes: diagnostics,
    ...(compiled.ok ? { planHash: compiled.plan.planHash } : {}),
  }
}
