import type { CanvasElement } from '@cys-stift/canvas-engine'
import type { Card } from '@cys-stift/domain'

export type ProposalJournalState = 'PREPARED' | 'COMMITTED' | 'UNDO_PREPARED' | 'UNDONE'
export interface ProposalTransactionJournalV1 {
  v: 1
  journalId: string
  proposalId: string
  planId: string
  planHash: string
  canvasId: string
  itemIds: string[]
  itemReports: Array<{ itemId: string; changedCardIds: string[]; changedElementIds: string[] }>
  state: ProposalJournalState
  before: { cards: Card[]; elements: CanvasElement[]; digest: string }
  after: { cards: Card[]; elements: CanvasElement[]; digest: string }
  createdAt: number
}

export interface CommitReceiptV1 {
  v: 1
  receiptId: string
  journalId: string
  proposalId: string
  planId: string
  planHash: string
  canvasId: string
  itemIds: string[]
  changedCardIds: string[]
  changedElementIds: string[]
  itemReports: Array<{ itemId: string; changedCardIds: string[]; changedElementIds: string[] }>
  committedAt: number
  undoneAt?: number
}

const PREFIX = 'cys-stift.proposal-journal.'
const RECEIPT_PREFIX = 'cys-stift.proposal-receipt.'
function key(id: string): string { return `${PREFIX}${id}.v1` }

function reviveCard(card: Card): Card {
  return {
    ...card,
    capturedAt: new Date(card.capturedAt), createdAt: new Date(card.createdAt), updatedAt: new Date(card.updatedAt),
    ...(card.deletedAt ? { deletedAt: new Date(card.deletedAt) } : {}),
    links: (card.links ?? []).map((link) => ({ ...link, fetchedAt: new Date(link.fetchedAt) })),
  }
}

/** Journal persistence deliberately has no silent fallback result. A failed
 * PREPARED write means callers must not start any card/freeform mutation. */
export const proposalTransactionJournal = {
  list(): ProposalTransactionJournalV1[] {
    if (typeof window === 'undefined') return []
    const result: ProposalTransactionJournalV1[] = []
    for (let index = 0; index < window.localStorage.length; index++) {
      const candidate = window.localStorage.key(index)
      if (!candidate?.startsWith(PREFIX) || !candidate.endsWith('.v1')) continue
      const id = candidate.slice(PREFIX.length, -3)
      const journal = this.load(id)
      if (journal) result.push(journal)
    }
    return result.sort((left, right) => left.createdAt - right.createdAt)
  },
  load(id: string): ProposalTransactionJournalV1 | null {
    try {
      const value = JSON.parse(window.localStorage.getItem(key(id)) ?? '') as ProposalTransactionJournalV1
      if (value.v !== 1 || typeof value.canvasId !== 'string' || !Array.isArray(value.itemIds) || !['PREPARED', 'COMMITTED', 'UNDO_PREPARED', 'UNDONE'].includes(value.state)) return null
      if (!Array.isArray(value.itemReports)) value.itemReports = value.itemIds.map((itemId) => ({ itemId, changedCardIds: [], changedElementIds: [] }))
      value.before.cards = value.before.cards.map(reviveCard)
      value.after.cards = value.after.cards.map(reviveCard)
      return value
    } catch { return null }
  },
  write(journal: ProposalTransactionJournalV1): boolean {
    try { window.localStorage.setItem(key(journal.journalId), JSON.stringify(journal)); return true } catch { return false }
  },
  markCommitted(id: string): ProposalTransactionJournalV1 | null {
    const journal = this.load(id); if (!journal) return null
    const committed = { ...journal, state: 'COMMITTED' as const }
    return this.write(committed) ? committed : null
  },
  markUndoPrepared(id: string): ProposalTransactionJournalV1 | null {
    const journal = this.load(id); if (!journal || journal.state !== 'COMMITTED') return null
    const prepared = { ...journal, state: 'UNDO_PREPARED' as const }
    return this.write(prepared) ? prepared : null
  },
  markUndone(id: string): ProposalTransactionJournalV1 | null {
    const journal = this.load(id); if (!journal || journal.state !== 'UNDO_PREPARED') return null
    const undone = { ...journal, state: 'UNDONE' as const }
    return this.write(undone) ? undone : null
  },
  remove(id: string): boolean { try { window.localStorage.removeItem(key(id)); return true } catch { return false } },
}

function receiptKey(id: string): string { return `${RECEIPT_PREFIX}${id}.v1` }

export const proposalReceiptStore = {
  list(): CommitReceiptV1[] {
    if (typeof window === 'undefined') return []
    const result: CommitReceiptV1[] = []
    for (let index = 0; index < window.localStorage.length; index++) {
      const candidate = window.localStorage.key(index)
      if (!candidate?.startsWith(RECEIPT_PREFIX) || !candidate.endsWith('.v1')) continue
      const id = candidate.slice(RECEIPT_PREFIX.length, -3)
      const receipt = this.load(id)
      if (receipt) result.push(receipt)
    }
    return result.sort((left, right) => right.committedAt - left.committedAt)
  },
  load(id: string): CommitReceiptV1 | null {
    try {
      const value = JSON.parse(window.localStorage.getItem(receiptKey(id)) ?? '') as CommitReceiptV1
      if (value.v !== 1 || typeof value.planHash !== 'string' || !Array.isArray(value.itemIds)) return null
      if (!Array.isArray(value.itemReports)) value.itemReports = value.itemIds.map((itemId) => ({ itemId, changedCardIds: [], changedElementIds: [] }))
      return value
    } catch { return null }
  },
  write(receipt: CommitReceiptV1): boolean {
    try { window.localStorage.setItem(receiptKey(receipt.receiptId), JSON.stringify(receipt)); return true } catch { return false }
  },
  markUndone(id: string, at = Date.now()): CommitReceiptV1 | null {
    const receipt = this.load(id)
    if (!receipt || receipt.undoneAt) return null
    const next = { ...receipt, undoneAt: at }
    return this.write(next) ? next : null
  },
}
