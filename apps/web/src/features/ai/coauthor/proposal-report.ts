import type { CommitReceiptV1 } from '@/lib/proposal-transaction-journal'
import type { ProposalEnvelopeV1, ProposalReviewRecordV1 } from './proposal-contract'

export interface ProposalReportV1 {
  kind: 'cys-proposal-report'
  version: 1
  proposal: Omit<ProposalEnvelopeV1, 'sourceRefs'> & { sourceRefs: Array<{ refId: string; sourceKind: string; entityId: string; field: string; sourceRevision: string; excerptHash: string }> }
  review: ProposalReviewRecordV1
  receipt?: CommitReceiptV1
}

export function buildProposalReport(envelope: ProposalEnvelopeV1, review: ProposalReviewRecordV1, receipt?: CommitReceiptV1): ProposalReportV1 {
  return {
    kind: 'cys-proposal-report', version: 1,
    proposal: {
      ...envelope,
      sourceRefs: envelope.sourceRefs.map((ref) => ({ refId: ref.refId, sourceKind: ref.sourceKind, entityId: ref.entityId, field: ref.field, sourceRevision: ref.sourceRevision, excerptHash: ref.selector.excerptHash })),
    },
    review: structuredClone(review),
    ...(receipt ? { receipt: structuredClone(receipt) } : {}),
  }
}

export function proposalReportMarkdown(report: ProposalReportV1): string {
  const lines = [`# Proposal ${report.proposal.proposalId}`, '', report.proposal.payload.summary, '', '## Decisions', '']
  for (const item of report.proposal.payload.items) lines.push(`- ${item.itemId}: ${report.review.decisions[item.itemId] ?? 'pending'} (${item.lane})`)
  if (report.receipt) {
    lines.push('', '## Commit receipt', '', `- Plan: ${report.receipt.planId}`, `- Hash: ${report.receipt.planHash}`, `- Changed cards: ${report.receipt.changedCardIds.join(', ') || 'none'}`, `- Changed canvas objects: ${report.receipt.changedElementIds.join(', ') || 'none'}`, '', '### Item report', '')
    for (const item of report.receipt.itemReports) lines.push(`- ${item.itemId}: cards [${item.changedCardIds.join(', ')}], canvas [${item.changedElementIds.join(', ')}]`)
  }
  lines.push('', '## Source anchors', '')
  for (const ref of report.proposal.sourceRefs) lines.push(`- ${ref.refId}: ${ref.sourceKind}/${ref.entityId}/${ref.field} (${ref.excerptHash})`)
  return `${lines.join('\n')}\n`
}
