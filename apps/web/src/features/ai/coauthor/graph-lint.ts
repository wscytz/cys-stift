import type { EvidenceEdgeV1, ProposalFindingV1 } from './proposal-contract'
import type { WorkingSetSnapshotV1 } from './working-set-types'

function evidence(refId: string): EvidenceEdgeV1[] { return [{ refId, role: 'targets' }] }

/** Deterministic, bounded graph checks. These are findings, not executable
 * proposals; AI may explain them but may not make them disappear. */
export function lintWorkingSetGraph(snapshot: WorkingSetSnapshotV1): ProposalFindingV1[] {
  const cardIds = new Set(snapshot.geometry.filter((item) => item.kind === 'card').map((item) => item.id))
  const edges = snapshot.relations.filter((edge) => cardIds.has(edge.from) && cardIds.has(edge.to))
  const byFrom = new Map<string, typeof edges>()
  const degree = new Map<string, number>()
  for (const edge of edges) {
    byFrom.set(edge.from, [...(byFrom.get(edge.from) ?? []), edge])
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
  }
  const findings: ProposalFindingV1[] = []
  for (const issue of snapshot.relationIssues) {
    const token = issue.refId.replace(/^src:/, '').slice(0, 16)
    if (issue.kind === 'missing-endpoint') {
      findings.push({
        findingId: `lint-dangling-${token}`, kind: 'dangling-relation', title: 'Dangling relation',
        explanation: `Relation ${issue.arrowId} references a missing endpoint and cannot be applied safely.`,
        evidence: evidence(issue.refId), uncertainty: 'low', proposalItemIds: [],
      })
    } else {
      findings.push({
        findingId: `lint-invariant-${token}`, kind: 'relation-invariant',
        title: issue.kind === 'self-loop' ? 'Self relation' : 'Duplicate relation',
        explanation: issue.kind === 'self-loop'
          ? `Relation ${issue.arrowId} points back to the same object.`
          : `Relation ${issue.arrowId} duplicates ${issue.duplicateOf}.`,
        evidence: evidence(issue.refId), uncertainty: 'low', proposalItemIds: [],
      })
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>()
  const walk = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      const edge = edges.find((entry) => entry.from === path[path.length - 1] && entry.to === id)
      if (edge) findings.push({ findingId: `lint-cycle-${edge.arrowId}`, kind: 'relation-cycle', title: 'Relation cycle', explanation: `Cycle detected through ${[...path, id].join(' -> ')}`, evidence: evidence(edge.refId), uncertainty: 'low', proposalItemIds: [] })
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const edge of byFrom.get(id) ?? []) walk(edge.to, [...path, id])
    visiting.delete(id); visited.add(id)
  }
  for (const id of cardIds) walk(id, [])
  for (const id of [...cardIds].sort()) if (!degree.has(id)) {
    const ref = snapshot.sources.find((source) => source.entityId === id)
    if (ref) findings.push({ findingId: `lint-orphan-${id}`, kind: 'orphan-step', title: 'Orphan step', explanation: 'This card has no in-scope relationship.', evidence: evidence(ref.refId), uncertainty: 'low', proposalItemIds: [] })
  }
  return findings
}
