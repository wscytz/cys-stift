import { describe, expect, it, vi } from 'vitest'
import { InMemoryCanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import { CardService, type Card, type CardId, type CardRepository } from '@cys-stift/domain'
import { commitProposalPlan, createProposalCommitPlan, recoverProposalTransactions, undoCommittedProposal } from '../proposal-transaction'
import type { CommitReceiptV1, ProposalTransactionJournalV1 } from '@/lib/proposal-transaction-journal'

function service(): CardService {
  const cards: Card[] = []
  const repo: CardRepository = {
    insert: (card) => { cards.push(card) },
    update: (card) => { const index = cards.findIndex((item) => item.id === card.id); if (index >= 0) cards[index] = card },
    delete: (id) => { const index = cards.findIndex((item) => item.id === id); if (index >= 0) cards.splice(index, 1) },
    getById: (id) => cards.find((card) => card.id === id) ?? null,
    listInbox: () => [], listOnCanvas: () => cards, listAll: () => cards,
    applyBatch: (changes) => {
      for (const change of changes) if (JSON.stringify(repo.getById(change.id)) !== JSON.stringify(change.expected)) return false
      for (const change of changes) {
        const index = cards.findIndex((item) => item.id === change.id)
        if (change.next && index >= 0) cards[index] = change.next
        else if (change.next) cards.push(change.next)
        else if (index >= 0) cards.splice(index, 1)
      }
      return true
    },
  }
  return new CardService(repo)
}

function card(id: string, x: number): CanvasElement {
  return { id, kind: 'card', x, y: 0, w: 100, h: 80, rotation: 0 }
}

async function plan(arrow: CanvasElement) {
  return createProposalCommitPlan({
    planId: 'plan:1', proposalId: 'proposal:1', canvasId: 'canvas:1', itemIds: ['item:1'], cardChanges: [],
    elementChanges: [{ itemId: 'item:1', id: arrow.id, expected: null, next: arrow }],
  })
}

function dependencies(saveResult = true) {
  const host = new InMemoryCanvasHost()
  host.applyWithoutEcho(() => { host.upsert(card('a', 0)); host.upsert(card('b', 200)) })
  let elements: CanvasElement[] = []
  let journal: ProposalTransactionJournalV1 | null = null
  let receipt: CommitReceiptV1 | null = null
  return {
    host,
    elements: () => elements,
    setElements: (next: CanvasElement[]) => { elements = next },
    journal: () => journal,
    receipt: () => receipt,
    dependencies: {
      service: service(), host,
      freeformStore: {
        load: vi.fn(async () => ({ v: 1 as const, app: 'cys-stift' as const, elements })),
        save: vi.fn(async (_canvasId, next: CanvasElement[]) => { if (!saveResult) return false; elements = structuredClone(next); return true }),
      },
      journalStore: {
        write: vi.fn((value) => { journal = value; return true }),
        markCommitted: vi.fn(() => { if (!journal) return null; journal = { ...journal, state: 'COMMITTED' }; return journal }),
        markUndoPrepared: vi.fn(() => { if (!journal || journal.state !== 'COMMITTED') return null; journal = { ...journal, state: 'UNDO_PREPARED' }; return journal }),
        markUndone: vi.fn(() => { if (!journal || journal.state !== 'UNDO_PREPARED') return null; journal = { ...journal, state: 'UNDONE' }; return journal }),
        remove: vi.fn(() => { journal = null; return true }),
      },
      receiptStore: {
        write: vi.fn((value) => { receipt = value; return true }),
        markUndone: vi.fn((_id: string, at?: number) => { if (!receipt || receipt.undoneAt) return null; receipt = { ...receipt, undoneAt: at }; return receipt as never }),
      },
      now: () => 10,
    },
  }
}

describe('proposal transaction', () => {
  it('commits one immutable plan and supports guarded one-shot undo', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', text: 'blocks' }
    const fixture = dependencies()
    const result = await commitProposalPlan(await plan(arrow), fixture.dependencies)
    expect(result).toMatchObject({ ok: true, committed: true, receipt: { changedElementIds: ['arrow:1'] } })
    expect(fixture.host.getElement('arrow:1')).toEqual(arrow)
    expect(fixture.elements()).toEqual([arrow])
    if (!result.ok) throw new Error('expected commit')
    expect(await result.undo()).toEqual({ ok: true })
    expect(fixture.host.getElement('arrow:1')).toBeUndefined()
    expect(await result.undo()).toEqual({ ok: false, code: 'ALREADY_UNDONE' })
  })

  it('rejects stale expected values before writing its journal', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    fixture.host.applyWithoutEcho(() => fixture.host.upsert({ ...arrow, text: 'manual' }))
    expect(await commitProposalPlan(await plan(arrow), fixture.dependencies)).toMatchObject({ ok: false, committed: false, code: 'ELEMENT_EXPECTED_MISMATCH' })
  })

  it('restores the complete before state when freeform persistence fails', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies(false)
    expect(await commitProposalPlan(await plan(arrow), fixture.dependencies)).toMatchObject({ ok: false, committed: false, code: 'FREEFORM_SAVE_FAILED' })
    expect(fixture.host.getElement('arrow:1')).toBeUndefined()
    expect(fixture.elements()).toEqual([])
  })

  it('completes an all-after PREPARED journal after restart', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    expect((await commitProposalPlan(await plan(arrow), fixture.dependencies)).ok).toBe(true)
    const journal = { ...fixture.journal()!, state: 'PREPARED' as const }
    const writeReceipt = vi.fn(() => true)
    const report = await recoverProposalTransactions({
      service: fixture.dependencies.service, host: fixture.host, freeformStore: fixture.dependencies.freeformStore,
      journalStore: { list: () => [journal], markCommitted: vi.fn(() => ({ ...journal, state: 'COMMITTED' as const })), remove: vi.fn(() => true) },
      receiptStore: { load: () => null, write: writeReceipt }, now: () => 20,
    })
    expect(report.completed).toEqual([journal.journalId])
    expect(writeReceipt).toHaveBeenCalledWith(expect.objectContaining({ proposalId: 'proposal:1', changedElementIds: ['arrow:1'] }))
  })

  it('rolls an unknown mixed PREPARED state back to before', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    expect((await commitProposalPlan(await plan(arrow), fixture.dependencies)).ok).toBe(true)
    const journal = { ...fixture.journal()!, state: 'PREPARED' as const }
    const unexpected = { ...arrow, id: 'unexpected' }
    fixture.setElements([unexpected])
    fixture.host.applyWithoutEcho(() => fixture.host.upsert(unexpected))
    const report = await recoverProposalTransactions({
      service: fixture.dependencies.service, host: fixture.host, freeformStore: fixture.dependencies.freeformStore,
      journalStore: { list: () => [journal], markCommitted: vi.fn(() => null), remove: vi.fn(() => true) },
      receiptStore: { load: () => null, write: vi.fn(() => true) },
    })
    expect(report.recovered).toEqual([journal.journalId])
    expect(fixture.elements()).toEqual([])
    expect(fixture.host.getElement('unexpected')).toBeUndefined()
    expect(fixture.host.getElement('arrow:1')).toBeUndefined()
  })

  it('finishes an UNDO_PREPARED journal whose stores already match before', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    expect((await commitProposalPlan(await plan(arrow), fixture.dependencies)).ok).toBe(true)
    const journal = { ...fixture.journal()!, state: 'UNDO_PREPARED' as const }
    fixture.setElements([])
    fixture.host.applyWithoutEcho(() => fixture.host.remove(arrow.id))
    const markUndone = vi.fn(() => ({ ...journal, state: 'UNDONE' as const }))
    const remove = vi.fn(() => true)
    const markReceiptUndone = vi.fn(() => ({ ...fixture.receipt()!, undoneAt: 30 }))

    const report = await recoverProposalTransactions({
      service: fixture.dependencies.service, host: fixture.host, freeformStore: fixture.dependencies.freeformStore,
      journalStore: { list: () => [journal], markCommitted: vi.fn(() => null), markUndone, remove },
      receiptStore: { load: () => fixture.receipt(), write: vi.fn(() => true), markUndone: markReceiptUndone }, now: () => 30,
    })
    expect(report.completed).toEqual([journal.journalId])
    expect(markReceiptUndone).toHaveBeenCalled()
    expect(markUndone).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
  })

  it('restores an UNDO_PREPARED all-after state to COMMITTED', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    expect((await commitProposalPlan(await plan(arrow), fixture.dependencies)).ok).toBe(true)
    const journal = { ...fixture.journal()!, state: 'UNDO_PREPARED' as const }
    const markCommitted = vi.fn(() => ({ ...journal, state: 'COMMITTED' as const }))

    const report = await recoverProposalTransactions({
      service: fixture.dependencies.service, host: fixture.host, freeformStore: fixture.dependencies.freeformStore,
      journalStore: { list: () => [journal], markCommitted, markUndone: vi.fn(() => null), remove: vi.fn(() => true) },
      receiptStore: { load: () => fixture.receipt(), write: vi.fn(() => true), markUndone: vi.fn(() => null) },
    })
    expect(report.completed).toEqual([journal.journalId])
    expect(markCommitted).toHaveBeenCalledWith(journal.journalId)
  })

  it('repairs an UNDO_PREPARED mixed state back to committed after', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    expect((await commitProposalPlan(await plan(arrow), fixture.dependencies)).ok).toBe(true)
    const journal = { ...fixture.journal()!, state: 'UNDO_PREPARED' as const }
    const unexpected: CanvasElement = { id: 'unexpected', kind: 'text', x: 1, y: 2, w: 40, h: 20, rotation: 0, text: 'mixed' }
    fixture.setElements([unexpected])
    fixture.host.applyWithoutEcho(() => {
      fixture.host.remove(arrow.id)
      fixture.host.upsert(unexpected)
    })
    const markCommitted = vi.fn(() => ({ ...journal, state: 'COMMITTED' as const }))

    const report = await recoverProposalTransactions({
      service: fixture.dependencies.service, host: fixture.host, freeformStore: fixture.dependencies.freeformStore,
      journalStore: { list: () => [journal], markCommitted, markUndone: vi.fn(() => null), remove: vi.fn(() => true) },
      receiptStore: { load: () => fixture.receipt(), write: vi.fn(() => true), markUndone: vi.fn(() => null) },
    })
    expect(report.recovered).toEqual([journal.journalId])
    expect(fixture.elements()).toEqual([arrow])
    expect(fixture.host.getElement(arrow.id)).toEqual(arrow)
    expect(fixture.host.getElement(unexpected.id)).toBeUndefined()
    expect(markCommitted).toHaveBeenCalledWith(journal.journalId)
  })

  it('does not mutate when the PREPARED journal cannot be written', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    const deps = { ...fixture.dependencies, journalStore: { ...fixture.dependencies.journalStore, write: vi.fn(() => false) } }
    expect(await commitProposalPlan(await plan(arrow), deps)).toMatchObject({ ok: false, committed: false, code: 'JOURNAL_WRITE_FAILED' })
    expect(fixture.elements()).toEqual([])
  })

  it('does not mutate committed state when UNDO_PREPARED cannot be written', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    const committed = await commitProposalPlan(await plan(arrow), fixture.dependencies)
    if (!committed.ok) throw new Error('expected commit')
    fixture.dependencies.journalStore.markUndoPrepared.mockReturnValue(null)

    expect(await committed.undo()).toEqual({ ok: false, code: 'UNDO_PERSIST_FAILED' })
    expect(fixture.elements()).toEqual([arrow])
    expect(fixture.host.getElement(arrow.id)).toEqual(arrow)
    expect(fixture.journal()?.state).toBe('COMMITTED')
  })

  it('reports durable after-state when the commit marker or receipt write fails', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const markerFixture = dependencies()
    const markerDeps = { ...markerFixture.dependencies, journalStore: { ...markerFixture.dependencies.journalStore, markCommitted: vi.fn(() => null) } }
    expect(await commitProposalPlan(await plan(arrow), markerDeps)).toMatchObject({ ok: false, committed: true, code: 'COMMIT_MARKER_FAILED' })
    expect(markerFixture.elements()).toEqual([arrow])

    const receiptFixture = dependencies()
    const receiptDeps = { ...receiptFixture.dependencies, receiptStore: { ...receiptFixture.dependencies.receiptStore, write: vi.fn(() => false) } }
    expect(await commitProposalPlan(await plan(arrow), receiptDeps)).toMatchObject({ ok: false, committed: true, code: 'RECEIPT_WRITE_FAILED' })
    expect(receiptFixture.elements()).toEqual([arrow])
  })

  it('refuses undo after a later user edit instead of overwriting it', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    const result = await commitProposalPlan(await plan(arrow), fixture.dependencies)
    if (!result.ok) throw new Error('expected commit')
    fixture.host.applyWithoutEcho(() => fixture.host.upsert({ ...arrow, text: 'user edit' }))
    expect(await result.undo()).toEqual({ ok: false, code: 'UNDO_CONFLICT' })
    expect(fixture.host.getElement('arrow:1')?.text).toBe('user edit')
  })

  it('refuses undo when an unrelated live-host edit has not reached persistence yet', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    const committed = await commitProposalPlan(await plan(arrow), fixture.dependencies)
    if (!committed.ok) throw new Error('expected commit')
    const localOnly: CanvasElement = { id: 'local-only', kind: 'text', x: 10, y: 10, w: 80, h: 24, rotation: 0, text: 'unsaved' }
    fixture.host.applyWithoutEcho(() => fixture.host.upsert(localOnly))

    expect(await committed.undo()).toEqual({ ok: false, code: 'UNDO_CONFLICT' })
    expect(fixture.host.getElement(localOnly.id)).toEqual(localOnly)
    expect(fixture.elements()).toEqual([arrow])
  })

  it('restores the complete committed state when an Undo freeform save fails', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const next: Card = { id: 'idea' as CardId, title: 'Idea', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], source: { kind: 'unknown' }, capturedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), tags: [], pinned: false, archived: false }
    const fixture = dependencies()
    const combined = await createProposalCommitPlan({
      planId: 'combined', proposalId: 'proposal:combined', canvasId: 'canvas:1', itemIds: ['idea', 'logic'],
      cardChanges: [{ itemId: 'idea', id: next.id, expected: null, next }],
      elementChanges: [{ itemId: 'logic', id: arrow.id, expected: null, next: arrow }],
    })
    const committed = await commitProposalPlan(combined, fixture.dependencies)
    if (!committed.ok) throw new Error('expected commit')
    fixture.dependencies.freeformStore.save.mockImplementationOnce(async () => false)

    expect(await committed.undo()).toEqual({ ok: false, code: 'UNDO_PERSIST_FAILED' })
    expect(fixture.dependencies.service.get(next.id)).toEqual(next)
    expect(fixture.elements()).toEqual([arrow])
    expect(fixture.host.getElement(arrow.id)).toEqual(arrow)
    expect(fixture.journal()?.state).toBe('COMMITTED')
  })

  it('retains the WAL and requests recovery when rollback itself fails', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    fixture.dependencies.freeformStore.save
      .mockImplementationOnce(async () => false)
      .mockImplementationOnce(async () => false)

    expect(await commitProposalPlan(await plan(arrow), fixture.dependencies)).toMatchObject({
      ok: false, committed: false, code: 'FREEFORM_SAVE_FAILED', recoveryRequired: true,
    })
    expect(fixture.journal()?.state).toBe('PREPARED')
  })

  it('reports recovery when Undo compensation succeeds but its COMMITTED marker fails', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    const committed = await commitProposalPlan(await plan(arrow), fixture.dependencies)
    if (!committed.ok) throw new Error('expected commit')
    fixture.dependencies.freeformStore.save.mockImplementationOnce(async () => false)
    fixture.dependencies.journalStore.markCommitted.mockReturnValue(null)

    expect(await committed.undo()).toEqual({ ok: false, code: 'UNDO_PERSIST_FAILED', recoveryRequired: true })
    expect(fixture.elements()).toEqual([arrow])
    expect(fixture.host.getElement(arrow.id)).toEqual(arrow)
    expect(fixture.journal()?.state).toBe('UNDO_PREPARED')
  })

  it('leaves a durable recoverable before-state when the UNDONE journal marker fails', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    const committed = await commitProposalPlan(await plan(arrow), fixture.dependencies)
    if (!committed.ok) throw new Error('expected commit')
    fixture.dependencies.journalStore.markUndone.mockReturnValue(null)

    expect(await committed.undo()).toEqual({ ok: true, recoveryRequired: true })
    expect(fixture.elements()).toEqual([])
    expect(fixture.receipt()?.undoneAt).toBe(10)
    expect(fixture.journal()?.state).toBe('UNDO_PREPARED')
  })

  it('stops before freeform mutation when the card batch rejects expected values', async () => {
    const fixture = dependencies()
    vi.spyOn(fixture.dependencies.service, 'applyBatch').mockReturnValue(false)
    const next: Card = { id: 'new' as CardId, title: 'Idea', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], source: { kind: 'unknown' }, capturedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), tags: [], pinned: false, archived: false }
    const cardPlan = await createProposalCommitPlan({ planId: 'card', proposalId: 'p', canvasId: 'canvas:1', itemIds: ['idea'], cardChanges: [{ itemId: 'idea', id: next.id, expected: null, next }], elementChanges: [] })
    expect(await commitProposalPlan(cardPlan, fixture.dependencies)).toMatchObject({ ok: false, committed: false, code: 'CARD_BATCH_FAILED' })
    expect(fixture.elements()).toEqual([])
  })

  it('rolls persisted freeform back when live host synchronization throws', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    vi.spyOn(fixture.host, 'applyWithoutEcho').mockImplementation(() => { throw new Error('host failed') })
    expect(await commitProposalPlan(await plan(arrow), fixture.dependencies)).toMatchObject({ ok: false, committed: false, code: 'HOST_SYNC_FAILED' })
    expect(fixture.elements()).toEqual([])
  })

  it('supports guarded Undo from persisted receipt and journal after reload', async () => {
    const arrow: CanvasElement = { id: 'arrow:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
    const fixture = dependencies()
    expect((await commitProposalPlan(await plan(arrow), fixture.dependencies)).ok).toBe(true)
    const journal = fixture.journal()!
    const receipt = fixture.receipt()!
    const result = await undoCommittedProposal(receipt.receiptId, {
      service: fixture.dependencies.service, host: fixture.host, freeformStore: fixture.dependencies.freeformStore,
      journalStore: {
        load: () => journal,
        markUndoPrepared: fixture.dependencies.journalStore.markUndoPrepared,
        markCommitted: fixture.dependencies.journalStore.markCommitted,
        markUndone: fixture.dependencies.journalStore.markUndone,
        remove: fixture.dependencies.journalStore.remove,
      },
      receiptStore: { load: () => receipt, markUndone: fixture.dependencies.receiptStore.markUndone }, now: () => 30,
    })
    expect(result).toEqual({ ok: true })
    expect(fixture.host.getElement('arrow:1')).toBeUndefined()
    expect(fixture.elements()).toEqual([])
  })

  it('leaves no ghost state after a long commit/undo session', async () => {
    const fixture = dependencies()
    for (let index = 0; index < 100; index++) {
      const arrow: CanvasElement = { id: `arrow:${index}`, kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' }
      const nextPlan = await createProposalCommitPlan({ planId: `plan:${index}`, proposalId: `proposal:${index}`, canvasId: 'canvas:1', itemIds: [`item:${index}`], cardChanges: [], elementChanges: [{ itemId: `item:${index}`, id: arrow.id, expected: null, next: arrow }] })
      const result = await commitProposalPlan(nextPlan, fixture.dependencies)
      if (!result.ok) throw new Error(`commit ${index} failed`)
      expect(await result.undo()).toEqual({ ok: true })
    }
    expect(fixture.elements()).toEqual([])
    expect(fixture.host.getElements().filter((element) => element.kind === 'arrow')).toEqual([])
  }, 15_000)
})
