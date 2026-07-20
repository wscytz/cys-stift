import { describe, expect, it } from 'vitest'
import { lintWorkingSetGraph } from '../graph-lint'
import { runStructureAudit } from '../run-structure-audit'
import type { WorkingSetBuildResultV1 } from '../working-set-types'

const workingSet: WorkingSetBuildResultV1 = {
  records: [{ ref: { refId: 'src:a', sourceKind: 'card', entityId: 'a', field: 'title', sourceRevision: 'r', selector: { exact: 'A', excerptHash: 'h' } }, text: 'A' }, { ref: { refId: 'src:c', sourceKind: 'card', entityId: 'c', field: 'title', sourceRevision: 'r', selector: { exact: 'C', excerptHash: 'h' } }, text: 'C' }],
  snapshot: {
    kind: 'cys-working-set', version: 1, snapshotId: 'ws', canvasId: 'c', createdAt: '', scope: { kind: 'explicit-cards', rootIds: ['a', 'b', 'c'] },
    revisions: { content: 'content', relations: 'relations', geometry: 'geometry' }, sources: [{ refId: 'src:a', sourceKind: 'card', entityId: 'a', field: 'title', sourceRevision: 'r', selector: { exact: 'A', excerptHash: 'h' } }, { refId: 'src:c', sourceKind: 'card', entityId: 'c', field: 'title', sourceRevision: 'r', selector: { exact: 'C', excerptHash: 'h' } }],
    relations: [{ arrowId: 'ab', from: 'a', to: 'b', refId: 'src:a' }, { arrowId: 'ba', from: 'b', to: 'a', refId: 'src:a' }], relationIssues: [],
    geometry: [{ id: 'a', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }, { id: 'b', kind: 'card', x: 2, y: 0, w: 1, h: 1, rotation: 0 }, { id: 'c', kind: 'card', x: 4, y: 0, w: 1, h: 1, rotation: 0 }],
    manifest: { includedRefIds: ['src:a'], geometryOnlyEntityIds: [], omitted: [], truncated: false, chars: 1, budgetPolicy: '' },
  },
}

describe('graph lint and audit runner', () => {
  it('finds deterministic cycles and orphans before provider output', () => {
    expect(lintWorkingSetGraph(workingSet.snapshot).map((finding) => finding.kind)).toEqual(expect.arrayContaining(['relation-cycle', 'orphan-step']))
  })
  it('does not create a proposal after terminal refusal', async () => {
    const result = await runStructureAudit(workingSet, async () => ({ content: '', finishReason: 'refusal' }))
    expect(result).toMatchObject({ ok: false, failure: 'refusal' })
  })
  it('keeps deterministic findings even when the provider omits them', async () => {
    const result = await runStructureAudit(workingSet, async () => ({
      content: JSON.stringify({
        kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit',
        summary: 'Provider explanation omitted local lint.', findings: [], items: [],
      }),
    }))
    expect(result).toMatchObject({ ok: true, lintCount: 2 })
    if (result.ok) expect(result.payload.findings.map((finding) => finding.kind)).toEqual(expect.arrayContaining(['relation-cycle', 'orphan-step']))
  })
  it('reports dangling and invariant relation issues as diagnose-only findings', () => {
    const snapshot = {
      ...workingSet.snapshot,
      relationIssues: [
        { arrowId: 'broken', kind: 'missing-endpoint' as const, from: 'a', to: 'ghost', refId: 'src:a' },
        { arrowId: 'self', kind: 'self-loop' as const, from: 'a', to: 'a', refId: 'src:a' },
      ],
    }
    expect(lintWorkingSetGraph(snapshot).map((finding) => finding.kind)).toEqual(expect.arrayContaining(['dangling-relation', 'relation-invariant']))
  })
})
