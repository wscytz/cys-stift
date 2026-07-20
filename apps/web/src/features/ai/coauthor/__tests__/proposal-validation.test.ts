import { describe, expect, it } from 'vitest'
import { validateProposalPayload } from '../proposal-validation'

const context = { sourceRefIds: new Set(['src:a']), elementIds: new Set(['a', 'b']), arrowIds: new Set(['edge']), baseRevision: 'r1' }
const valid: any = {
  kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: 'Review', findings: [{
    findingId: 'finding', kind: 'orphan-step', title: 'Orphan', explanation: 'No edge', evidence: [{ refId: 'src:a', role: 'supports' }], uncertainty: 'medium', proposalItemIds: ['add'],
  }], items: [{
    itemId: 'add', lane: 'semantic', findingId: 'finding', evidence: [{ refId: 'src:a', role: 'targets' }], dependsOn: [], conflictsWith: [], reason: 'Connect it',
    action: { type: 'relation.add', from: 'a', to: 'b', relation: 'blocks' },
  }],
}

describe('validateProposalPayload', () => {
  it('accepts a bounded semantic proposal', () => {
    expect(validateProposalPayload(valid, context).ok).toBe(true)
  })

  it('rejects forged system fields and unknown sources', () => {
    const forged = structuredClone(valid) as Record<string, unknown>
    forged.canvasId = 'forged'
    const unknownSource = structuredClone(valid)
    const firstItem = unknownSource.items[0]
    if (!firstItem || !firstItem.evidence[0]) throw new Error('fixture item missing')
    firstItem.evidence[0].refId = 'src:forged'
    expect(validateProposalPayload(forged, context).ok).toBe(false)
    const result = validateProposalPayload(unknownSource, context)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'UNKNOWN_SOURCE_REF')).toBe(true)
  })

  it('rejects dependency cycles and asymmetric conflicts', () => {
    const invalid = structuredClone(valid)
    invalid.items.push({ ...invalid.items[0], itemId: 'other', dependsOn: ['add'], conflictsWith: [] })
    const firstItem = invalid.items[0]
    if (!firstItem) throw new Error('fixture item missing')
    firstItem.dependsOn = ['other']
    firstItem.conflictsWith = ['other']
    const result = validateProposalPayload(invalid, context)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(['DEPENDENCY_CYCLE', 'ASYMMETRIC_CONFLICT']))
  })

  it('rejects payloads that exceed the declared nesting cap', () => {
    const deep = structuredClone(valid)
    let value: any = deep.items[0]
    for (let index = 0; index < 20; index++) { value.extra = {}; value = value.extra }
    const result = validateProposalPayload(deep, context)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'PAYLOAD_TOO_DEEP')).toBe(true)
  })

  it('rejects non-layout authority and mutation ops in the Layout lane', () => {
    const invalid = structuredClone(valid)
    invalid.items = [{
      itemId: 'layout', lane: 'layout', evidence: [{ refId: 'src:a', role: 'targets' }], dependsOn: [], conflictsWith: [], reason: 'mutate',
      intent: { mode: 'create', ops: [{ op: 'connect', from: 'a', to: 'b', create: true }] },
    }]
    invalid.findings = []
    const result = validateProposalPayload(invalid, context)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(['INVALID_LAYOUT_MODE', 'INVALID_LAYOUT_OP']))
  })
})
