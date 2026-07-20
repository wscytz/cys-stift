import { describe, expect, it } from 'vitest'
import { buildProposalReport, proposalReportMarkdown } from '../proposal-report'
import type { ProposalEnvelopeV1, ProposalReviewRecordV1 } from '../proposal-contract'

describe('proposal report', () => {
  it('exports decisions and hashes without source excerpts or provider credentials', () => {
    const envelope: ProposalEnvelopeV1 = { kind: 'cys-proposal-envelope', version: 1, proposalId: 'p', snapshotId: 'ws', canvasId: 'c', baseRevisions: { content: 'c', relations: 'r', geometry: 'g' }, sourceRefs: [{ refId: 'src', sourceKind: 'card', entityId: 'card', field: 'body', sourceRevision: 'rev', selector: { exact: 'private source body', excerptHash: 'excerpt' } }], promptVersion: 'v', schemaVersion: 1, provider: { id: 'openai', model: 'model' }, payloadHash: 'hash', payload: { kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: 'Summary', findings: [], items: [] } }
    const review: ProposalReviewRecordV1 = { proposalId: 'p', decisions: {}, execution: {}, staleCauses: [] }
    const report = buildProposalReport(envelope, review)
    const json = JSON.stringify(report)
    expect(json).not.toContain('private source body')
    expect(json).not.toContain('apiKey')
    expect(json).toContain('excerpt')
    expect(proposalReportMarkdown(report)).toContain('## Source anchors')
  })
})
