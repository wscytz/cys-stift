import { validateIntent } from '../intent-validation'
import type { IntentIR } from '../intent-ir'
import {
  PROPOSAL_CAPS,
  PROPOSAL_PAYLOAD_VERSION,
  type EvidenceEdgeV1,
  type ProposalItemV1,
  type ProposalPayloadV1,
} from './proposal-contract'

const ID_RE = /^[A-Za-z0-9_.:~-]+$/
const FINDING_KINDS = new Set(['relation-cycle', 'orphan-step', 'duplicate-step', 'missing-precondition', 'unclear-owner-or-output', 'suspicious-block-direction', 'dangling-relation', 'relation-invariant'])
const EVIDENCE_ROLES = new Set(['supports', 'contradicts', 'targets', 'inspired-by'])

export interface ProposalDiagnostic {
  code: string
  message: string
  path: string
}

export interface ProposalValidationContext {
  sourceRefIds: ReadonlySet<string>
  elementIds: ReadonlySet<string>
  arrowIds: ReadonlySet<string>
  baseRevision: string
}

export type ProposalValidationResult =
  | { ok: true; value: ProposalPayloadV1; diagnostics: [] }
  | { ok: false; diagnostics: ProposalDiagnostic[] }

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function add(out: ProposalDiagnostic[], code: string, message: string, path: string): void {
  out.push({ code, message, path })
}

function nestingDepth(value: unknown, depth = 0, seen = new WeakSet<object>()): number {
  if (value === null || typeof value !== 'object') return depth
  if (seen.has(value)) return PROPOSAL_CAPS.nestingDepth + 1
  seen.add(value)
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)
  return children.reduce((max, child) => Math.max(max, nestingDepth(child, depth + 1, seen)), depth)
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, out: ProposalDiagnostic[]): void {
  for (const key of Object.keys(value).sort()) if (!allowed.includes(key)) add(out, 'UNKNOWN_FIELD', `Unknown field ${key}`, `${path}.${key}`)
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 && ID_RE.test(value)
}

function validateId(value: unknown, path: string, out: ProposalDiagnostic[]): value is string {
  if (!validId(value)) add(out, 'INVALID_ID', 'Expected a bounded stable ID', path)
  return validId(value)
}

function validateText(value: unknown, path: string, out: ProposalDiagnostic[], max: number = PROPOSAL_CAPS.text): value is string {
  if (typeof value !== 'string' || value.length > max) add(out, 'INVALID_TEXT', `Expected text up to ${max} characters`, path)
  return typeof value === 'string' && value.length <= max
}

function validateStringArray(value: unknown, path: string, out: ProposalDiagnostic[], max: number): string[] {
  if (!Array.isArray(value) || value.length > max) {
    add(out, 'INVALID_ARRAY', `Expected an array up to ${max} items`, path)
    return []
  }
  const seen = new Set<string>()
  value.forEach((entry, index) => {
    if (!validateId(entry, `${path}[${index}]`, out)) return
    if (seen.has(entry)) add(out, 'DUPLICATE_ID', `Duplicate ID ${entry}`, `${path}[${index}]`)
    seen.add(entry)
  })
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function validateEvidence(value: unknown, path: string, context: ProposalValidationContext, out: ProposalDiagnostic[]): EvidenceEdgeV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PROPOSAL_CAPS.refsPerItem) {
    add(out, 'INVALID_EVIDENCE', `Expected 1-${PROPOSAL_CAPS.refsPerItem} evidence refs`, path)
    return []
  }
  const seen = new Set<string>()
  value.forEach((edge, index) => {
    const edgePath = `${path}[${index}]`
    if (!object(edge)) return add(out, 'INVALID_EVIDENCE', 'Evidence must be an object', edgePath)
    unknownKeys(edge, ['refId', 'role'], edgePath, out)
    if (!validateId(edge.refId, `${edgePath}.refId`, out)) return
    if (!context.sourceRefIds.has(edge.refId)) add(out, 'UNKNOWN_SOURCE_REF', `Unknown source ref ${edge.refId}`, `${edgePath}.refId`)
    if (typeof edge.role !== 'string' || !EVIDENCE_ROLES.has(edge.role)) add(out, 'INVALID_EVIDENCE_ROLE', 'Invalid evidence role', `${edgePath}.role`)
    const key = `${edge.refId}:${String(edge.role)}`
    if (seen.has(key)) add(out, 'DUPLICATE_EVIDENCE', `Duplicate evidence ${key}`, edgePath)
    seen.add(key)
  })
  return value as EvidenceEdgeV1[]
}

function validateAction(value: unknown, path: string, context: ProposalValidationContext, out: ProposalDiagnostic[]): void {
  if (!object(value) || typeof value.type !== 'string') return add(out, 'INVALID_ACTION', 'Action must have a type', path)
  switch (value.type) {
    case 'relation.add':
      unknownKeys(value, ['type', 'from', 'to', 'relation', 'label'], path, out)
      for (const key of ['from', 'to'] as const) {
        if (validateId(value[key], `${path}.${key}`, out) && !context.elementIds.has(value[key] as string)) add(out, 'UNKNOWN_TARGET', `Unknown canvas element ${value[key]}`, `${path}.${key}`)
      }
      if (value.relation !== 'blocks' && value.relation !== 'related-to') add(out, 'INVALID_RELATION', 'Only blocks and related-to are executable', `${path}.relation`)
      if (value.label !== undefined) validateText(value.label, `${path}.label`, out, 200)
      break
    case 'relation.remove':
    case 'relation.reverse':
      unknownKeys(value, ['type', 'arrowId'], path, out)
      if (validateId(value.arrowId, `${path}.arrowId`, out) && !context.arrowIds.has(value.arrowId)) add(out, 'UNKNOWN_ARROW', `Unknown arrow ${value.arrowId}`, `${path}.arrowId`)
      break
    default:
      add(out, 'UNKNOWN_ACTION', `Unsupported action ${value.type}`, `${path}.type`)
  }
}

function validateLayoutIntent(value: unknown, path: string, context: ProposalValidationContext, out: ProposalDiagnostic[]): void {
  if (!object(value)) return add(out, 'INVALID_LAYOUT_INTENT', 'Layout intent must be an object', path)
  unknownKeys(value, ['mode', 'ops'], path, out)
  if (value.mode !== 'layout') add(out, 'INVALID_LAYOUT_MODE', 'Layout lane requires mode=layout', `${path}.mode`)
  if (Array.isArray(value.ops)) value.ops.forEach((op, index) => {
    if (!object(op) || !['layout', 'place', 'align', 'distribute', 'pin'].includes(String(op.op))) {
      add(out, 'INVALID_LAYOUT_OP', 'Layout lane accepts only layout/place/align/distribute/pin', `${path}.ops[${index}].op`)
    }
  })
  const candidate: IntentIR = {
    kind: 'cys-intent', version: 1, baseRevision: context.baseRevision,
    mode: value.mode as IntentIR['mode'], ops: value.ops as IntentIR['ops'],
  }
  const result = validateIntent(candidate)
  if (!result.ok) for (const diagnostic of result.diagnostics) add(out, `INTENT_${diagnostic.code}`, diagnostic.message, `${path}${diagnostic.path?.replace('$', '') ?? ''}`)
}

function detectCycle(items: Map<string, ProposalItemV1>, out: ProposalDiagnostic[]): void {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visited.has(id)) return
    if (visiting.has(id)) return add(out, 'DEPENDENCY_CYCLE', `Dependency cycle includes ${id}`, '$.items')
    visiting.add(id)
    for (const dependency of items.get(id)?.dependsOn ?? []) if (items.has(dependency)) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of items.keys()) visit(id)
}

export function validateProposalPayload(input: unknown, context: ProposalValidationContext): ProposalValidationResult {
  const diagnostics: ProposalDiagnostic[] = []
  if (!object(input)) return { ok: false, diagnostics: [{ code: 'INVALID_PAYLOAD', message: 'Payload must be an object', path: '$' }] }
  let serialized = ''
  try { serialized = JSON.stringify(input) } catch { add(diagnostics, 'INVALID_PAYLOAD', 'Payload must be JSON serializable', '$') }
  if (serialized.length > PROPOSAL_CAPS.totalBytes) add(diagnostics, 'PAYLOAD_TOO_LARGE', 'Payload exceeds byte cap', '$')
  if (nestingDepth(input) > PROPOSAL_CAPS.nestingDepth) add(diagnostics, 'PAYLOAD_TOO_DEEP', `Payload exceeds nesting depth ${PROPOSAL_CAPS.nestingDepth}`, '$')
  unknownKeys(input, ['kind', 'version', 'task', 'summary', 'findings', 'items'], '$', diagnostics)
  if (input.kind !== 'cys-proposal-payload') add(diagnostics, 'INVALID_KIND', 'Expected cys-proposal-payload', '$.kind')
  if (input.version !== PROPOSAL_PAYLOAD_VERSION) add(diagnostics, 'INVALID_VERSION', 'Expected payload version 1', '$.version')
  if (input.task !== 'plan-structure-audit') add(diagnostics, 'INVALID_TASK', 'Expected plan-structure-audit', '$.task')
  validateText(input.summary, '$.summary', diagnostics, PROPOSAL_CAPS.summary)
  if (!Array.isArray(input.findings) || input.findings.length > PROPOSAL_CAPS.findings) add(diagnostics, 'INVALID_FINDINGS', 'Too many findings', '$.findings')
  if (!Array.isArray(input.items) || input.items.length > PROPOSAL_CAPS.items) add(diagnostics, 'INVALID_ITEMS', 'Too many items', '$.items')
  if (!Array.isArray(input.findings) || !Array.isArray(input.items)) return { ok: false, diagnostics }

  const findingIds = new Set<string>()
  input.findings.forEach((finding, index) => {
    const path = `$.findings[${index}]`
    if (!object(finding)) return add(diagnostics, 'INVALID_FINDING', 'Finding must be an object', path)
    unknownKeys(finding, ['findingId', 'kind', 'title', 'explanation', 'evidence', 'uncertainty', 'proposalItemIds'], path, diagnostics)
    if (validateId(finding.findingId, `${path}.findingId`, diagnostics)) {
      if (findingIds.has(finding.findingId)) add(diagnostics, 'DUPLICATE_FINDING_ID', `Duplicate finding ${finding.findingId}`, `${path}.findingId`)
      findingIds.add(finding.findingId)
    }
    if (typeof finding.kind !== 'string' || !FINDING_KINDS.has(finding.kind)) add(diagnostics, 'INVALID_FINDING_KIND', 'Unknown finding kind', `${path}.kind`)
    validateText(finding.title, `${path}.title`, diagnostics)
    validateText(finding.explanation, `${path}.explanation`, diagnostics)
    validateEvidence(finding.evidence, `${path}.evidence`, context, diagnostics)
    if (finding.uncertainty !== 'low' && finding.uncertainty !== 'medium' && finding.uncertainty !== 'high') add(diagnostics, 'INVALID_UNCERTAINTY', 'Invalid uncertainty', `${path}.uncertainty`)
    validateStringArray(finding.proposalItemIds, `${path}.proposalItemIds`, diagnostics, PROPOSAL_CAPS.items)
  })

  const items = new Map<string, ProposalItemV1>()
  input.items.forEach((item, index) => {
    const path = `$.items[${index}]`
    if (!object(item)) return add(diagnostics, 'INVALID_ITEM', 'Item must be an object', path)
    const base = ['itemId', 'lane', 'findingId', 'evidence', 'dependsOn', 'conflictsWith', 'atomicGroupId', 'reason']
    const lane = item.lane
    unknownKeys(item, lane === 'semantic' ? [...base, 'action'] : lane === 'idea' ? [...base, 'candidate'] : lane === 'layout' ? [...base, 'intent'] : base, path, diagnostics)
    if (!validateId(item.itemId, `${path}.itemId`, diagnostics)) return
    if (items.has(item.itemId)) add(diagnostics, 'DUPLICATE_ITEM_ID', `Duplicate item ${item.itemId}`, `${path}.itemId`)
    if (lane !== 'semantic' && lane !== 'idea' && lane !== 'layout') add(diagnostics, 'INVALID_LANE', 'Invalid proposal lane', `${path}.lane`)
    if (item.findingId !== undefined && (!validateId(item.findingId, `${path}.findingId`, diagnostics) || !findingIds.has(item.findingId))) add(diagnostics, 'UNKNOWN_FINDING', `Unknown finding ${item.findingId}`, `${path}.findingId`)
    validateEvidence(item.evidence, `${path}.evidence`, context, diagnostics)
    validateStringArray(item.dependsOn, `${path}.dependsOn`, diagnostics, PROPOSAL_CAPS.dependenciesPerItem)
    validateStringArray(item.conflictsWith, `${path}.conflictsWith`, diagnostics, PROPOSAL_CAPS.conflictsPerItem)
    if (item.atomicGroupId !== undefined) validateId(item.atomicGroupId, `${path}.atomicGroupId`, diagnostics)
    validateText(item.reason, `${path}.reason`, diagnostics)
    if (lane === 'semantic') validateAction(item.action, `${path}.action`, context, diagnostics)
    if (lane === 'idea') {
      if (!object(item.candidate)) add(diagnostics, 'INVALID_CANDIDATE', 'Idea candidate must be an object', `${path}.candidate`)
      else {
        unknownKeys(item.candidate, ['title', 'body', 'promptedByRefIds'], `${path}.candidate`, diagnostics)
        validateText(item.candidate.title, `${path}.candidate.title`, diagnostics)
        if (item.candidate.body !== undefined) validateText(item.candidate.body, `${path}.candidate.body`, diagnostics)
        for (const refId of validateStringArray(item.candidate.promptedByRefIds, `${path}.candidate.promptedByRefIds`, diagnostics, PROPOSAL_CAPS.refsPerItem)) if (!context.sourceRefIds.has(refId)) add(diagnostics, 'UNKNOWN_SOURCE_REF', `Unknown source ref ${refId}`, `${path}.candidate.promptedByRefIds`)
      }
    }
    if (lane === 'layout') validateLayoutIntent(item.intent, `${path}.intent`, context, diagnostics)
    items.set(item.itemId, item as unknown as ProposalItemV1)
  })

  for (const [id, item] of items) {
    for (const dependency of item.dependsOn) {
      if (dependency === id) add(diagnostics, 'SELF_DEPENDENCY', 'An item cannot depend on itself', `$.items.${id}.dependsOn`)
      else if (!items.has(dependency)) add(diagnostics, 'UNKNOWN_DEPENDENCY', `Unknown dependency ${dependency}`, `$.items.${id}.dependsOn`)
    }
    for (const conflict of item.conflictsWith) {
      if (conflict === id) add(diagnostics, 'SELF_CONFLICT', 'An item cannot conflict with itself', `$.items.${id}.conflictsWith`)
      else if (!items.has(conflict) || !items.get(conflict)?.conflictsWith.includes(id)) add(diagnostics, 'ASYMMETRIC_CONFLICT', `Conflict ${conflict} must be symmetric`, `$.items.${id}.conflictsWith`)
    }
  }
  detectCycle(items, diagnostics)
  const itemIds = new Set(items.keys())
  input.findings.forEach((finding, index) => {
    if (!object(finding) || !Array.isArray(finding.proposalItemIds)) return
    for (const itemId of finding.proposalItemIds) if (typeof itemId !== 'string' || !itemIds.has(itemId)) add(diagnostics, 'UNKNOWN_ITEM', `Unknown proposal item ${String(itemId)}`, `$.findings[${index}].proposalItemIds`)
  })
  if (diagnostics.length) return { ok: false, diagnostics }
  return { ok: true, value: structuredClone(input) as unknown as ProposalPayloadV1, diagnostics: [] }
}
