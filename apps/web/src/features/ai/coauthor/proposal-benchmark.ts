import { compileCompositePlan } from './composite-plan'
import type { ProposalFindingKind, ProposalItemV1, ProposalPayloadV1, ProposalReviewRecordV1 } from './proposal-contract'
import { decodeProposalJson } from './proposal-decoder'
import { canonicalJson, sha256Hex } from './working-set-revision'

export interface ProposalReplayCaseV1 {
  v: 1
  id: string
  context: {
    sourceRefIds: string[]
    elementIds: string[]
    arrowIds: string[]
    baseRevision: string
  }
  oracle: {
    requiredFindingKinds: ProposalFindingKind[]
    allowedFindingKinds: ProposalFindingKind[]
    forbiddenActionTypes: string[]
    acceptedItemIds: string[]
  }
  replay: ProposalPayloadV1
}

export interface ProposalReplayScoreV1 {
  id: string
  valid: boolean
  sourceRefsResolved: boolean
  dependencyClosure: boolean
  findingPrecision: number
  findingRecall: number
  forbiddenActionCount: number
  replayDigest: string
  diagnostics: string[]
}

function semanticActionType(item: ProposalItemV1): string | null {
  return item.lane === 'semantic' ? item.action.type : null
}

/** Scores a frozen response against a human-authored oracle. This is an
 * internal regression/replay metric, never a substitute for provider or user
 * validation. */
export async function scoreProposalReplayCase(input: ProposalReplayCaseV1): Promise<ProposalReplayScoreV1> {
  const decoded = decodeProposalJson(JSON.stringify(input.replay), {
    sourceRefIds: new Set(input.context.sourceRefIds),
    elementIds: new Set(input.context.elementIds),
    arrowIds: new Set(input.context.arrowIds),
    baseRevision: input.context.baseRevision,
  })
  const replayDigest = await sha256Hex(canonicalJson(input.replay))
  if (!decoded.ok) {
    return {
      id: input.id, valid: false, sourceRefsResolved: false, dependencyClosure: false,
      findingPrecision: 0, findingRecall: 0, forbiddenActionCount: 0, replayDigest,
      diagnostics: decoded.diagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.path}`),
    }
  }

  const foundKinds = decoded.value.findings.map((finding) => finding.kind)
  const allowed = new Set(input.oracle.allowedFindingKinds)
  const required = new Set(input.oracle.requiredFindingKinds)
  const truePositiveCount = foundKinds.filter((kind) => allowed.has(kind)).length
  const recalledCount = [...required].filter((kind) => foundKinds.includes(kind)).length
  const forbidden = new Set(input.oracle.forbiddenActionTypes)
  const forbiddenActionCount = decoded.value.items
    .map(semanticActionType)
    .filter((type): type is string => type !== null && forbidden.has(type)).length
  const accepted = new Set(input.oracle.acceptedItemIds)
  const review: ProposalReviewRecordV1 = {
    proposalId: `benchmark:${input.id}`,
    decisions: Object.fromEntries(decoded.value.items.map((item) => [item.itemId, accepted.has(item.itemId) ? 'accepted' : 'rejected'])),
    execution: {},
    staleCauses: [],
  }
  const composite = await compileCompositePlan(`benchmark:${input.id}`, decoded.value, review, { allowDeferred: true })

  return {
    id: input.id,
    valid: true,
    sourceRefsResolved: true,
    dependencyClosure: composite.ok,
    findingPrecision: foundKinds.length === 0 ? (allowed.size === 0 ? 1 : 0) : truePositiveCount / foundKinds.length,
    findingRecall: required.size === 0 ? 1 : recalledCount / required.size,
    forbiddenActionCount,
    replayDigest,
    diagnostics: composite.ok ? [] : [`${composite.code}:${composite.itemIds.join(',')}`],
  }
}
