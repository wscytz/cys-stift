import type { AIResponse } from '../types'
import { lintWorkingSetGraph } from './graph-lint'
import { decodeProposalJson } from './proposal-decoder'
import { buildStructureAuditPrompt, STRUCTURE_AUDIT_SYSTEM, STRUCTURE_AUDIT_PROMPT_VERSION } from './structure-audit-prompt'
import { retryStructured, type StructuredFailure } from './structured-retry'
import type { ProposalFindingV1, ProposalPayloadV1 } from './proposal-contract'
import { validateProposalPayload, type ProposalValidationContext } from './proposal-validation'
import type { WorkingSetBuildResultV1 } from './working-set-types'

export type AuditRunResult =
  | { ok: true; payload: ProposalPayloadV1; lintCount: number; attempts: number; promptVersion: string }
  | { ok: false; failure: StructuredFailure; attempts: number; lintCount: number }

function evidenceKey(finding: ProposalFindingV1): string {
  return `${finding.kind}:${finding.evidence.map((edge) => `${edge.refId}:${edge.role}`).sort().join('|')}`
}

/** Local lint is system-owned evidence. A provider may explain it and attach
 * actions, but cannot omit or overwrite it. */
export function mergeDeterministicFindings(payload: ProposalPayloadV1, lint: ProposalFindingV1[]): ProposalPayloadV1 {
  const provider = [...payload.findings]
  const findingIdMap = new Map<string, string>()
  const mergedLint = lint.map((local) => {
    const index = provider.findIndex((candidate) => evidenceKey(candidate) === evidenceKey(local))
    if (index < 0) return local
    const matched = provider.splice(index, 1)[0]!
    findingIdMap.set(matched.findingId, local.findingId)
    return { ...local, proposalItemIds: [...new Set([...local.proposalItemIds, ...matched.proposalItemIds])] }
  })
  return {
    ...payload,
    findings: [...mergedLint, ...provider],
    items: payload.items.map((item) => item.findingId && findingIdMap.has(item.findingId)
      ? { ...item, findingId: findingIdMap.get(item.findingId)! }
      : item),
  }
}

export async function runStructureAudit(
  workingSet: WorkingSetBuildResultV1,
  generate: (request: { system: string; user: string; correction?: string }) => Promise<AIResponse>,
  options?: { signal?: AbortSignal },
): Promise<AuditRunResult> {
  const lint = lintWorkingSetGraph(workingSet.snapshot)
  const prompt = buildStructureAuditPrompt(workingSet, lint)
  const context: ProposalValidationContext = {
    sourceRefIds: new Set(workingSet.snapshot.sources.map((source) => source.refId)),
    elementIds: new Set(workingSet.snapshot.geometry.map((element) => element.id)),
    arrowIds: new Set(workingSet.snapshot.relations.map((relation) => relation.arrowId)),
    baseRevision: workingSet.snapshot.revisions.geometry,
  }
  const retried = await retryStructured(
    async (correction) => {
      const response = await generate({ system: STRUCTURE_AUDIT_SYSTEM, user: prompt, correction })
      return { content: response.content, finishReason: response.finishReason, refusal: response.refusal }
    },
    (text) => {
      const decoded = decodeProposalJson(text, context)
      return decoded.ok ? { ok: true as const, value: decoded.value } : { ok: false as const, errors: decoded.diagnostics.slice(0, 8).map((diagnostic) => diagnostic.path) }
    },
    { signal: options?.signal },
  )
  if (!retried.ok) return { ok: false, failure: retried.failure, attempts: retried.attempts, lintCount: lint.length }
  const merged = mergeDeterministicFindings(retried.value, lint)
  const validated = validateProposalPayload(merged, context)
  return validated.ok
    ? { ok: true, payload: validated.value, lintCount: lint.length, attempts: retried.attempts, promptVersion: STRUCTURE_AUDIT_PROMPT_VERSION }
    : { ok: false, failure: 'invalid', attempts: retried.attempts, lintCount: lint.length }
}
