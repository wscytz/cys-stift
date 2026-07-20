import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportReviewMetrics, recordReviewMetric } from '../review-metrics'

describe('local proposal review metrics', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

  it('records bounded workflow metadata without accepting source text fields', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    recordReviewMetric({ type: 'dependency-prompted', proposalId: 'proposal:1', itemId: 'item:1', requiredCount: 2, body: 'private source' } as never)
    recordReviewMetric({ type: 'review-duration', proposalId: 'proposal:1', durationMs: 42.9, outcome: 'applied', sourceText: 'private source' } as never)
    const exported = exportReviewMetrics()
    expect(exported).not.toContain('private source')
    expect(JSON.parse(exported)).toEqual([
      { type: 'dependency-prompted', proposalId: 'proposal:1', itemId: 'item:1', requiredCount: 2, at: 123 },
      { type: 'review-duration', proposalId: 'proposal:1', durationMs: 42, outcome: 'applied', at: 123 },
    ])
  })

  it('caps local history to the latest 500 events', () => {
    for (let index = 0; index < 510; index++) recordReviewMetric({ type: 'scope-confirmed', proposalId: `proposal:${index}` })
    const events = JSON.parse(exportReviewMetrics())
    expect(events).toHaveLength(500)
    expect(events[0].proposalId).toBe('proposal:10')
  })
})
