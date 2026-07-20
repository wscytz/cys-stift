import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scoreProposalReplayCase, type ProposalReplayCaseV1 } from '../proposal-benchmark'
import { scoreProposalBaseline, type ProposalBaselineReplayV1 } from '../proposal-baseline'

async function heldOutCases(): Promise<ProposalReplayCaseV1[]> {
  const path = resolve(process.cwd(), '../../benchmarks/proposal-bundle-v1/held-out/plan-structure-held-out-v1.jsonl')
  const text = await readFile(path, 'utf8')
  return text.trim().split('\n').map((line) => JSON.parse(line) as ProposalReplayCaseV1)
}

async function baselineCases(): Promise<ProposalBaselineReplayV1[]> {
  const path = resolve(process.cwd(), '../../benchmarks/proposal-bundle-v1/baselines/review-protocol-baselines-v1.jsonl')
  const text = await readFile(path, 'utf8')
  return text.trim().split('\n').map((line) => JSON.parse(line) as ProposalBaselineReplayV1)
}

describe('Proposal Bundle held-out replay', () => {
  it('keeps the held-out corpus separate from prompt-development seed data', async () => {
    const cases = await heldOutCases()
    expect(cases.map((entry) => entry.id)).toEqual(['release-cycle', 'duplicate-verification', 'missing-rollback-precondition'])
  })

  it('replays each frozen response ten times against the same oracle', async () => {
    for (const fixture of await heldOutCases()) {
      const scores = await Promise.all(Array.from({ length: 10 }, () => scoreProposalReplayCase(fixture)))
      expect(new Set(scores.map((score) => JSON.stringify(score))).size, fixture.id).toBe(1)
      expect(scores[0], fixture.id).toMatchObject({
        valid: true,
        sourceRefsResolved: true,
        dependencyClosure: true,
        findingPrecision: 1,
        findingRecall: 1,
        forbiddenActionCount: 0,
        diagnostics: [],
      })
    }
  })

  it('keeps three reproducible review-protocol baselines per seed fixture', async () => {
    const cases = await baselineCases()
    expect(cases).toHaveLength(9)
    for (const fixtureId of ['launch-plan', 'migration-plan', 'research-plan']) {
      expect(cases.filter((entry) => entry.fixtureId === fixtureId).map((entry) => entry.approach).sort()).toEqual(['direct-mutation', 'flat-review', 'source-linked-review'])
    }
    const scores = cases.map(scoreProposalBaseline)
    for (const score of scores.filter((entry) => entry.approach === 'source-linked-review')) {
      expect(score).toMatchObject({ precision: 1, recall: 1, sourceResolutionRate: 1, dependencyClosed: true, outOfScopeMutations: [], failureReasons: [] })
    }
    expect(scores.some((score) => score.approach === 'direct-mutation' && score.outOfScopeMutations.length > 0)).toBe(true)
  })
})
