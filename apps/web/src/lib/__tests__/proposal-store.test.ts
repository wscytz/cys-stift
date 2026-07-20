import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proposalStore, reconcileSubscribedProposalReview } from '../proposal-store'
import type { ProposalEnvelopeV1, ProposalReviewRecordV1 } from '@/features/ai/coauthor/proposal-contract'
import { canonicalJson, sha256Hex } from '@/features/ai/coauthor/working-set-revision'

const payload = {
  kind: 'cys-proposal-payload' as const,
  version: 1 as const,
  task: 'plan-structure-audit' as const,
  summary: 'Review',
  findings: [],
  items: [],
}

async function envelope(id = 'proposal:test'): Promise<ProposalEnvelopeV1> {
  return {
    kind: 'cys-proposal-envelope', version: 1, proposalId: id, snapshotId: 'ws:1', canvasId: 'canvas:1',
    baseRevisions: { content: 'content', relations: 'relations', geometry: 'geometry' },
    sourceRefs: [{ refId: 'source:1', sourceKind: 'card', entityId: 'card:1', field: 'title', sourceRevision: 'r', selector: { exact: 'Title', excerptHash: 'hash' } }],
    promptVersion: 'v1', schemaVersion: 1, provider: { id: 'ollama', model: 'local' }, payloadHash: await sha256Hex(canonicalJson(payload)), payload,
  }
}

function review(proposalId: string): ProposalReviewRecordV1 {
  return { proposalId, decisions: {}, execution: {}, staleCauses: [] }
}

describe('proposalStore', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('writes the payload before indexing it and restores source anchors', async () => {
    const value = await envelope()
    expect(await proposalStore.save(value, review(value.proposalId))).toBe(true)
    expect(proposalStore.list()).toEqual([expect.objectContaining({ proposalId: value.proposalId, canvasId: 'canvas:1', state: 'reviewing' })])
    expect(await proposalStore.load(value.proposalId)).toEqual(expect.objectContaining({ envelope: expect.objectContaining({ sourceRefs: value.sourceRefs }), review: expect.objectContaining({ proposalId: value.proposalId }) }))
  })

  it('quarantines corrupt fallback data instead of treating it as an empty proposal', async () => {
    const value = await envelope('proposal:broken')
    window.localStorage.setItem('cys-stift.proposal.payload.proposal:broken.v1', '{broken')
    window.localStorage.setItem('cys-stift.proposal.index.v1', JSON.stringify({ v: 1, revision: 1, entries: [{ proposalId: value.proposalId, canvasId: value.canvasId, updatedAt: 1, state: 'reviewing' }] }))
    expect(await proposalStore.load(value.proposalId)).toBeNull()
    expect(proposalStore.list()).toEqual([])
    expect(Object.keys(window.localStorage).some((key) => key.startsWith('cys-stift.proposal.quarantine.'))).toBe(true)
    expect(JSON.parse(proposalStore.exportQuarantine()).entries).toHaveLength(1)
    expect(proposalStore.clearQuarantine()).toBe(true)
    expect(proposalStore.listQuarantine()).toEqual([])
  })

  it('quarantines a payload whose immutable hash no longer matches', async () => {
    const value = await envelope('proposal:tampered')
    expect(await proposalStore.save(value, review(value.proposalId))).toBe(true)
    const key = 'cys-stift.proposal.payload.proposal:tampered.v1'
    const fallback = window.localStorage.getItem(key)
    if (fallback) {
      const stored = JSON.parse(fallback)
      stored.envelope.payload.summary = 'tampered'
      window.localStorage.setItem(key, JSON.stringify(stored))
      expect(await proposalStore.load(value.proposalId)).toBeNull()
      expect(proposalStore.listQuarantine()).toHaveLength(1)
    }
  })

  it('restores the previous payload when an index update fails', async () => {
    const value = await envelope('proposal:index-failure')
    const originalReview = review(value.proposalId)
    expect(await proposalStore.save(value, originalReview)).toBe(true)
    const nativeSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, next: string) {
      if (key === 'cys-stift.proposal.index.v1') throw new DOMException('quota', 'QuotaExceededError')
      return nativeSetItem.call(this, key, next)
    })
    const changed = { ...originalReview, reviewedAt: 'later' }
    expect(await proposalStore.save(value, changed)).toBe(false)
    expect(await proposalStore.load(value.proposalId)).toEqual(expect.objectContaining({ review: originalReview }))
  })

  it('marks a linked proposal interrupted after a generation crash and enforces one committing lease', async () => {
    const value = await envelope('proposal:interrupted')
    expect(await proposalStore.save(value, review(value.proposalId))).toBe(true)
    const generationId = proposalStore.beginGeneration('canvas:1')
    expect(generationId).toBeTruthy()
    expect(proposalStore.linkGeneration(generationId!, value.proposalId)).toBe(true)
    expect(proposalStore.recoverInterruptedGenerations('canvas:1')).toBe(1)
    expect(proposalStore.list()).toEqual([expect.objectContaining({ proposalId: value.proposalId, state: 'interrupted' })])
    expect(proposalStore.recoverInterruptedGenerations('canvas:1')).toBe(0)
    expect(await proposalStore.acquireCommitLease('proposal:lease', 'tab:a')).toBe(true)
    expect(await proposalStore.acquireCommitLease('proposal:lease', 'tab:b')).toBe(false)
    proposalStore.releaseCommitLease('proposal:lease', 'tab:a')
    expect(await proposalStore.acquireCommitLease('proposal:lease', 'tab:b')).toBe(true)
  })

  it('keeps a linked generation marker when the interrupted index update fails', async () => {
    const value = await envelope('proposal:interrupted-index-failure')
    expect(await proposalStore.save(value, review(value.proposalId))).toBe(true)
    const generationId = proposalStore.beginGeneration('canvas:1')!
    expect(proposalStore.linkGeneration(generationId, value.proposalId)).toBe(true)
    const nativeSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, next: string) {
      if (key === 'cys-stift.proposal.index.v1') throw new DOMException('quota', 'QuotaExceededError')
      return nativeSetItem.call(this, key, next)
    })
    expect(proposalStore.recoverInterruptedGenerations('canvas:1')).toBe(0)
    vi.restoreAllMocks()
    expect(proposalStore.recoverInterruptedGenerations('canvas:1')).toBe(1)
    expect(proposalStore.list()[0]?.state).toBe('interrupted')
  })

  it('merges independent decisions from a stale tab instead of resetting them to pending', async () => {
    const value = await envelope('proposal:merge')
    const first = {
      ...review(value.proposalId),
      decisions: { logic: 'accepted' as const, idea: 'pending' as const },
      decisionUpdatedAt: { logic: '2026-07-20T01:00:00.000Z' },
      reviewedAt: '2026-07-20T01:00:00.000Z',
    }
    const staleSecondTab = {
      ...review(value.proposalId),
      decisions: { logic: 'pending' as const, idea: 'accepted' as const },
      decisionUpdatedAt: { idea: '2026-07-20T01:00:01.000Z' },
      reviewedAt: '2026-07-20T01:00:01.000Z',
    }
    expect(await proposalStore.save(value, first)).toBe(true)
    expect(await proposalStore.save(value, staleSecondTab)).toBe(true)
    expect((await proposalStore.load(value.proposalId))?.review.decisions).toEqual({ logic: 'accepted', idea: 'accepted' })
  })

  it('does not let a lagging same-tab save clear a newer local preview', () => {
    const local = {
      ...review('proposal:local'),
      decisions: { logic: 'accepted' as const, idea: 'accepted' as const },
      decisionUpdatedAt: { logic: '2026-07-20T01:00:00.000Z', idea: '2026-07-20T01:00:01.000Z' },
      execution: { logic: { state: 'ready' as const }, idea: { state: 'ready' as const } },
    }
    const lagging = {
      ...review('proposal:local'),
      decisions: { logic: 'accepted' as const, idea: 'pending' as const },
      decisionUpdatedAt: { logic: '2026-07-20T01:00:00.000Z' },
      execution: { logic: { state: 'not-compiled' as const }, idea: { state: 'not-compiled' as const } },
    }
    const result = reconcileSubscribedProposalReview(local, lagging)
    expect(result.planChanged).toBe(false)
    expect(result.review.decisions).toEqual(local.decisions)
    expect(result.review.execution).toEqual(local.execution)
  })

  it('invalidates a preview for a genuinely newer cross-tab decision', () => {
    const local = {
      ...review('proposal:remote'),
      decisions: { logic: 'accepted' as const },
      decisionUpdatedAt: { logic: '2026-07-20T01:00:00.000Z' },
    }
    const remote = {
      ...review('proposal:remote'),
      decisions: { logic: 'rejected' as const },
      decisionUpdatedAt: { logic: '2026-07-20T01:00:02.000Z' },
    }
    const result = reconcileSubscribedProposalReview(local, remote)
    expect(result.planChanged).toBe(true)
    expect(result.review.decisions.logic).toBe('rejected')
  })

  it('accepts execution-only subscription updates without invalidating the preview', () => {
    const local = {
      ...review('proposal:execution'),
      decisions: { logic: 'accepted' as const },
      decisionUpdatedAt: { logic: '2026-07-20T01:00:00.000Z' },
      execution: { logic: { state: 'not-compiled' as const } },
    }
    const stored = { ...local, execution: { logic: { state: 'ready' as const } } }
    const result = reconcileSubscribedProposalReview(local, stored)
    expect(result.planChanged).toBe(false)
    expect(result.review.execution.logic).toEqual({ state: 'ready' })
  })
})
