'use client'

import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import type { DslArrowOp, DslCardOp, DslFreeOp, DslOp } from '@cys-stift/dsl'
import { sanitizeDslOps } from '@cys-stift/dsl'
import type { SanitizeCtx, SanitizeDiagnostic } from '@cys-stift/dsl'
import { solveRelational } from '../ai/relational-solver'
import type { ExistingGeom } from '../ai/relational-solver'

function uid(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}-${rand}`
}

export interface CardCreateParams {
  cardId: string
  x: number
  y: number
  w: number
  h: number
  color?: string
  /** v5:卡片标题(DSL @title)。建卡时写入 Card.title。 */
  title?: string
  /** v5:卡片正文(DSL @content)。建卡时写入 Card.body。 */
  content?: string
}

/** v5:更新现有卡片内容(DSL @title/@content on an existing card)。apply 时写回 Card.title/body。 */
export interface CardUpdateContent {
  cardId: string
  title?: string
  content?: string
}

export type CardUpdateHandler = (params: CardUpdateContent) => void

export type CardCreateResult =
  | { ok: true }
  | { ok: false; reason: string }

export type CardCreateHandler = (
  params: CardCreateParams,
) => CardCreateResult | void

export type ApplyOpStatus = 'applied' | 'skipped' | 'failed'

export interface ApplyOpResult {
  opIndex: number
  op: DslOp
  status: ApplyOpStatus
  reason?: string
}

type PlannedMutation = 'card-create' | 'card-update' | 'freeform'

export interface ApplyPlanItem {
  opIndex: number
  op: DslOp
  hash: string
  disposition: 'ready' | 'skipped'
  reason?: string
  element?: CanvasElement
  mutation?: PlannedMutation
  cardCreate?: CardCreateParams
  /** v5:card-update 带 @title/@content 时携带;commit 时经 onCardUpdate 写回 CardService。 */
  cardUpdateContent?: CardUpdateContent
  dependencies: string[]
}

export interface ApplyPlan {
  items: ApplyPlanItem[]
  diagnostics: SanitizeDiagnostic[]
}

/**
 * Final report from the commit phase. Counts always satisfy:
 * applied + skipped + failed === total.
 */
export interface ApplyResult {
  total: number
  applied: number
  skipped: number
  failed: number
  cardsCreated: number
  cardsUpdated: number
  freeformChanged: number
  newlyApplied: string[]
  opResults: ApplyOpResult[]
  sanitizeDiagnostics?: SanitizeDiagnostic[]
}

/**
 * Build a deterministic mutation plan without changing the host. A shadow map is
 * advanced in operation order so later arrows can target earlier planned creates.
 */
export function buildApplyPlan(
  host: CanvasHost,
  ops: DslOp[],
  appliedHashes?: ReadonlySet<string>,
): ApplyPlan {
  const { ops: sanitized, diagnostics: sanitizeDiagnostics } =
    sanitizeDslOps(ops, buildSanitizeCtx(host))
  const { ops: solved, diagnostics: solveDiagnostics } =
    solveRelational(sanitized, buildExistingGeometry(host))
  const diagnostics = [...sanitizeDiagnostics, ...solveDiagnostics]
  const shadow = new Map(host.getElements().map((element) => [element.id, element]))
  const items: ApplyPlanItem[] = []

  for (let opIndex = 0; opIndex < solved.length; opIndex++) {
    const op = solved[opIndex]!
    const hash = JSON.stringify(op)
    if (appliedHashes?.has(hash)) {
      items.push({
        opIndex,
        op,
        hash,
        disposition: 'skipped',
        reason: 'operation already applied in this session',
        dependencies: [],
      })
      continue
    }

    const item = planOp(shadow, op, opIndex, hash)
    items.push(item)
    if (item.disposition === 'ready' && item.element) {
      shadow.set(item.element.id, item.element)
    } else if (
      item.reason?.includes('id conflict') &&
      !diagnostics.some(
        (entry) =>
          entry.opIndex === opIndex &&
          (entry.message.includes('id conflict') || entry.message.includes('冲突')),
      )
    ) {
      diagnostics.push({ opIndex, message: item.reason })
    }
  }

  return { items, diagnostics }
}

/**
 * Commit a prepared plan. Card persistence runs before the corresponding host
 * upsert. A failed element id is remembered so dependent arrows are skipped.
 */
export function commitApplyPlan(
  host: CanvasHost,
  plan: ApplyPlan,
  appliedHashes?: Set<string>,
  onCardCreate?: CardCreateHandler,
  onCardUpdate?: CardUpdateHandler,
): ApplyResult {
  const report = emptyReport(plan.items.length)
  const failedElementIds = new Set<string>()

  const commit = () => {
    for (const item of plan.items) {
      if (item.disposition === 'skipped' || !item.element || !item.mutation) {
        report.skipped++
        report.opResults.push(opResult(item, 'skipped', item.reason ?? 'operation is not applicable'))
        continue
      }

      const missingDependency = item.dependencies.find(
        (id) => failedElementIds.has(id) || !host.getElement(id),
      )
      if (missingDependency) {
        report.skipped++
        report.opResults.push(
          opResult(item, 'skipped', `dependency #${missingDependency} was not committed`),
        )
        continue
      }

      if (item.cardCreate && onCardCreate) {
        try {
          const persisted = onCardCreate(item.cardCreate)
          if (
            typeof persisted === 'object' &&
            persisted !== null &&
            persisted.ok === false
          ) {
            failedElementIds.add(item.element.id)
            report.failed++
            report.opResults.push(opResult(item, 'failed', persisted.reason))
            continue
          }
        } catch (error) {
          failedElementIds.add(item.element.id)
          report.failed++
          report.opResults.push(opResult(item, 'failed', errorReason(error)))
          continue
        }
      }

      // v5:card-update 带 @title/@content → 写回 CardService(Card.title/body)。
      if (item.cardUpdateContent && onCardUpdate) {
        try {
          onCardUpdate(item.cardUpdateContent)
        } catch (error) {
          failedElementIds.add(item.element.id)
          report.failed++
          report.opResults.push(opResult(item, 'failed', errorReason(error)))
          continue
        }
      }

      try {
        host.upsert(item.element)
      } catch (error) {
        failedElementIds.add(item.element.id)
        report.failed++
        report.opResults.push(opResult(item, 'failed', errorReason(error)))
        continue
      }

      report.applied++
      if (item.mutation === 'card-create') report.cardsCreated++
      else if (item.mutation === 'card-update') report.cardsUpdated++
      else report.freeformChanged++
      report.opResults.push(opResult(item, 'applied'))
      if (appliedHashes) {
        appliedHashes.add(item.hash)
        report.newlyApplied.push(item.hash)
      }
    }
  }

  if (plan.items.some((item) => item.disposition === 'ready')) host.batch(commit)
  else commit()

  if (plan.diagnostics.length > 0) {
    report.sanitizeDiagnostics = plan.diagnostics
    console.warn('[applyLayout] diagnostics', plan.diagnostics)
  }
  return report
}

/** Compatibility entry point used by the canvas UI and tests. */
export function applyLayout(
  host: CanvasHost,
  ops: DslOp[],
  appliedHashes?: Set<string>,
  onCardCreate?: CardCreateHandler,
  onCardUpdate?: CardUpdateHandler,
): ApplyResult {
  const plan = buildApplyPlan(host, ops, appliedHashes)
  return commitApplyPlan(host, plan, appliedHashes, onCardCreate, onCardUpdate)
}

function emptyReport(total: number): ApplyResult {
  return {
    total,
    applied: 0,
    skipped: 0,
    failed: 0,
    cardsCreated: 0,
    cardsUpdated: 0,
    freeformChanged: 0,
    newlyApplied: [],
    opResults: [],
  }
}

function opResult(
  item: ApplyPlanItem,
  status: ApplyOpStatus,
  reason?: string,
): ApplyOpResult {
  return {
    opIndex: item.opIndex,
    op: item.op,
    status,
    ...(reason ? { reason } : {}),
  }
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function finiteRound(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : fallback
}

function readyItem(
  opIndex: number,
  op: DslOp,
  hash: string,
  element: CanvasElement,
  mutation: PlannedMutation,
  dependencies: string[] = [],
  cardCreate?: CardCreateParams,
): ApplyPlanItem {
  return {
    opIndex,
    op,
    hash,
    disposition: 'ready',
    element,
    mutation,
    dependencies,
    ...(cardCreate ? { cardCreate } : {}),
  }
}

function skippedItem(
  opIndex: number,
  op: DslOp,
  hash: string,
  reason: string,
): ApplyPlanItem {
  return {
    opIndex,
    op,
    hash,
    disposition: 'skipped',
    reason,
    dependencies: [],
  }
}

function planOp(
  shadow: Map<string, CanvasElement>,
  op: DslOp,
  opIndex: number,
  hash: string,
): ApplyPlanItem {
  switch (op.type) {
    case 'card':
      return planCard(shadow, op, opIndex, hash)
    case 'free':
      return planFree(shadow, op, opIndex, hash)
    case 'arrow':
      return planArrow(shadow, op, opIndex, hash)
  }
}

function planCard(
  shadow: Map<string, CanvasElement>,
  op: DslCardOp,
  opIndex: number,
  hash: string,
): ApplyPlanItem {
  const id = String(op.cardId)
  const existing = shadow.get(id)
  if (!existing) {
    if (!op.create) return skippedItem(opIndex, op, hash, `card #${id} does not exist`)
    const x = finiteRound(op.x, 0)
    const y = finiteRound(op.y, 0)
    const w = op.w ?? 240
    const h = op.h ?? 120
    const element: CanvasElement = {
      id,
      kind: 'card',
      x,
      y,
      w,
      h,
      rotation: 0,
      color: op.color ?? 'white',
    }
    return readyItem(
      opIndex,
      op,
      hash,
      element,
      'card-create',
      [],
      {
        cardId: id,
        x,
        y,
        w,
        h,
        color: op.color,
        ...(op.title !== undefined ? { title: op.title } : {}),
        ...(op.content !== undefined ? { content: op.content } : {}),
      },
    )
  }
  if (existing.kind !== 'card') {
    return skippedItem(opIndex, op, hash, `card #${id} id conflict with existing ${existing.kind}`)
  }
  if (op.create) {
    return skippedItem(opIndex, op, hash, `card #${id} id conflict with existing card`)
  }
  const updateItem = readyItem(
    opIndex,
    op,
    hash,
    {
      ...existing,
      x: finiteRound(op.x, existing.x),
      y: finiteRound(op.y, existing.y),
      ...(op.w !== undefined ? { w: op.w } : {}),
      ...(op.h !== undefined ? { h: op.h } : {}),
      ...(op.color ? { color: op.color } : {}),
    },
    'card-update',
  )
  // v5:card-update 带 @title/@content → 携带,commit 时写回 CardService。
  if (op.title !== undefined || op.content !== undefined) {
    updateItem.cardUpdateContent = {
      cardId: id,
      ...(op.title !== undefined ? { title: op.title } : {}),
      ...(op.content !== undefined ? { content: op.content } : {}),
    }
  }
  return updateItem
}

function planFree(
  shadow: Map<string, CanvasElement>,
  op: DslFreeOp,
  opIndex: number,
  hash: string,
): ApplyPlanItem {
  const x = finiteRound(op.x, 0)
  const y = finiteRound(op.y, 0)
  if (op.id) {
    const existing = shadow.get(op.id)
    if (existing?.kind === op.shape) {
      return readyItem(
        opIndex,
        op,
        hash,
        {
          ...existing,
          x,
          y,
          ...(op.w !== undefined ? { w: op.w } : {}),
          ...(op.h !== undefined ? { h: op.h } : {}),
          ...(op.color ? { color: op.color } : {}),
          ...('text' in op && op.text !== undefined ? { text: op.text } : {}),
        },
        'freeform',
      )
    }
  }

  // Preserve the previous compatibility rule for cross-kind free-shape ids.
  const id = op.id && !shadow.has(op.id) ? op.id : uid('free')
  let element: CanvasElement
  switch (op.shape) {
    case 'rect':
      element = {
        id,
        kind: 'rect',
        x,
        y,
        w: op.w ?? 200,
        h: op.h ?? 150,
        rotation: 0,
        color: op.color ?? 'black',
      }
      break
    case 'text':
      element = {
        id,
        kind: 'text',
        x,
        y,
        w: op.w ?? 100,
        h: op.h ?? 40,
        rotation: 0,
        text: op.text ?? '',
        ...(op.color ? { color: op.color } : {}),
      }
      break
    case 'frame':
      element = {
        id,
        kind: 'frame',
        x,
        y,
        w: op.w ?? 400,
        h: op.h ?? 300,
        rotation: 0,
        text: op.text ?? '',
        color: op.color ?? 'blue',
      }
      break
  }
  return readyItem(opIndex, op, hash, element, 'freeform')
}

function planArrow(
  shadow: Map<string, CanvasElement>,
  op: DslArrowOp,
  opIndex: number,
  hash: string,
): ApplyPlanItem {
  const existing = op.id ? shadow.get(op.id) : undefined
  if (existing && existing.kind !== 'arrow') {
    return skippedItem(
      opIndex,
      op,
      hash,
      `arrow #${op.id} id conflict with existing ${existing.kind}`,
    )
  }

  const wikilinkForCreate = op.wikilink ? { meta: { wikilink: true } } : {}
  const wikilinkForUpdate =
    op.wikilink && existing
      ? { meta: { ...(existing.meta ?? {}), wikilink: true } }
      : {}
  const isFreeArrow = op.freeArrow || (!op.from && !op.to)

  if (isFreeArrow) {
    if (existing?.kind === 'arrow') {
      return readyItem(
        opIndex,
        op,
        hash,
        {
          ...existing,
          from: undefined,
          to: undefined,
          ...(op.x !== undefined ? { x: op.x } : {}),
          ...(op.y !== undefined ? { y: op.y } : {}),
          ...(op.w !== undefined ? { w: op.w } : {}),
          ...(op.h !== undefined ? { h: op.h } : {}),
          ...(op.dash ? { dash: op.dash } : {}),
          ...(op.arrowhead ? { arrowhead: op.arrowhead } : {}),
          ...(op.color ? { color: op.color } : {}),
          ...(op.label !== undefined ? { text: op.label } : {}),
          ...(op.curve ? { curve: op.curve } : {}),
          ...(op.route ? { route: op.route } : {}),
          ...(op.elbow ? { elbow: op.elbow } : {}),
          ...wikilinkForUpdate,
        },
        'freeform',
      )
    }
    return readyItem(
      opIndex,
      op,
      hash,
      {
        id: op.id ?? uid('arrow'),
        kind: 'arrow',
        x: op.x ?? 0,
        y: op.y ?? 0,
        w: op.w ?? 0,
        h: op.h ?? 0,
        rotation: 0,
        text: op.label ?? '',
        ...(op.color ? { color: op.color } : {}),
        ...(op.dash ? { dash: op.dash } : {}),
        ...(op.arrowhead ? { arrowhead: op.arrowhead } : {}),
        ...(op.curve ? { curve: op.curve } : {}),
        ...(op.route ? { route: op.route } : {}),
        ...(op.elbow ? { elbow: op.elbow } : {}),
        ...wikilinkForCreate,
      },
      'freeform',
    )
  }

  const dependencies = [op.from, op.to]
  const missing = dependencies.find((id) => !shadow.has(id))
  if (missing) {
    return skippedItem(opIndex, op, hash, `arrow endpoint #${missing} does not exist`)
  }

  if (existing?.kind === 'arrow') {
    return readyItem(
      opIndex,
      op,
      hash,
      {
        ...existing,
        from: op.from,
        to: op.to,
        ...(op.dash ? { dash: op.dash } : {}),
        ...(op.arrowhead ? { arrowhead: op.arrowhead } : {}),
        ...(op.color ? { color: op.color } : {}),
        ...(op.label !== undefined ? { text: op.label } : {}),
        ...(op.curve ? { curve: op.curve } : {}),
        ...(op.route ? { route: op.route } : {}),
        ...(op.elbow ? { elbow: op.elbow } : {}),
        ...wikilinkForUpdate,
      },
      'freeform',
      dependencies,
    )
  }

  return readyItem(
    opIndex,
    op,
    hash,
    {
      id: op.id ?? uid('arrow'),
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: op.from,
      to: op.to,
      text: op.label ?? '',
      ...(op.color ? { color: op.color } : {}),
      ...(op.dash ? { dash: op.dash } : {}),
      ...(op.arrowhead ? { arrowhead: op.arrowhead } : {}),
      ...(op.curve ? { curve: op.curve } : {}),
      ...(op.route ? { route: op.route } : {}),
      ...(op.elbow ? { elbow: op.elbow } : {}),
      ...wikilinkForCreate,
    },
    'freeform',
    dependencies,
  )
}

function buildSanitizeCtx(host: CanvasHost): SanitizeCtx {
  const existingCardIds = new Set<string>()
  const existingFreeIds = new Set<string>()
  const existingFreeKinds = new Map<string, 'rect' | 'text' | 'frame'>()
  for (const element of host.getElements()) {
    if (element.kind === 'card') existingCardIds.add(element.id)
    else if (element.kind !== 'arrow') {
      existingFreeIds.add(element.id)
      if (
        element.kind === 'rect' ||
        element.kind === 'text' ||
        element.kind === 'frame'
      ) {
        existingFreeKinds.set(element.id, element.kind)
      }
    }
  }
  return { existingCardIds, existingFreeIds, existingFreeKinds }
}

function buildExistingGeometry(host: CanvasHost): Map<string, ExistingGeom> {
  const geometry = new Map<string, ExistingGeom>()
  for (const element of host.getElements()) {
    if (element.kind === 'card') {
      geometry.set(element.id, {
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
      })
    }
  }
  return geometry
}
