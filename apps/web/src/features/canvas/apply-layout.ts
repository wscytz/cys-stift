'use client'

import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import type { CardType, CodeBlock, Quote } from '@cys-stift/domain'
import type { DslArrowOp, DslCardOp, DslFreeOp, DslOp } from '@cys-stift/dsl'
import { sanitizeDslOps, evalCompute, evalComputeDetail, formatComputeNumber } from '@cys-stift/dsl'
import type { SanitizeCtx, SanitizeDiagnostic, ComputeResolver } from '@cys-stift/dsl'
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
  /** v8:卡片类型(DSL @type)。建卡时写入 Card.type。 */
  cardType?: CardType
  /** v8:标签值列表(DSL @tags)。建卡时由 web 指派颜色映射成 TagRef[]。 */
  tags?: string[]
  /** v8:外链 URL 列表(DSL @links)。建卡时由 web 映射成 LinkPreview[](fetchedAt=now)。 */
  links?: string[]
  /** v8:代码块(DSL @code,可重复)。建卡时写入 Card.codeSnippets。 */
  code?: CodeBlock[]
  /** v8:引文(DSL @quote,可重复)。建卡时写入 Card.quotes。 */
  quotes?: Quote[]
}

/** v5:更新现有卡片内容(DSL @title/@content on an existing card)。apply 时写回 Card.title/body。
 *  v8:同机制扩到 @type/@tags/@links/@code/@quote。 */
export interface CardUpdateContent {
  cardId: string
  title?: string
  content?: string
  cardType?: CardType
  tags?: string[]
  links?: string[]
  code?: CodeBlock[]
  quotes?: Quote[]
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

  // v7 post-pass:用完整 shadow 重算 @compute,解前向引用(AI 把汇总 text 写在被引用元素之前时,
  // 初遍 resolver 读到的 shadow 还没那些元素 → 失败 fallback)。这里 shadow 已完整,重算覆盖 text;
  // 仍失败(未解析引用/语法错)→ 记诊断,与 sanitize/solve diagnostics 同列。
  for (const item of items) {
    if (item.disposition !== 'ready' || !item.element) continue
    const el = item.element
    if (el.kind !== 'text') continue
    const formula = el.meta?.compute
    if (typeof formula !== 'string') continue
    const result = evalComputeDetail(formula, (refId) => {
      const g = shadow.get(refId)
      return g ? { x: g.x, y: g.y, w: g.w, h: g.h } : undefined
    })
    if (result.value !== undefined) {
      el.text = formatComputeNumber(result.value)
    } else if (result.error) {
      diagnostics.push({ opIndex: item.opIndex, message: `compute: ${result.error}` })
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

/** v7: 给 card 套 group/href meta(幂等合并;空串/空数组清键)。无 group/href → 原 meta(含 undefined)。 */
function applyCardMeta(
  existing: CanvasElement | undefined,
  op: DslCardOp,
): Record<string, unknown> | undefined {
  if (op.group === undefined && op.href === undefined) return existing?.meta
  const meta: Record<string, unknown> = { ...(existing?.meta ?? {}) }
  if (op.group !== undefined) {
    if (op.group === '') delete meta.group
    else meta.group = op.group
  }
  if (op.href !== undefined) {
    if (op.href.length === 0) delete meta.href
    else meta.href = op.href
  }
  return meta
}

/** v7: 给 free 元素套 group/compute meta(幂等合并;空串清键)。compute 仅 text。 */
function applyFreeMeta(
  existing: CanvasElement | undefined,
  op: DslFreeOp,
): Record<string, unknown> | undefined {
  const compute = op.shape === 'text' ? op.compute : undefined
  if (op.group === undefined && compute === undefined) return existing?.meta
  const meta: Record<string, unknown> = { ...(existing?.meta ?? {}) }
  if (op.group !== undefined) {
    if (op.group === '') delete meta.group
    else meta.group = op.group
  }
  if (compute !== undefined) {
    if (compute === '') delete meta.compute
    else meta.compute = compute
  }
  return meta
}

/** v7: text 元素带 @compute → 用受限求值器(禁裸 eval)算出显示值写 text。
 *  求值失败(语法/引用未解析)→ 保留已知 text(op.text 优先,其次 existing),不清空。 */
function resolveComputedText(
  op: DslFreeOp,
  existing: CanvasElement | undefined,
  resolver: ComputeResolver,
): { text: string } | Record<string, never> {
  if (op.shape !== 'text' || op.compute === undefined) return {}
  const val = evalCompute(op.compute, resolver)
  if (val === undefined) return { text: op.text ?? existing?.text ?? '' }
  return { text: formatComputeNumber(val) }
}

/** v8:从 card op 抽结构化字段(type/tags/links/code/quotes)成可 spread 对象(缺省不带 → apply 侧"缺省不改")。
 *  create 与 update 两路共用,消除重复。tags 是值列表(web 指派颜色),links 是 URL 列表(web 映射 LinkPreview)。 */
function v8CardFields(
  op: DslCardOp,
): Partial<Pick<CardCreateParams, 'cardType' | 'tags' | 'links' | 'code' | 'quotes'>> {
  return {
    ...(op.cardType !== undefined ? { cardType: op.cardType } : {}),
    ...(op.tags !== undefined ? { tags: op.tags } : {}),
    ...(op.links !== undefined ? { links: op.links } : {}),
    ...(op.code !== undefined ? { code: op.code } : {}),
    ...(op.quotes !== undefined ? { quotes: op.quotes } : {}),
  }
}

/** op 是否携带任一 v8 结构化字段(触发 update 写回 / create 携带)。 */
function hasV8Fields(op: DslCardOp): boolean {
  return (
    op.cardType !== undefined || op.tags !== undefined || op.links !== undefined ||
    op.code !== undefined || op.quotes !== undefined
  )
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
    const createMeta = applyCardMeta(undefined, op)
    const element: CanvasElement = {
      id,
      kind: 'card',
      x,
      y,
      w,
      h,
      rotation: 0,
      color: op.color ?? 'white',
      ...(createMeta ? { meta: createMeta } : {}),
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
        ...v8CardFields(op),
      },
    )
  }
  if (existing.kind !== 'card') {
    return skippedItem(opIndex, op, hash, `card #${id} id conflict with existing ${existing.kind}`)
  }
  if (op.create) {
    return skippedItem(opIndex, op, hash, `card #${id} id conflict with existing card`)
  }
  const keepPos = op.keepExistingPos === true
  const updateMeta = applyCardMeta(existing, op)
  const updateItem = readyItem(
    opIndex,
    op,
    hash,
    {
      ...existing,
      ...(keepPos
        ? {} // v5(E):无 @pos 的纯属性/内容编辑 → 几何完全沿用现有卡
        : { x: finiteRound(op.x, existing.x), y: finiteRound(op.y, existing.y) }),
      ...(op.w !== undefined ? { w: op.w } : {}),
      ...(op.h !== undefined ? { h: op.h } : {}),
      ...(op.color ? { color: op.color } : {}),
      ...(updateMeta !== undefined ? { meta: updateMeta } : {}),
    },
    'card-update',
  )
  // v5:card-update 带 @title/@content → 携带,commit 时写回 CardService。v8:同机制扩到结构化字段。
  if (op.title !== undefined || op.content !== undefined || hasV8Fields(op)) {
    updateItem.cardUpdateContent = {
      cardId: id,
      ...(op.title !== undefined ? { title: op.title } : {}),
      ...(op.content !== undefined ? { content: op.content } : {}),
      ...v8CardFields(op),
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
  // v7 @compute 求值器:把 `#id.field` 解析成 shadow 里元素的几何(含本批已规划的)。
  const resolver: ComputeResolver = (refId) => {
    const el = shadow.get(refId)
    return el ? { x: el.x, y: el.y, w: el.w, h: el.h } : undefined
  }
  if (op.id) {
    const existing = shadow.get(op.id)
    if (existing?.kind === op.shape) {
      const meta = applyFreeMeta(existing, op)
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
          ...resolveComputedText(op, existing, resolver),
          ...(meta !== undefined ? { meta } : {}),
        },
        'freeform',
      )
    }
  }

  // Preserve the previous compatibility rule for cross-kind free-shape ids.
  const id = op.id && !shadow.has(op.id) ? op.id : uid('free')
  const createMeta = applyFreeMeta(undefined, op)
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
        ...(createMeta ? { meta: createMeta } : {}),
      }
      break
    case 'text': {
      const computedText = resolveComputedText(op, undefined, resolver)
      element = {
        id,
        kind: 'text',
        x,
        y,
        w: op.w ?? 100,
        h: op.h ?? 40,
        rotation: 0,
        text: 'text' in computedText ? computedText.text : (op.text ?? ''),
        ...(op.color ? { color: op.color } : {}),
        ...(createMeta ? { meta: createMeta } : {}),
      }
      break
    }
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
        ...(createMeta ? { meta: createMeta } : {}),
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
