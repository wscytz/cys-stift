import { describe, expect, it } from 'vitest'
import { createProposalEnvelope } from '../structure-audit-workflow'
import type { ProposalPayloadV1 } from '../proposal-contract'
import type { WorkingSetBuildResultV1 } from '../working-set-types'

describe('structure audit envelope persistence boundary', () => {
  it('keeps source identity and hashes without persisting source text', async () => {
    const source = {
      refId: 'src:private', sourceKind: 'card' as const, entityId: 'card:1', field: 'body' as const,
      sourceRevision: 'revision', selector: { path: '/body', exact: 'private source body', prefix: 'private', suffix: 'body', start: 0, end: 19, excerptHash: 'excerpt-hash' },
    }
    const workingSet: WorkingSetBuildResultV1 = {
      records: [{ ref: source, text: 'private source body' }],
      snapshot: {
        kind: 'cys-working-set', version: 1, snapshotId: 'ws', canvasId: 'canvas', createdAt: '',
        scope: { kind: 'explicit-cards', rootIds: ['card:1'] }, revisions: { content: 'c', relations: 'r', geometry: 'g' },
        sources: [source], relations: [], relationIssues: [], geometry: [],
        manifest: { includedRefIds: ['src:private'], geometryOnlyEntityIds: [], omitted: [], truncated: false, chars: 19, budgetPolicy: 'test' },
      },
    }
    const payload: ProposalPayloadV1 = { kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [], items: [] }
    const envelope = await createProposalEnvelope(workingSet, payload, { provider: 'ollama', model: 'local', baseUrl: '', apiKey: '', enabled: true }, { ok: true, payload, lintCount: 0, attempts: 1, promptVersion: 'test' })
    expect(envelope.sourceRefs[0]).toMatchObject({ refId: 'src:private', sourceRevision: 'revision', selector: { exact: '', excerptHash: 'excerpt-hash', start: 0, end: 19 } })
    expect(JSON.stringify(envelope)).not.toContain('private source body')
    expect(JSON.stringify(envelope)).not.toContain('"prefix"')
    expect(JSON.stringify(envelope)).not.toContain('"suffix"')
  })
})
