import { describe, expect, it, vi } from 'vitest'
import type { IntentIR, IntentSnapshot } from '../intent-ir'
import { decodeIntentJson, validateIntent } from '../intent-validation'
import { compileIntent } from '../intent-compiler'
import { commitIntentPlan, type IntentCommitPort, type IntentPlanAction } from '../apply-plan'

const snapshot: IntentSnapshot = {
  revision: 'fixture-rev-1',
  elements: [
    { id: 'card:one', kind: 'card', x: 0, y: 0, w: 200, h: 120 },
    { id: 'card:two', kind: 'card', x: 320, y: 40, w: 200, h: 120 },
    { id: 'card:three', kind: 'card', x: 20, y: 300, w: 200, h: 120 },
    { id: 'card:four', kind: 'card', x: 340, y: 320, w: 200, h: 120 },
  ],
}

function intent(ops: IntentIR['ops'], mode: IntentIR['mode'] = 'layout'): IntentIR {
  return { kind: 'cys-intent', version: 1, baseRevision: snapshot.revision, mode, ops }
}

describe('Intent IR validation', () => {
  it('rejects trailing prose and unknown fields deterministically', () => {
    const decoded = decodeIntentJson('{"kind":"cys-intent"} trailing')
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.diagnostics[0]?.code).toBe('INVALID_JSON')

    const validated = validateIntent({ ...intent([{ op: 'pin', target: 'card:one' }]), surprise: true })
    expect(validated.ok).toBe(false)
    if (!validated.ok) expect(validated.diagnostics.map((item) => item.code)).toContain('UNKNOWN_FIELD')
  })

  it('rejects duplicate targets and out-of-budget values', () => {
    const result = validateIntent(intent([{ op: 'layout', targets: ['card:one', 'card:one'], mode: 'grid', gap: [3000, 10] }]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(['DUPLICATE_TARGET', 'INVALID_NUMBER']))
  })
})

describe('Intent compiler', () => {
  it('compiles a deterministic immutable grid plan', () => {
    const input = intent([{ op: 'layout', targets: ['card:one', 'card:two', 'card:three', 'card:four'], mode: 'grid', columns: 2, gap: [48, 36], order: 'input' }])
    const first = compileIntent(input, snapshot)
    const second = compileIntent(input, snapshot)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.plan.planHash).toBe(second.plan.planHash)
    expect(first.plan.ops[0]?.actions).toHaveLength(3)
    expect(Object.isFrozen(first.plan)).toBe(true)
    expect(Object.isFrozen(first.plan.ops)).toBe(true)
  })

  it('honors pin constraints across later layout operations', () => {
    const result = compileIntent(intent([
      { op: 'pin', target: 'card:two' },
      { op: 'layout', targets: ['card:one', 'card:two', 'card:three'], mode: 'flow-row', gap: [20, 20] },
    ]), snapshot)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.ops[1]?.actions.some((action) => action.elementId === 'card:two')).toBe(false)
    const movedThree = result.plan.ops[1]?.actions.find((action) => action.elementId === 'card:three')?.next
    const pinnedTwo = snapshot.elements.find((element) => element.id === 'card:two')!
    expect(movedThree && (
      movedThree.x + movedThree.w <= pinnedTwo.x ||
      movedThree.x >= pinnedTwo.x + pinnedTwo.w ||
      movedThree.y + movedThree.h <= pinnedTwo.y ||
      movedThree.y >= pinnedTwo.y + pinnedTwo.h
    )).toBe(true)
  })

  it('blocks geometry operations that introduce overlap after solving', () => {
    const result = compileIntent(intent([
      { op: 'align', targets: ['card:one', 'card:two'], axis: 'left' },
    ]), snapshot)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.ops[0]).toMatchObject({ status: 'blocked', reasonCode: 'OVERLAP', actions: [] })
  })

  it('blocks missing references without inventing placeholder geometry', () => {
    const result = compileIntent(intent([{ op: 'place', target: 'card:missing', relation: 'below', anchor: 'card:one', gap: 48 }]), snapshot)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.ops[0]).toMatchObject({ status: 'blocked', reasonCode: 'MISSING_REFERENCE', actions: [] })
    expect(result.diagnostics[0]?.code).toBe('MISSING_REFERENCE')
  })

  it('rejects stale revisions before solving', () => {
    const result = compileIntent({ ...intent([{ op: 'pin', target: 'card:one' }]), baseRevision: 'fixture-rev-old' }, snapshot)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('STALE_REVISION')
  })

  it('enforces connect policy and tracks created-arrow dependencies', () => {
    const forbidden = compileIntent(intent([{ op: 'connect', from: 'card:one', to: 'card:two', create: true }], 'edit'), snapshot)
    expect(forbidden.ok).toBe(true)
    if (forbidden.ok) expect(forbidden.plan.ops[0]?.reasonCode).toBe('POLICY_VIOLATION')

    const created = compileIntent(intent([
      { op: 'connect', id: 'arrow:one-two', from: 'card:one', to: 'card:two', create: true },
      { op: 'update', target: 'arrow:one-two', patch: { label: 'supports' } },
    ], 'create'), snapshot)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.plan.ops[0]?.actions[0]?.expected).toBeNull()
    expect(created.plan.ops[1]?.dependencyIds).toEqual(['op-001'])
  })

  it('blocks card label edits that cannot be persisted by Intent IR v1', () => {
    const result = compileIntent(intent([
      { op: 'update', target: 'card:one', patch: { label: 'host-only title' } },
    ], 'edit'), snapshot)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.ops[0]).toMatchObject({
      status: 'blocked',
      reasonCode: 'UNSUPPORTED_CARD_LABEL',
      actions: [],
    })
  })
})

describe('Intent plan commit', () => {
  function portFor(planSnapshot = snapshot): IntentCommitPort {
    const elements = new Map(planSnapshot.elements.map((element) => [element.id, structuredClone(element)]))
    return {
      getRevision: () => planSnapshot.revision,
      getElement: (id) => elements.get(id),
      persist: vi.fn(async () => ({ ok: true as const })),
      apply: vi.fn((actions: readonly IntentPlanAction[]) => actions.forEach((action) => elements.set(action.elementId, structuredClone(action.next)))),
    }
  }

  it('commits the exact preview plan and reports real counts', async () => {
    const compiled = compileIntent(intent([{ op: 'update', target: 'card:one', patch: { color: 'red' } }], 'edit'), snapshot)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const port = portFor()
    const report = await commitIntentPlan(compiled.plan, port)
    expect(report).toMatchObject({ totalOps: 1, applied: 1, blocked: 0, failed: 0, cardsUpdated: 1 })
    expect(port.persist).toHaveBeenCalledTimes(1)
    expect(port.apply).toHaveBeenCalledTimes(1)
  })

  it('validates sequential expected values when two ops update one element', async () => {
    const compiled = compileIntent(intent([
      { op: 'update', target: 'card:one', patch: { color: 'red' } },
      { op: 'update', target: 'card:one', patch: { width: 180 } },
    ], 'edit'), snapshot)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const port = portFor()
    const report = await commitIntentPlan(compiled.plan, port)
    expect(report).toMatchObject({ applied: 2, blocked: 0, failed: 0, cardsUpdated: 1 })
    expect(port.persist).toHaveBeenCalledTimes(1)
    expect(port.apply).toHaveBeenCalledTimes(1)
  })

  it('refuses stale or changed expected values before persistence', async () => {
    const compiled = compileIntent(intent([{ op: 'update', target: 'card:one', patch: { color: 'red' } }], 'edit'), snapshot)
    if (!compiled.ok) return
    const stale = portFor({ ...snapshot, revision: 'new-revision' })
    const staleReport = await commitIntentPlan(compiled.plan, stale)
    expect(staleReport.blocked).toBe(1)
    expect(stale.persist).not.toHaveBeenCalled()

    const changedPort = portFor()
    const originalGet = changedPort.getElement
    changedPort.getElement = (id) => id === 'card:one' ? { ...originalGet(id)!, x: 99 } : originalGet(id)
    const changedReport = await commitIntentPlan(compiled.plan, changedPort)
    expect(changedReport.diagnostics[0]?.code).toBe('EXPECTED_VALUE_MISMATCH')
    expect(changedPort.persist).not.toHaveBeenCalled()
  })

  it('does not apply host changes when persistence fails', async () => {
    const compiled = compileIntent(intent([{ op: 'update', target: 'card:one', patch: { color: 'red' } }], 'edit'), snapshot)
    if (!compiled.ok) return
    const port = portFor()
    port.persist = vi.fn(async () => ({ ok: false as const, code: 'quota' as const, message: 'full' }))
    const report = await commitIntentPlan(compiled.plan, port)
    expect(report.failed).toBe(1)
    expect(port.apply).not.toHaveBeenCalled()
  })
})
