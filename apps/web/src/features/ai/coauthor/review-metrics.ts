'use client'

import type { ProposalLane } from './proposal-contract'

const KEY = 'cys-stift.proposal-review-metrics.v1'
const CAP = 500
export type ReviewMetricEvent =
  | { type: 'review-opened' | 'scope-confirmed' | 'scope-cancelled' | 'previewed' | 'applied' | 'undone'; proposalId?: string }
  | { type: 'lane-viewed'; proposalId: string; lane: ProposalLane }
  | { type: 'decision'; proposalId: string; lane: ProposalLane; decision: 'accepted' | 'rejected' }
  | { type: 'source-located'; proposalId: string; lane?: ProposalLane }
  | { type: 'dependency-prompted'; proposalId: string; itemId: string; requiredCount: number }
  | { type: 'scope-reopened'; proposalId: string }
  | { type: 'review-duration'; proposalId: string; durationMs: number; outcome: 'applied' | 'closed' }

function safeEvent(event: ReviewMetricEvent): ReviewMetricEvent {
  switch (event.type) {
    case 'lane-viewed': return { type: event.type, proposalId: event.proposalId, lane: event.lane }
    case 'decision': return { type: event.type, proposalId: event.proposalId, lane: event.lane, decision: event.decision }
    case 'source-located': return { type: event.type, proposalId: event.proposalId, ...(event.lane ? { lane: event.lane } : {}) }
    case 'dependency-prompted': return { type: event.type, proposalId: event.proposalId, itemId: event.itemId, requiredCount: Math.max(0, Math.floor(event.requiredCount)) }
    case 'scope-reopened': return { type: event.type, proposalId: event.proposalId }
    case 'review-duration': return { type: event.type, proposalId: event.proposalId, durationMs: Math.max(0, Math.floor(event.durationMs)), outcome: event.outcome }
    default: return { type: event.type, ...(event.proposalId ? { proposalId: event.proposalId } : {}) }
  }
}

export function recordReviewMetric(event: ReviewMetricEvent): void {
  if (typeof window === 'undefined') return
  try {
    const current = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown[]
    const next = [...(Array.isArray(current) ? current : []), { ...safeEvent(event), at: Date.now() }].slice(-CAP)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* metrics never block the user workflow */ }
}

export function exportReviewMetrics(): string {
  if (typeof window === 'undefined') return '[]'
  try { return window.localStorage.getItem(KEY) ?? '[]' } catch { return '[]' }
}
