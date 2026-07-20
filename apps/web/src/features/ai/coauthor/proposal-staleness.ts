import type { CanvasHost } from '@cys-stift/canvas-engine'
import type { CardService } from '@cys-stift/domain'
import type { ProposalEnvelopeV1, ProposalReviewRecordV1 } from './proposal-contract'
import { sourceRevisionFor } from './source-ref'

export interface ProposalStalenessResult {
  staleItemIds: string[]
  causes: Array<{ refId: string; code: 'SOURCE_CHANGED' | 'SOURCE_MISSING' }>
}

/** Revalidates evidence anchors without rebuilding or retransmitting a working
 * set. Text changes invalidate Logic/Idea evidence; pure Layout remains valid
 * unless its referenced canvas entity disappeared. */
export async function detectProposalStaleness(
  envelope: ProposalEnvelopeV1,
  review: ProposalReviewRecordV1,
  host: CanvasHost,
  service: CardService,
): Promise<ProposalStalenessResult> {
  const stale = new Map<string, 'SOURCE_CHANGED' | 'SOURCE_MISSING'>()
  for (const ref of envelope.sourceRefs) {
    let text: string | null = null
    if (ref.sourceKind === 'card') {
      const card = service.get(ref.entityId as never)
      if (card && !card.deletedAt && (ref.field === 'title' || ref.field === 'body')) text = card[ref.field]
    } else if (ref.sourceKind === 'canvas-element') {
      const element = host.getElement(ref.entityId)
      if (element) text = ref.field === 'relation' || ref.field === 'text' ? (element.text ?? '') : ''
    } else text = ref.selector.exact
    if (text === null) stale.set(ref.refId, 'SOURCE_MISSING')
    else if (await sourceRevisionFor(ref.sourceKind, ref.entityId, ref.field, text) !== ref.sourceRevision) stale.set(ref.refId, 'SOURCE_CHANGED')
  }
  const staleItemIds = envelope.payload.items.filter((item) => {
    if (review.decisions[item.itemId] !== 'accepted') return false
    return item.evidence.some((edge) => {
      const code = stale.get(edge.refId)
      return !!code && (item.lane !== 'layout' || code === 'SOURCE_MISSING')
    })
  }).map((item) => item.itemId)
  return { staleItemIds, causes: [...stale].map(([refId, code]) => ({ refId, code })) }
}
