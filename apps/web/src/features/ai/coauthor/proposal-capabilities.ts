import type { ProposalFindingKind, ProposalItemV1 } from './proposal-contract'

export type ProposalCapability = 'diagnose-only' | 'previewable' | 'executable' | 'deferred'

const FINDING_CAPABILITIES: Record<ProposalFindingKind, ProposalCapability> = {
  'relation-cycle': 'diagnose-only',
  'orphan-step': 'diagnose-only',
  'duplicate-step': 'diagnose-only',
  'missing-precondition': 'diagnose-only',
  'unclear-owner-or-output': 'diagnose-only',
  'suspicious-block-direction': 'diagnose-only',
  'dangling-relation': 'diagnose-only',
  'relation-invariant': 'diagnose-only',
}

export function findingCapability(kind: ProposalFindingKind): ProposalCapability {
  return FINDING_CAPABILITIES[kind]
}

export function itemCapability(item: ProposalItemV1): ProposalCapability {
  if (item.lane === 'layout') return 'previewable'
  if (item.lane === 'idea') return 'deferred'
  switch (item.action.type) {
    case 'relation.add':
    case 'relation.remove':
    case 'relation.reverse':
      return 'executable'
  }
}
