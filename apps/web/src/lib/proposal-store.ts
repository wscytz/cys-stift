'use client'

import type { ProposalEnvelopeV1, ProposalReviewRecordV1 } from '@/features/ai/coauthor/proposal-contract'
import { decodeStoredProposal, type StoredProposalV1 } from './proposal-codec'

const PREFIX = 'cys-stift.proposal.'
const INDEX_KEY = `${PREFIX}index.v1`
const QUARANTINE_PREFIX = `${PREFIX}quarantine.`
const GENERATION_PREFIX = `${PREFIX}generation.`
const OPFS_DIR = 'cys-stift'
const ARCHIVED_CAP_PER_CANVAS = 20
const WRITE_LOCK_PREFIX = `${PREFIX}write.`
const COMMIT_LOCK_PREFIX = `${PREFIX}commit.`

type LockManagerLike = {
  request<T>(name: string, options: { mode: 'exclusive'; ifAvailable?: boolean }, callback: (lock: unknown | null) => Promise<T> | T): Promise<T>
}

function lockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { locks?: LockManagerLike }).locks ?? null
}

async function withExclusiveLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  const locks = lockManager()
  return locks ? locks.request(name, { mode: 'exclusive' }, () => work()) : work()
}

export type ProposalIndexState = 'reviewing' | 'committing' | 'committed' | 'undo-available' | 'interrupted' | 'archived'
interface ProposalIndexV1 {
  v: 1
  revision: number
  entries: Array<{ proposalId: string; canvasId: string; updatedAt: number; state: ProposalIndexState }>
}

function emptyIndex(): ProposalIndexV1 { return { v: 1, revision: 0, entries: [] } }
function payloadKey(id: string): string { return `${PREFIX}payload.${id}.v1` }
async function opfsRead(name: string): Promise<string | null> {
  try { const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle(OPFS_DIR); const file = await dir.getFileHandle(name); return await (await file.getFile()).text() } catch { return null }
}
async function opfsWrite(name: string, text: string): Promise<boolean> {
  try { const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true }); const file = await dir.getFileHandle(name, { create: true }); const writer = await file.createWritable(); await writer.write(text); await writer.close(); return true } catch { return false }
}
function opfsPayload(id: string): string { return `proposal-payload.${id}.v1` }
async function opfsRemove(name: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle(OPFS_DIR)
    await dir.removeEntry(name)
  } catch { /* missing OPFS entries are harmless */ }
}
async function removePayload(id: string): Promise<void> {
  try { window.localStorage.removeItem(payloadKey(id)) } catch { /* best effort after index commit */ }
  await opfsRemove(opfsPayload(id))
}
function readIndex(): ProposalIndexV1 | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(INDEX_KEY) ?? '') as ProposalIndexV1
    return value.v === 1 && typeof value.revision === 'number' && Array.isArray(value.entries) ? value : null
  } catch { return null }
}
function writeIndex(index: ProposalIndexV1): boolean {
  try { window.localStorage.setItem(INDEX_KEY, JSON.stringify(index)); return true } catch { return false }
}

function eventTime(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/** Merge review-owned fields per item. This is deliberately not a generic
 * object merge: a stale tab may not turn a decision back into pending or erase
 * an independent decision made in another tab. */
export function mergeProposalReviewRecords(stored: ProposalReviewRecordV1, incoming: ProposalReviewRecordV1): ProposalReviewRecordV1 {
  const decisions = { ...incoming.decisions }
  const execution = { ...incoming.execution }
  const decisionUpdatedAt = { ...(stored.decisionUpdatedAt ?? {}), ...(incoming.decisionUpdatedAt ?? {}) }
  for (const itemId of new Set([...Object.keys(stored.decisions), ...Object.keys(incoming.decisions)])) {
    const storedDecision = stored.decisions[itemId] ?? 'pending'
    const incomingDecision = incoming.decisions[itemId] ?? 'pending'
    const storedAt = eventTime(stored.decisionUpdatedAt?.[itemId])
    const incomingAt = eventTime(incoming.decisionUpdatedAt?.[itemId])
    const preserveStored = storedAt > incomingAt || (storedDecision !== 'pending' && incomingDecision === 'pending' && incomingAt <= storedAt)
    if (preserveStored) {
      decisions[itemId] = storedDecision
      if (stored.execution[itemId]) execution[itemId] = stored.execution[itemId]!
      if (stored.decisionUpdatedAt?.[itemId]) decisionUpdatedAt[itemId] = stored.decisionUpdatedAt[itemId]!
    }
  }

  const storedKeep = new Set(stored.keepPositionIds ?? [])
  const incomingKeep = new Set(incoming.keepPositionIds ?? [])
  const keepPositionUpdatedAt = { ...(stored.keepPositionUpdatedAt ?? {}), ...(incoming.keepPositionUpdatedAt ?? {}) }
  const keepPositionIds = new Set<string>()
  for (const elementId of new Set([...storedKeep, ...incomingKeep, ...Object.keys(stored.keepPositionUpdatedAt ?? {}), ...Object.keys(incoming.keepPositionUpdatedAt ?? {})])) {
    const storedAt = eventTime(stored.keepPositionUpdatedAt?.[elementId])
    const incomingAt = eventTime(incoming.keepPositionUpdatedAt?.[elementId])
    const enabled = storedAt > incomingAt ? storedKeep.has(elementId) : incomingKeep.has(elementId)
    if (enabled) keepPositionIds.add(elementId)
    if (storedAt > incomingAt && stored.keepPositionUpdatedAt?.[elementId]) keepPositionUpdatedAt[elementId] = stored.keepPositionUpdatedAt[elementId]!
  }
  const reviewedAt = eventTime(stored.reviewedAt) > eventTime(incoming.reviewedAt) ? stored.reviewedAt : incoming.reviewedAt
  return {
    ...incoming,
    decisions,
    decisionUpdatedAt,
    execution,
    keepPositionIds: [...keepPositionIds].sort(),
    keepPositionUpdatedAt,
    ...(reviewedAt ? { reviewedAt } : {}),
  }
}

function planInputSignature(review: ProposalReviewRecordV1): string {
  return JSON.stringify({
    decisions: Object.entries(review.decisions).sort(([left], [right]) => left.localeCompare(right)),
    keepPositionIds: [...(review.keepPositionIds ?? [])].sort(),
  })
}

/** Reconcile an asynchronously persisted/cross-tab review with the current UI
 * state. Same-tab writes are serialized, so subscribers can observe older
 * intermediate snapshots after the user has already made later decisions.
 * Per-item timestamps keep those snapshots from rolling the UI backward. */
export function reconcileSubscribedProposalReview(
  local: ProposalReviewRecordV1,
  stored: ProposalReviewRecordV1,
): { review: ProposalReviewRecordV1; planChanged: boolean } {
  const localPlanInputs = planInputSignature(local)
  const storedPlanInputs = planInputSignature(stored)
  const merged = mergeProposalReviewRecords(stored, local)
  const mergedPlanInputs = planInputSignature(merged)
  // Execution-only updates are safe to consume when both sides describe the
  // same review decisions. They never invalidate an immutable preview plan.
  const review = storedPlanInputs === localPlanInputs
    ? { ...merged, execution: { ...merged.execution, ...stored.execution } }
    : merged
  return { review, planChanged: mergedPlanInputs !== localPlanInputs }
}

let version = 0
const subscribers = new Set<() => void>()
function notify(): void { version++; for (const subscriber of subscribers) subscriber() }
const heldCommitLocks = new Map<string, { owner: string; release: () => void }>()

if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key === INDEX_KEY && event.newValue !== event.oldValue) notify()
})

/** Proposal storage is intentionally separate from AI samples/archive. This
 * local fallback is used when OPFS is unavailable; callers see an explicit
 * failure rather than an index without a payload. */
export const proposalStore = {
  subscribe(callback: () => void): () => void { subscribers.add(callback); return () => subscribers.delete(callback) },
  getVersion(): number { return version },
  beginGeneration(canvasId: string): string | null {
    if (typeof window === 'undefined') return 'ssr'
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`
    try { window.localStorage.setItem(`${GENERATION_PREFIX}${id}`, JSON.stringify({ v: 1, id, canvasId, startedAt: Date.now() })); return id } catch { return null }
  },
  linkGeneration(id: string, proposalId: string): boolean {
    if (typeof window === 'undefined') return true
    const key = `${GENERATION_PREFIX}${id}`
    try {
      const marker = JSON.parse(window.localStorage.getItem(key) ?? '') as { v?: number; id?: string; canvasId?: string; startedAt?: number }
      if (marker.v !== 1 || marker.id !== id || typeof marker.canvasId !== 'string') return false
      window.localStorage.setItem(key, JSON.stringify({ ...marker, proposalId }))
      return true
    } catch { return false }
  },
  endGeneration(id: string): void {
    if (typeof window === 'undefined') return
    try { window.localStorage.removeItem(`${GENERATION_PREFIX}${id}`) } catch { /* recovery will report it as interrupted */ }
  },
  recoverInterruptedGenerations(canvasId: string): number {
    if (typeof window === 'undefined') return 0
    const markers: Array<{ key: string; proposalId?: string }> = []
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(GENERATION_PREFIX)) continue
      try {
        const value = JSON.parse(window.localStorage.getItem(key) ?? '') as { canvasId?: string; proposalId?: string }
        if (value.canvasId !== canvasId) continue
        markers.push({ key, ...(typeof value.proposalId === 'string' ? { proposalId: value.proposalId } : {}) })
      } catch { window.localStorage.removeItem(key) }
    }
    if (markers.length === 0) return 0

    const current = readIndex() ?? emptyIndex()
    const interruptedIds = new Set(markers.flatMap((marker) => marker.proposalId ? [marker.proposalId] : []))
    const entries = current.entries.map((entry) => interruptedIds.has(entry.proposalId) && entry.canvasId === canvasId
      ? { ...entry, state: 'interrupted' as const, updatedAt: Date.now() }
      : entry)
    const changed = entries.some((entry, index) => entry !== current.entries[index])
    if (changed && !writeIndex({ ...current, revision: current.revision + 1, entries })) return 0

    for (const marker of markers) window.localStorage.removeItem(marker.key)
    if (changed) notify()
    return markers.length
  },
  list(): ProposalIndexV1['entries'] { return typeof window === 'undefined' ? [] : [...(readIndex() ?? emptyIndex()).entries].sort((a, b) => b.updatedAt - a.updatedAt) },
  async save(envelope: ProposalEnvelopeV1, review: ProposalReviewRecordV1, state: ProposalIndexState = 'reviewing'): Promise<boolean> {
    if (typeof window === 'undefined') return true
    return withExclusiveLock(`${WRITE_LOCK_PREFIX}${envelope.proposalId}`, async () => {
      const opfsName = opfsPayload(envelope.proposalId)
      const fallbackKey = payloadKey(envelope.proposalId)
      const previousOpfs = await opfsRead(opfsName)
      let previousFallback: string | null = null
      try { previousFallback = window.localStorage.getItem(fallbackKey) } catch { /* write below reports the failure */ }
      const previous = await decodeStoredProposal(previousOpfs ?? previousFallback ?? '')
      if (previous && previous.envelope.payloadHash !== envelope.payloadHash) return false
      const mergedReview = previous ? mergeProposalReviewRecords(previous.review, review) : review
      const stored: StoredProposalV1 = { v: 1, envelope, review: mergedReview, updatedAt: Date.now() }
      // Payload first: an index is never allowed to point at a missing payload.
      const payloadText = JSON.stringify(stored)
      const payloadInOpfs = await opfsWrite(opfsName, payloadText)
      if (!payloadInOpfs) try { window.localStorage.setItem(fallbackKey, payloadText) } catch { return false }
      const index = readIndex() ?? emptyIndex()
      const entry = { proposalId: envelope.proposalId, canvasId: envelope.canvasId, updatedAt: stored.updatedAt, state }
      index.entries = [...index.entries.filter((item) => item.proposalId !== entry.proposalId), entry]
      const archived = index.entries.filter((item) => item.canvasId === envelope.canvasId && item.state === 'archived').sort((a, b) => b.updatedAt - a.updatedAt)
      const evicted = new Set(archived.slice(ARCHIVED_CAP_PER_CANVAS).map((item) => item.proposalId))
      if (evicted.size) index.entries = index.entries.filter((item) => !evicted.has(item.proposalId))
      index.revision++
      if (!writeIndex(index)) {
        if (payloadInOpfs) {
          if (previousOpfs === null) await opfsRemove(opfsName)
          else await opfsWrite(opfsName, previousOpfs)
        } else try {
          if (previousFallback === null) window.localStorage.removeItem(fallbackKey)
          else window.localStorage.setItem(fallbackKey, previousFallback)
        } catch { /* caller still receives false; the old index remains authoritative */ }
        return false
      }
      for (const id of evicted) await removePayload(id)
      notify(); return true
    })
  },
  async load(proposalId: string): Promise<StoredProposalV1 | null> {
    if (typeof window === 'undefined') return null
    let raw: string | null = await opfsRead(opfsPayload(proposalId))
    if (!raw) try { raw = window.localStorage.getItem(payloadKey(proposalId)) } catch { return null }
    if (!raw) return null
    const decoded = await decodeStoredProposal(raw)
    if (decoded) return decoded
    // Preserve corrupt bytes for export/debugging and remove the broken index
    // entry. Returning [] here would falsely claim there was no proposal.
    try {
      window.localStorage.setItem(`${QUARANTINE_PREFIX}${Date.now()}.${proposalId}`, raw)
      window.localStorage.removeItem(payloadKey(proposalId))
      const index = readIndex() ?? emptyIndex()
      index.entries = index.entries.filter((item) => item.proposalId !== proposalId); index.revision++; writeIndex(index)
    } catch { /* quarantine best effort; never expose corrupt payload */ }
    await opfsRemove(opfsPayload(proposalId))
    notify(); return null
  },
  async acquireCommitLease(proposalId: string, owner: string, ttlMs = 30_000): Promise<boolean> {
    if (typeof window === 'undefined') return true
    const locks = lockManager()
    const lockName = `${COMMIT_LOCK_PREFIX}${proposalId}`
    if (locks) {
      return new Promise<boolean>((resolve) => {
        let settled = false
        const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
        void locks.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
          if (!lock) { finish(false); return }
          await new Promise<void>((release) => {
            heldCommitLocks.set(lockName, { owner, release })
            finish(true)
          })
        }).catch(() => finish(false))
      })
    }
    const key = `${PREFIX}lease.${proposalId}`; const now = Date.now()
    try {
      const existing = JSON.parse(window.localStorage.getItem(key) ?? 'null') as { owner?: string; expiresAt?: number } | null
      if (existing?.owner && existing.owner !== owner && (existing.expiresAt ?? 0) > now) return false
      window.localStorage.setItem(key, JSON.stringify({ owner, expiresAt: now + ttlMs }))
      const confirmed = JSON.parse(window.localStorage.getItem(key) ?? '{}') as { owner?: string }
      return confirmed.owner === owner
    } catch { return false }
  },
  releaseCommitLease(proposalId: string, owner: string): void {
    if (typeof window === 'undefined') return
    const lockName = `${COMMIT_LOCK_PREFIX}${proposalId}`
    const held = heldCommitLocks.get(lockName)
    if (held?.owner === owner) {
      heldCommitLocks.delete(lockName)
      held.release()
      return
    }
    try { const key = `${PREFIX}lease.${proposalId}`; const lease = JSON.parse(window.localStorage.getItem(key) ?? '{}') as { owner?: string }; if (lease.owner === owner) window.localStorage.removeItem(key) } catch { /* no-op */ }
  },
  listQuarantine(): Array<{ key: string; raw: string }> {
    if (typeof window === 'undefined') return []
    const result: Array<{ key: string; raw: string }> = []
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(QUARANTINE_PREFIX)) result.push({ key, raw: window.localStorage.getItem(key) ?? '' })
    }
    return result
  },
  clearQuarantine(key?: string): boolean {
    if (typeof window === 'undefined') return true
    try {
      if (key) { if (!key.startsWith(QUARANTINE_PREFIX)) return false; window.localStorage.removeItem(key) }
      else for (const entry of this.listQuarantine()) window.localStorage.removeItem(entry.key)
      notify(); return true
    } catch { return false }
  },
  exportQuarantine(): string {
    return JSON.stringify({ v: 1, entries: this.listQuarantine() })
  },
}
