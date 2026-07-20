import type { CardService } from '@cys-stift/domain'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import { AI_CARD_FIELDS } from '../ai-context'
import { isFullyInsideFrame } from '@/features/canvas/frame-membership'
import { createSourceRef, normalizeSourceText } from './source-ref'
import { applyWorkingSetBudget, DEFAULT_WORKING_SET_CHAR_BUDGET } from './working-set-budget'
import { buildWorkingSetRevisions, canonicalJson, sha256Hex } from './working-set-revision'
import type {
  ScopeKind,
  WorkingSetBuildResultV1,
  WorkingSetGeometryV1,
  WorkingSetRelationV1,
  WorkingSetRelationIssueV1,
  WorkingSetScopeV1,
  WorkingSetSourceRecordV1,
} from './working-set-types'

export interface WorkingSetScopeInput {
  kind: ScopeKind
  /** Required for frame and explicit-cards; selection comes from CanvasHost. */
  rootIds?: string[]
  /** Required only for an ephemeral paste scope. It is never persisted here. */
  paste?: string
}

export interface BuildWorkingSetOptions {
  host: CanvasHost
  service: CardService
  canvasId: string
  scope: WorkingSetScopeInput
  maxChars?: number
  now?: () => Date
}

function stableIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

function geometryOf(element: CanvasElement): WorkingSetGeometryV1 {
  return {
    id: element.id,
    kind: element.kind,
    x: Math.round(element.x),
    y: Math.round(element.y),
    w: Math.round(element.w),
    h: Math.round(element.h),
    rotation: Math.round(element.rotation ?? 0),
  }
}

function cardFieldText(service: CardService, id: string, field: 'title' | 'body'): string | null {
  const card = service.get(id as never)
  if (!card || card.deletedAt) return null
  // Reuse the existing allowlist instead of introducing a parallel AI privacy
  // table. Only the two text fields are admitted to source records.
  const definition = AI_CARD_FIELDS[field]
  if (!definition) return null
  const value = definition.include(card)
  return typeof value === 'string' ? normalizeSourceText(value) : null
}

function splitPasteBlocks(input: string): string[] {
  const lines = normalizeSourceText(input).split('\n')
  const blocks: string[] = []
  let current: string[] = []
  const flush = () => {
    const block = current.join('\n').trim()
    if (block) blocks.push(block)
    current = []
  }
  for (const line of lines) {
    // Markdown headings form stable block boundaries without trying to infer
    // Markdown semantics from a regex. Paragraph boundaries keep ordinary
    // pasted notes useful when they contain no headings.
    if (line.startsWith('#') && current.length > 0) flush()
    if (line.trim() === '') flush()
    else current.push(line)
  }
  flush()
  return blocks
}

function collectCardIds(elements: CanvasElement[], scope: WorkingSetScopeInput, host: CanvasHost): { ids: string[]; roots: string[]; frame?: CanvasElement } {
  switch (scope.kind) {
    case 'selection': {
      const roots = stableIds(host.getSelectedIds())
      return {
        roots,
        ids: stableIds(roots.filter((id) => elements.find((element) => element.id === id)?.kind === 'card')),
      }
    }
    case 'explicit-cards': {
      const roots = stableIds(scope.rootIds ?? [])
      return {
        roots,
        ids: stableIds(roots.filter((id) => elements.find((element) => element.id === id)?.kind === 'card')),
      }
    }
    case 'frame': {
      const frameId = stableIds(scope.rootIds ?? [])[0]
      const frame = elements.find((element) => element.id === frameId && element.kind === 'frame')
      if (!frame || !frameId) return { roots: frameId ? [frameId] : [], ids: [] }
      return {
        roots: [frameId],
        frame,
        ids: stableIds(elements.filter((element) => element.kind === 'card' && isFullyInsideFrame(element, frame)).map((element) => element.id)),
      }
    }
    case 'paste':
      return { roots: [], ids: [] }
  }
}

/**
 * Creates a bounded, deterministic read snapshot. It deliberately does not
 * produce a provider prompt: callers must expose the returned manifest before
 * sending the returned complete records.
 */
export async function buildWorkingSet(options: BuildWorkingSetOptions): Promise<WorkingSetBuildResultV1> {
  const { host, service, canvasId, scope } = options
  const elements = host.getElements()
  const scopeInfo = collectCardIds(elements, scope, host)
  const scopeValue: WorkingSetScopeV1 = { kind: scope.kind, rootIds: scopeInfo.roots }
  const records: WorkingSetSourceRecordV1[] = []
  const omitted = new Map<string, 'out-of-scope' | 'private'>()
  const geometryOnly = new Set<string>()

  if (scope.kind === 'paste') {
    for (const [index, text] of splitPasteBlocks(scope.paste ?? '').entries()) {
      const entityId = `paste:${index}`
      const ref = await createSourceRef('paste-block', entityId, 'paste', text, `/blocks/${index}`)
      records.push({ ref, text })
    }
  } else {
    const includedCards = new Set(scopeInfo.ids)
    for (const element of elements) {
      if (element.kind !== 'card') continue
      if (!includedCards.has(element.id)) omitted.set(element.id, 'out-of-scope')
    }
    for (const cardId of scopeInfo.ids) {
      const title = cardFieldText(service, cardId, 'title')
      const body = cardFieldText(service, cardId, 'body')
      if (title === null || body === null) {
        omitted.set(cardId, 'private')
        continue
      }
      let hasSource = false
      for (const [field, text] of [['title', title], ['body', body]] as const) {
        if (!text) continue
        const ref = await createSourceRef('card', cardId, field, text, `/${field}`)
        records.push({ ref, text })
        hasSource = true
      }
      if (!hasSource) geometryOnly.add(cardId)
    }
  }

  const includedCardIds = new Set(scopeInfo.ids.filter((id) => !omitted.has(id)))
  const relationRecords: Array<{ relation?: WorkingSetRelationV1; issue?: WorkingSetRelationIssueV1; record: WorkingSetSourceRecordV1 }> = []
  if (scope.kind !== 'paste') {
    const allElementIds = new Set(elements.map((element) => element.id))
    const relationKeys = new Map<string, string>()
    for (const element of elements) {
      if (element.kind !== 'arrow') continue
      const touchesScope = !!element.from && includedCardIds.has(element.from) || !!element.to && includedCardIds.has(element.to)
      if (!touchesScope) continue
      const bothInScope = !!element.from && !!element.to && includedCardIds.has(element.from) && includedCardIds.has(element.to)
      const missingEndpoint = !element.from || !element.to || (!!element.from && !allElementIds.has(element.from)) || (!!element.to && !allElementIds.has(element.to))
      if (!bothInScope && !missingEndpoint) continue
      const relationText = normalizeSourceText(element.text ?? '')
      const ref = await createSourceRef('canvas-element', element.id, 'relation', relationText, '/text')
      const record = { ref, text: relationText }
      if (missingEndpoint) {
        relationRecords.push({ issue: { arrowId: element.id, kind: 'missing-endpoint', ...(element.from ? { from: element.from } : {}), ...(element.to ? { to: element.to } : {}), refId: ref.refId }, record })
        continue
      }
      const relation: WorkingSetRelationV1 = { arrowId: element.id, from: element.from!, to: element.to!, ...(relationText ? { label: relationText } : {}), refId: ref.refId }
      const key = `${relation.from}\u0000${relation.to}\u0000${relation.label ?? ''}`
      const duplicateOf = relationKeys.get(key)
      relationKeys.set(key, duplicateOf ?? relation.arrowId)
      relationRecords.push({
        relation,
        ...(relation.from === relation.to
          ? { issue: { arrowId: relation.arrowId, kind: 'self-loop' as const, from: relation.from, to: relation.to, refId: ref.refId } }
          : duplicateOf
            ? { issue: { arrowId: relation.arrowId, kind: 'duplicate-relation' as const, from: relation.from, to: relation.to, duplicateOf, refId: ref.refId } }
            : {}),
        record,
      })
    }
  }
  records.push(...relationRecords.map(({ record }) => record))

  const budget = applyWorkingSetBudget(
    records.sort((a, b) => a.ref.refId.localeCompare(b.ref.refId)),
    options.maxChars ?? DEFAULT_WORKING_SET_CHAR_BUDGET,
  )
  const includedRefs = new Set(budget.records.map((record) => record.ref.refId))
  const relations = relationRecords
    .filter(({ relation }) => !!relation && includedRefs.has(relation.refId))
    .map(({ relation }) => relation!)
    .sort((a, b) => a.arrowId.localeCompare(b.arrowId))
  const relationIssues = relationRecords
    .filter(({ issue }) => !!issue && includedRefs.has(issue.refId))
    .map(({ issue }) => issue!)
    .sort((a, b) => a.arrowId.localeCompare(b.arrowId))

  const geometry = scope.kind === 'paste'
    ? []
    : elements
      .filter((element) =>
        includedCardIds.has(element.id) ||
        (element.kind === 'arrow' && !!element.from && !!element.to && includedCardIds.has(element.from) && includedCardIds.has(element.to)) ||
        (scopeInfo.frame?.id === element.id),
      )
      .map(geometryOf)
      .sort((a, b) => a.id.localeCompare(b.id))

  const revisions = await buildWorkingSetRevisions(
    budget.records
      .filter((record) => record.ref.sourceKind === 'card')
      .map((record) => ({ entityId: record.ref.entityId, field: record.ref.field, text: record.text })),
    [...relations, ...relationIssues],
    geometry,
  )
  const manifest = {
    ...budget.manifest,
    geometryOnlyEntityIds: stableIds(geometryOnly),
    omitted: [...budget.manifest.omitted, ...[...omitted.entries()].map(([entityId, reason]) => ({ entityId, reason }))]
      .sort((a, b) => `${a.entityId}:${a.reason}`.localeCompare(`${b.entityId}:${b.reason}`)),
  }
  const snapshotId = await sha256Hex(canonicalJson({ canvasId, scope: scopeValue, revisions, manifest }))
  return {
    records: budget.records,
    snapshot: {
      kind: 'cys-working-set',
      version: 1,
      snapshotId: `ws:${snapshotId}`,
      canvasId,
      scope: scopeValue,
      createdAt: (options.now?.() ?? new Date()).toISOString(),
      revisions,
      sources: budget.records.map((record) => record.ref),
      relations,
      relationIssues,
      geometry,
      manifest,
    },
  }
}
