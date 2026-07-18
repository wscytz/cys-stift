import { describe, expect, it } from 'vitest'
import type { IntentBenchmarkCase } from '../intent-benchmark'
import { evaluateIntentObservation } from '../intent-benchmark'

const testCase: IntentBenchmarkCase = {
  id: 'grid-2x2', schemaVersion: 1, split: 'seed',
  snapshot: {
    revision: 'rev-1',
    elements: [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 80 },
      { id: 'b', kind: 'card', x: 220, y: 20, w: 100, h: 80 },
      { id: 'c', kind: 'card', x: 10, y: 220, w: 100, h: 80 },
      { id: 'd', kind: 'card', x: 230, y: 230, w: 100, h: 80 },
    ],
  },
  oracle: { compileOk: true, readyOps: 1, blockedOps: 0, changedIds: ['b', 'c', 'd'] },
}

describe('intent benchmark evaluator', () => {
  it('scores identical outputs deterministically', () => {
    const output = JSON.stringify({ kind: 'cys-intent', version: 1, baseRevision: 'rev-1', mode: 'layout', ops: [{ op: 'layout', targets: ['a', 'b', 'c', 'd'], mode: 'grid', columns: 2, gap: [40, 40] }] })
    const observation = { caseId: testCase.id, model: 'provider/model-version', condition: 'schema-v1', sample: 0, output }
    const first = evaluateIntentObservation(testCase, observation)
    const second = evaluateIntentObservation(testCase, observation)
    expect(first).toEqual(second)
    expect(first.endToEnd).toBe(true)
  })

  it('does not treat fenced or prose-wrapped output as valid JSON', () => {
    const score = evaluateIntentObservation(testCase, { caseId: testCase.id, model: 'm', condition: 'c', sample: 0, output: '```json\n{}\n```' })
    expect(score.formatValid).toBe(false)
    expect(score.endToEnd).toBe(false)
  })
})
