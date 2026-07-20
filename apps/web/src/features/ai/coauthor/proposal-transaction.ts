import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import type { Card, CardBatchChange, CardId, CardService, CanvasId } from '@cys-stift/domain'
import { canvasFreeformStore } from '@/lib/canvas-freeform-store'
import {
  proposalReceiptStore,
  proposalTransactionJournal,
  type CommitReceiptV1,
  type ProposalTransactionJournalV1,
} from '@/lib/proposal-transaction-journal'
import { canonicalJson, sha256Hex } from './working-set-revision'

export type ElementBatchChange = {
  itemId: string
  id: string
  expected: CanvasElement | null
  next: CanvasElement | null
}

export type ProposalCardBatchChange = CardBatchChange & { itemId: string }

export interface ProposalCommitPlanV1 {
  v: 1
  planId: string
  planHash: string
  proposalId: string
  canvasId: string
  itemIds: string[]
  cardChanges: ProposalCardBatchChange[]
  elementChanges: ElementBatchChange[]
}

export function proposalPlanChangedIds(plan: ProposalCommitPlanV1): string[] {
  return [...new Set([...plan.cardChanges.map((change) => String(change.id)), ...plan.elementChanges.map((change) => change.id)])].sort()
}

export type ProposalCommitResult =
  | { ok: true; committed: true; receipt: CommitReceiptV1; undo: () => Promise<ProposalUndoResult> }
  | { ok: false; committed: boolean; code: string; itemIds?: string[]; recoveryRequired?: boolean }

export type ProposalUndoResult = { ok: true; recoveryRequired?: boolean } | { ok: false; code: 'ALREADY_UNDONE' | 'UNDO_CONFLICT' | 'UNDO_PERSIST_FAILED'; recoveryRequired?: boolean }

type FreeformStore = Pick<typeof canvasFreeformStore, 'load' | 'save'>
type JournalStore = Pick<typeof proposalTransactionJournal, 'write' | 'markCommitted' | 'remove'> & Partial<Pick<typeof proposalTransactionJournal, 'markUndoPrepared' | 'markUndone'>>
type ReceiptStore = Pick<typeof proposalReceiptStore, 'write' | 'markUndone'>

export interface ProposalTransactionDependencies {
  service: CardService
  host: CanvasHost
  freeformStore?: FreeformStore
  journalStore?: JournalStore
  receiptStore?: ReceiptStore
  now?: () => number
}

export interface ProposalRecoveryDependencies {
  service: CardService
  host: CanvasHost
  canvasId?: string
  freeformStore?: FreeformStore
  journalStore?: Pick<typeof proposalTransactionJournal, 'list' | 'markCommitted' | 'remove'> & Partial<Pick<typeof proposalTransactionJournal, 'markUndoPrepared' | 'markUndone'>>
  receiptStore?: Pick<typeof proposalReceiptStore, 'load' | 'write'> & Partial<Pick<typeof proposalReceiptStore, 'markUndone'>>
  now?: () => number
}

export interface ProposalRecoveryReport {
  recovered: string[]
  completed: string[]
  cleared: string[]
  required: string[]
}

export interface PersistedUndoDependencies {
  service: CardService
  host: CanvasHost
  freeformStore?: FreeformStore
  journalStore?: Pick<typeof proposalTransactionJournal, 'load' | 'markUndoPrepared' | 'markCommitted' | 'markUndone' | 'remove'>
  receiptStore?: Pick<typeof proposalReceiptStore, 'load' | 'markUndone'>
  now?: () => number
}

function same(a: unknown, b: unknown): boolean { return canonicalJson(a) === canonicalJson(b) }
function cloneElement(value: CanvasElement): CanvasElement {
  return { ...value, ...(value.meta ? { meta: structuredClone(value.meta) } : {}) }
}
function cloneCard(value: Card): Card { return structuredClone(value) }
function applyElementChanges(elements: CanvasElement[], changes: ElementBatchChange[]): CanvasElement[] {
  const byId = new Map(elements.map((element) => [element.id, cloneElement(element)]))
  for (const change of changes) change.next ? byId.set(change.id, cloneElement(change.next)) : byId.delete(change.id)
  return [...byId.values()]
}
function syncHost(host: CanvasHost, changes: ElementBatchChange[], direction: 'next' | 'expected'): void {
  host.applyWithoutEcho(() => host.batch(() => {
    for (const change of changes) {
      const value = direction === 'next' ? change.next : change.expected
      if (value) host.upsert(cloneElement(value))
      else host.remove(change.id)
    }
  }))
}
function inverseCards(changes: CardBatchChange[]): CardBatchChange[] {
  return changes.map((change) => ({ id: change.id, expected: change.next ? cloneCard(change.next) : null, next: change.expected ? cloneCard(change.expected) : null }))
}

function cardsMatch(service: CardService, changes: CardBatchChange[], direction: 'expected' | 'next'): boolean {
  return changes.every((change) => same(service.get(change.id), direction === 'expected' ? change.expected : change.next))
}

async function freeformMatches(store: FreeformStore, canvasId: string, elements: CanvasElement[]): Promise<boolean> {
  const current = (await store.load(canvasId as CanvasId))?.elements ?? []
  return same(current, elements)
}

function hostMatches(host: CanvasHost, changes: ElementBatchChange[], direction: 'expected' | 'next'): boolean {
  return changes.every((change) => same(host.getElement(change.id) ?? null, direction === 'expected' ? change.expected : change.next))
}

interface UndoExecutionDependencies {
  service: CardService
  host: CanvasHost
  freeformStore: FreeformStore
  journalStore: Pick<typeof proposalTransactionJournal, 'markUndoPrepared' | 'markCommitted' | 'markUndone' | 'remove'>
  receiptStore: Pick<typeof proposalReceiptStore, 'markUndone'>
  now: () => number
}

function journalCardChanges(journal: ProposalTransactionJournalV1, target: 'before' | 'after'): CardBatchChange[] {
  const source = target === 'before' ? journal.before.cards : journal.after.cards
  const byId = new Map(source.map((card) => [String(card.id), card]))
  const ids = new Set([...journal.before.cards, ...journal.after.cards].map((card) => String(card.id)))
  const expected = target === 'before' ? journal.after.cards : journal.before.cards
  const expectedById = new Map(expected.map((card) => [String(card.id), card]))
  return [...ids].map((id) => ({
    id: id as CardId,
    expected: expectedById.get(id) ? cloneCard(expectedById.get(id)!) : null,
    next: byId.get(id) ? cloneCard(byId.get(id)!) : null,
  }))
}

async function executeUndo(journal: ProposalTransactionJournalV1, receiptId: string, dependencies: UndoExecutionDependencies): Promise<ProposalUndoResult> {
  const { service, host, freeformStore, journalStore, receiptStore, now } = dependencies
  if (journal.state !== 'COMMITTED') return { ok: false, code: journal.state === 'UNDONE' ? 'ALREADY_UNDONE' : 'UNDO_PERSIST_FAILED', recoveryRequired: journal.state !== 'UNDONE' }
  const touchedIds = [...new Set([...journal.before.cards, ...journal.after.cards].map((card) => card.id))]
  const currentCards = touchedIds.flatMap((id) => { const card = service.get(id); return card ? [card] : [] })
  const currentElements = (await freeformStore.load(journal.canvasId as CanvasId))?.elements ?? []
  const currentDigest = await sha256Hex(canonicalJson({ cards: currentCards, elements: currentElements }))
  if (currentDigest !== journal.after.digest) return { ok: false, code: 'UNDO_CONFLICT' }
  const currentHostElements = host.getElements().filter((element) => element.kind !== 'card')
  if (!same(currentHostElements, journal.after.elements)) return { ok: false, code: 'UNDO_CONFLICT' }
  if (!journalStore.markUndoPrepared(journal.journalId)) return { ok: false, code: 'UNDO_PERSIST_FAILED' }

  const toBefore = journalCardChanges(journal, 'before')
  const toAfter = journalCardChanges(journal, 'after')
  const restoreAfter = async (): Promise<boolean> => {
    const cardsOk = toAfter.length === 0 || cardsMatch(service, toAfter, 'next') || service.applyBatch(toAfter)
    const freeformOk = await freeformStore.save(journal.canvasId as CanvasId, journal.after.elements)
    let hostOk = true
    try { replaceHostFreeform(host, journal.after.elements) } catch { hostOk = false }
    const verified = cardsOk && cardsMatch(service, toAfter, 'next') && freeformOk && await freeformMatches(freeformStore, journal.canvasId, journal.after.elements) && hostOk
    if (!verified) return false
    return !!journalStore.markCommitted(journal.journalId)
  }

  if (toBefore.length && !service.applyBatch(toBefore)) {
    const restored = await restoreAfter()
    return { ok: false, code: 'UNDO_PERSIST_FAILED', ...(restored ? {} : { recoveryRequired: true }) }
  }
  if (!await freeformStore.save(journal.canvasId as CanvasId, journal.before.elements)) {
    const restored = await restoreAfter()
    return { ok: false, code: 'UNDO_PERSIST_FAILED', ...(restored ? {} : { recoveryRequired: true }) }
  }
  try { replaceHostFreeform(host, journal.before.elements) } catch {
    const restored = await restoreAfter()
    return { ok: false, code: 'UNDO_PERSIST_FAILED', ...(restored ? {} : { recoveryRequired: true }) }
  }

  if (!receiptStore.markUndone(receiptId, now())) {
    const restored = await restoreAfter()
    return { ok: false, code: 'UNDO_PERSIST_FAILED', ...(restored ? {} : { recoveryRequired: true }) }
  }
  if (!journalStore.markUndone(journal.journalId)) {
    return { ok: true, recoveryRequired: true }
  }
  return journalStore.remove(journal.journalId) ? { ok: true } : { ok: true, recoveryRequired: true }
}

function replaceHostFreeform(host: CanvasHost, elements: CanvasElement[]): void {
  host.applyWithoutEcho(() => host.batch(() => {
    for (const element of host.getElements()) if (element.kind !== 'card') host.remove(element.id)
    for (const element of elements) host.upsert(cloneElement(element))
  }))
}

function receiptFromJournal(journal: ProposalTransactionJournalV1, now: number): CommitReceiptV1 {
  const beforeCards = new Set(journal.before.cards.map((card) => String(card.id)))
  const afterCards = new Set(journal.after.cards.map((card) => String(card.id)))
  const beforeElements = new Set(journal.before.elements.map((element) => element.id))
  const afterElements = new Set(journal.after.elements.map((element) => element.id))
  return {
    v: 1, receiptId: `receipt:${journal.planHash}`, journalId: journal.journalId, proposalId: journal.proposalId,
    planId: journal.planId, planHash: journal.planHash, canvasId: journal.canvasId, itemIds: [...journal.itemIds],
    changedCardIds: [...new Set([...beforeCards, ...afterCards])],
    changedElementIds: [...new Set([...beforeElements, ...afterElements])], itemReports: structuredClone(journal.itemReports), committedAt: now,
  }
}

export async function createProposalCommitPlan(input: Omit<ProposalCommitPlanV1, 'v' | 'planHash'>): Promise<ProposalCommitPlanV1> {
  const hash = await sha256Hex(canonicalJson(input))
  return { v: 1, ...input, planHash: hash }
}

/** WAL-backed cross-store commit. The journal is durable before either store
 * changes; every failure path converges to the complete before state. */
export async function commitProposalPlan(plan: ProposalCommitPlanV1, dependencies: ProposalTransactionDependencies): Promise<ProposalCommitResult> {
  const { service, host } = dependencies
  const freeformStore = dependencies.freeformStore ?? canvasFreeformStore
  const journalStore = dependencies.journalStore ?? proposalTransactionJournal
  const receiptStore = dependencies.receiptStore ?? proposalReceiptStore
  const now = dependencies.now ?? Date.now

  const recalculated = await createProposalCommitPlan({
    planId: plan.planId, proposalId: plan.proposalId, canvasId: plan.canvasId, itemIds: plan.itemIds,
    cardChanges: plan.cardChanges, elementChanges: plan.elementChanges,
  })
  if (recalculated.planHash !== plan.planHash) return { ok: false, committed: false, code: 'PLAN_HASH_MISMATCH' }
  const freeformChanges = plan.elementChanges.filter((change) => (change.expected?.kind ?? change.next?.kind) !== 'card')

  for (const change of plan.cardChanges) if (!same(service.get(change.id), change.expected)) return { ok: false, committed: false, code: 'CARD_EXPECTED_MISMATCH' }
  for (const change of plan.elementChanges) if (!same(host.getElement(change.id) ?? null, change.expected)) return { ok: false, committed: false, code: 'ELEMENT_EXPECTED_MISMATCH', itemIds: [change.itemId] }

  const beforeFreeform = (await freeformStore.load(plan.canvasId as CanvasId))?.elements ?? host.getElements().filter((element) => element.kind !== 'card')
  for (const change of freeformChanges) {
    const persisted = beforeFreeform.find((element) => element.id === change.id) ?? null
    if (!same(persisted, change.expected)) return { ok: false, committed: false, code: 'PERSISTED_EXPECTED_MISMATCH', itemIds: [change.itemId] }
  }
  const afterFreeform = applyElementChanges(beforeFreeform, freeformChanges)
  const beforeCards = plan.cardChanges.flatMap((change) => change.expected ? [cloneCard(change.expected)] : [])
  const afterCards = plan.cardChanges.flatMap((change) => change.next ? [cloneCard(change.next)] : [])
  const journalId = `journal:${plan.planHash}`
  const digestBefore = await sha256Hex(canonicalJson({ cards: beforeCards, elements: beforeFreeform }))
  const digestAfter = await sha256Hex(canonicalJson({ cards: afterCards, elements: afterFreeform }))
  const journal: ProposalTransactionJournalV1 = {
    v: 1, journalId, proposalId: plan.proposalId, planId: plan.planId, planHash: plan.planHash, canvasId: plan.canvasId,
    itemIds: [...plan.itemIds],
    itemReports: plan.itemIds.map((itemId) => ({
      itemId,
      changedCardIds: plan.cardChanges.filter((change) => change.itemId === itemId).map((change) => String(change.id)),
      changedElementIds: plan.elementChanges.filter((change) => change.itemId === itemId).map((change) => change.id),
    })),
    state: 'PREPARED',
    before: { cards: beforeCards, elements: beforeFreeform, digest: digestBefore },
    after: { cards: afterCards, elements: afterFreeform, digest: digestAfter }, createdAt: now(),
  }
  if (!journalStore.write(journal)) return { ok: false, committed: false, code: 'JOURNAL_WRITE_FAILED' }

  if (plan.cardChanges.length && !service.applyBatch(plan.cardChanges)) {
    const before = cardsMatch(service, plan.cardChanges, 'expected')
    const removed = before && journalStore.remove(journalId)
    return { ok: false, committed: false, code: 'CARD_BATCH_FAILED', ...(removed ? {} : { recoveryRequired: true }) }
  }
  if (!await freeformStore.save(plan.canvasId as CanvasId, afterFreeform)) {
    const cardsRolledBack = !plan.cardChanges.length || service.applyBatch(inverseCards(plan.cardChanges))
    const freeformRolledBack = await freeformStore.save(plan.canvasId as CanvasId, beforeFreeform)
    const before = cardsRolledBack && cardsMatch(service, plan.cardChanges, 'expected') && freeformRolledBack && await freeformMatches(freeformStore, plan.canvasId, beforeFreeform)
    const removed = before && journalStore.remove(journalId)
    return { ok: false, committed: false, code: 'FREEFORM_SAVE_FAILED', ...(removed ? {} : { recoveryRequired: true }) }
  }

  try { syncHost(host, plan.elementChanges, 'next') }
  catch {
    const cardsRolledBack = !plan.cardChanges.length || service.applyBatch(inverseCards(plan.cardChanges))
    const freeformRolledBack = await freeformStore.save(plan.canvasId as CanvasId, beforeFreeform)
    let hostRolledBack = false
    try { syncHost(host, plan.elementChanges, 'expected'); hostRolledBack = true } catch { /* recovery will use PREPARED */ }
    const before = cardsRolledBack && cardsMatch(service, plan.cardChanges, 'expected') && freeformRolledBack && await freeformMatches(freeformStore, plan.canvasId, beforeFreeform) && hostRolledBack && hostMatches(host, plan.elementChanges, 'expected')
    const removed = before && journalStore.remove(journalId)
    return { ok: false, committed: false, code: 'HOST_SYNC_FAILED', ...(removed ? {} : { recoveryRequired: true }) }
  }
  if (!journalStore.markCommitted(journalId)) return { ok: false, committed: true, code: 'COMMIT_MARKER_FAILED', recoveryRequired: true }

  const receipt: CommitReceiptV1 = {
    v: 1, receiptId: `receipt:${plan.planHash}`, journalId, proposalId: plan.proposalId, planId: plan.planId,
    planHash: plan.planHash, canvasId: plan.canvasId, itemIds: [...plan.itemIds],
    changedCardIds: plan.cardChanges.map((change) => String(change.id)),
    changedElementIds: plan.elementChanges.map((change) => change.id), itemReports: structuredClone(journal.itemReports), committedAt: now(),
  }
  if (!receiptStore.write(receipt)) return { ok: false, committed: true, code: 'RECEIPT_WRITE_FAILED', recoveryRequired: true }

  let undone = false
  const undo = async (): Promise<ProposalUndoResult> => {
    if (undone) return { ok: false, code: 'ALREADY_UNDONE' }
    for (const change of plan.cardChanges) if (!same(service.get(change.id), change.next)) return { ok: false, code: 'UNDO_CONFLICT' }
    for (const change of plan.elementChanges) if (!same(host.getElement(change.id) ?? null, change.next)) return { ok: false, code: 'UNDO_CONFLICT' }
    if (!journalStore.markUndoPrepared || !journalStore.markUndone) return { ok: false, code: 'UNDO_PERSIST_FAILED' }
    const result = await executeUndo({ ...journal, state: 'COMMITTED' }, receipt.receiptId, {
      service, host, freeformStore,
      journalStore: {
        markUndoPrepared: journalStore.markUndoPrepared.bind(journalStore),
        markCommitted: journalStore.markCommitted.bind(journalStore),
        markUndone: journalStore.markUndone.bind(journalStore),
        remove: journalStore.remove.bind(journalStore),
      },
      receiptStore,
      now,
    })
    if (result.ok) undone = true
    return result
  }
  return { ok: true, committed: true, receipt, undo }
}

/** Resolves journals left by reload/crash. PREPARED mixed states are restored
 * to before; complete after states receive their missing marker/receipt. */
export async function recoverProposalTransactions(dependencies: ProposalRecoveryDependencies): Promise<ProposalRecoveryReport> {
  const freeformStore = dependencies.freeformStore ?? canvasFreeformStore
  const journalStore = dependencies.journalStore ?? proposalTransactionJournal
  const receiptStore = dependencies.receiptStore ?? proposalReceiptStore
  const now = dependencies.now ?? Date.now
  const report: ProposalRecoveryReport = { recovered: [], completed: [], cleared: [], required: [] }
  for (const journal of journalStore.list()) {
    if (dependencies.canvasId && journal.canvasId !== dependencies.canvasId) continue
    const touchedIds = [...new Set([...journal.before.cards, ...journal.after.cards].map((card) => card.id))]
    const currentCards = touchedIds.flatMap((id) => {
      const card = dependencies.service.get(id)
      return card ? [card] : []
    })
    const currentElements = (await freeformStore.load(journal.canvasId as CanvasId))?.elements ?? []
    const currentDigest = await sha256Hex(canonicalJson({ cards: currentCards, elements: currentElements }))
    const isBefore = currentDigest === journal.before.digest
    const isAfter = currentDigest === journal.after.digest
    const receiptId = `receipt:${journal.planHash}`
    const existingReceipt = receiptStore.load(receiptId)
    if (isBefore) {
      if (journal.state === 'PREPARED') {
        if (journalStore.remove(journal.journalId)) report.cleared.push(journal.journalId)
        else report.required.push(journal.journalId)
      } else if (journal.state === 'UNDO_PREPARED' || journal.state === 'UNDONE') {
        const baseReceipt = existingReceipt ?? receiptFromJournal(journal, now())
        const stored = existingReceipt ?? (receiptStore.write(baseReceipt) ? baseReceipt : null)
        const undoneReceipt = stored?.undoneAt ? stored : receiptStore.markUndone?.(receiptId, now())
        const marked = journal.state === 'UNDONE' || !!journalStore.markUndone?.(journal.journalId)
        if (undoneReceipt && marked && journalStore.remove(journal.journalId)) report.completed.push(journal.journalId)
        else report.required.push(journal.journalId)
      } else report.required.push(journal.journalId)
      continue
    }
    if (isAfter) {
      if (journal.state === 'UNDONE' || existingReceipt?.undoneAt) {
        report.required.push(journal.journalId)
        continue
      }
      const marked = journal.state === 'COMMITTED' || !!journalStore.markCommitted(journal.journalId)
      const receipt = existingReceipt ?? receiptFromJournal(journal, now())
      const stored = existingReceipt ?? (receiptStore.write(receipt) ? receipt : null)
      if (marked && stored) report.completed.push(journal.journalId)
      else report.required.push(journal.journalId)
      continue
    }
    if (journal.state === 'COMMITTED' || journal.state === 'UNDONE') {
      report.required.push(journal.journalId)
      continue
    }

    const undoWasDurable = journal.state === 'UNDO_PREPARED' && !!existingReceipt?.undoneAt
    const target = undoWasDurable ? journal.before : journal.state === 'UNDO_PREPARED' ? journal.after : journal.before
    const targetById = new Map(target.cards.map((card) => [String(card.id), card]))
    const restoreCards: CardBatchChange[] = touchedIds.map((id) => ({ id, expected: dependencies.service.get(id), next: targetById.get(String(id)) ?? null }))
    const cardsRestored = restoreCards.length === 0 || dependencies.service.applyBatch(restoreCards)
    const elementsRestored = cardsRestored && await freeformStore.save(journal.canvasId as CanvasId, target.elements)
    let hostRestored = false
    if (cardsRestored && elementsRestored) {
      try { replaceHostFreeform(dependencies.host, target.elements); hostRestored = true } catch { hostRestored = false }
    }
    if (!cardsRestored || !elementsRestored || !hostRestored) {
      report.required.push(journal.journalId)
      continue
    }
    if (journal.state === 'PREPARED') {
      if (journalStore.remove(journal.journalId)) report.recovered.push(journal.journalId)
      else report.required.push(journal.journalId)
    } else if (undoWasDurable) {
      const marked = !!journalStore.markUndone?.(journal.journalId)
      if (marked && journalStore.remove(journal.journalId)) report.recovered.push(journal.journalId)
      else report.required.push(journal.journalId)
    } else if (journalStore.markCommitted(journal.journalId)) report.recovered.push(journal.journalId)
    else report.required.push(journal.journalId)
  }
  return report
}

export async function undoCommittedProposal(receiptId: string, dependencies: PersistedUndoDependencies): Promise<ProposalUndoResult> {
  const freeformStore = dependencies.freeformStore ?? canvasFreeformStore
  const journalStore = dependencies.journalStore ?? proposalTransactionJournal
  const receiptStore = dependencies.receiptStore ?? proposalReceiptStore
  const receipt = receiptStore.load(receiptId)
  if (!receipt || receipt.undoneAt) return { ok: false, code: 'ALREADY_UNDONE' }
  const journal = journalStore.load(receipt.journalId)
  if (!journal) return { ok: false, code: 'UNDO_PERSIST_FAILED' }
  return executeUndo(journal, receiptId, {
    service: dependencies.service,
    host: dependencies.host,
    freeformStore,
    journalStore,
    receiptStore,
    now: dependencies.now ?? Date.now,
  })
}
