export type ProposalBaselineApproach = 'direct-mutation' | 'flat-review' | 'source-linked-review'

export interface ProposalBaselineReplayV1 {
  v: 1
  fixtureId: string
  approach: ProposalBaselineApproach
  oracleFindingIds: string[]
  predictedFindingIds: string[]
  sourceLinkedFindingIds: string[]
  items: Array<{ itemId: string; dependsOn: string[] }>
  acceptedItemIds: string[]
  scopeIds: string[]
  mutationIds: string[]
  reviewSteps: number
  failureReasons: string[]
}

export interface ProposalBaselineScoreV1 {
  fixtureId: string
  approach: ProposalBaselineApproach
  precision: number
  recall: number
  sourceResolutionRate: number
  dependencyClosed: boolean
  outOfScopeMutations: string[]
  reviewSteps: number
  failureReasons: string[]
}

export function scoreProposalBaseline(input: ProposalBaselineReplayV1): ProposalBaselineScoreV1 {
  const oracle = new Set(input.oracleFindingIds)
  const predicted = new Set(input.predictedFindingIds)
  const truePositives = [...predicted].filter((id) => oracle.has(id)).length
  const accepted = new Set(input.acceptedItemIds)
  const dependencyClosed = input.items
    .filter((item) => accepted.has(item.itemId))
    .every((item) => item.dependsOn.every((dependency) => accepted.has(dependency)))
  const scope = new Set(input.scopeIds)
  return {
    fixtureId: input.fixtureId,
    approach: input.approach,
    precision: predicted.size === 0 ? 0 : truePositives / predicted.size,
    recall: oracle.size === 0 ? 1 : truePositives / oracle.size,
    sourceResolutionRate: predicted.size === 0 ? 0 : input.sourceLinkedFindingIds.filter((id) => predicted.has(id)).length / predicted.size,
    dependencyClosed,
    outOfScopeMutations: input.mutationIds.filter((id) => !scope.has(id)),
    reviewSteps: input.reviewSteps,
    failureReasons: [...input.failureReasons],
  }
}
