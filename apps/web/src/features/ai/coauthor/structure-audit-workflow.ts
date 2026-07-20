import type { AIConfig } from '../types'
import { streamText } from '../stream-text'
import { canonicalJson, sha256Hex } from './working-set-revision'
import type { ProposalEnvelopeV1, ProposalPayloadV1 } from './proposal-contract'
import type { WorkingSetBuildResultV1 } from './working-set-types'
import { runStructureAudit, type AuditRunResult } from './run-structure-audit'
import { PROPOSAL_PAYLOAD_SCHEMA_V1 } from './proposal-schema'

function proposalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `proposal:${crypto.randomUUID()}`
  return `proposal:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function persistedSourceRefs(workingSet: WorkingSetBuildResultV1): ProposalEnvelopeV1['sourceRefs'] {
  return workingSet.snapshot.sources.map((ref) => ({
    ...ref,
    selector: {
      ...(ref.selector.path ? { path: ref.selector.path } : {}),
      ...(ref.selector.start !== undefined ? { start: ref.selector.start } : {}),
      ...(ref.selector.end !== undefined ? { end: ref.selector.end } : {}),
      exact: '',
      excerptHash: ref.selector.excerptHash,
    },
  }))
}

/** Runs a bounded audit using the existing provider surface. The correction is
 * deliberately appended as a separate instruction, never interpolated into a
 * source record, so untrusted card content cannot alter the retry contract. */
export async function generateStructureAudit(
  workingSet: WorkingSetBuildResultV1,
  config: AIConfig,
  signal: AbortSignal,
): Promise<AuditRunResult> {
  return runStructureAudit(workingSet, ({ system, user, correction }) =>
    streamText(
      config,
      {
        system,
        user: correction ? `${user}\n\nVALIDATION CORRECTION (follow this, return JSON only):\n${correction}` : user,
        structuredOutput: true,
        responseSchema: { name: 'cys_proposal_payload_v1', schema: PROPOSAL_PAYLOAD_SCHEMA_V1 as unknown as Record<string, unknown>, strict: false },
        maxTokens: 4096,
        temperature: 0.2,
        timeoutMs: 60_000,
      },
      () => {},
      signal,
    ),
  { signal })
}

export async function createProposalEnvelope(
  workingSet: WorkingSetBuildResultV1,
  payload: ProposalPayloadV1,
  config: AIConfig,
  run: Extract<AuditRunResult, { ok: true }>,
): Promise<ProposalEnvelopeV1> {
  return {
    kind: 'cys-proposal-envelope',
    version: 1,
    proposalId: proposalId(),
    createdAt: workingSet.snapshot.createdAt,
    snapshotId: workingSet.snapshot.snapshotId,
    canvasId: workingSet.snapshot.canvasId,
    baseRevisions: workingSet.snapshot.revisions,
    sourceRefs: persistedSourceRefs(workingSet),
    promptVersion: run.promptVersion,
    schemaVersion: 1,
    provider: {
      id: config.provider,
      model: config.model,
    },
    payloadHash: await sha256Hex(canonicalJson(payload)),
    payload,
  }
}
