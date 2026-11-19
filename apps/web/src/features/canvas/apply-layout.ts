'use client'

import { measureText, type CanvasElement, type CanvasHost } from '@cys-stift/canvas-engine'
import type { CardType, CodeBlock, Quote } from '@cys-stift/domain'
import type { DslArrowOp, DslCardOp, DslFreeOp, DslOp } from '@wscytz/dsl'
import { sanitizeDslOps, evalCompute, evalComputeDetail, formatComputeNumber } from '@wscytz/dsl'
import type { SanitizeCtx, SanitizeDiagnostic, ComputeResolver } from '@wscytz/dsl'
import { solveRelational, type ExistingGeom } from '@wscytz/dsl'
import { withLayoutAnchorPreserved } from '@/lib/card-layout-anchor-store'

/** hash 命中跳过的 reason(v11.1)。产点与诊断豁免点共用一处常量:两处字符串
 *  一旦漂移,豁免静默失效(「已应用」行又被闸门挡死)。 */
export const HASH_SKIP_REASON = 'operation already applied in this session'

function uid(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}-${rand}`
}

/** DSL/AI 新建 text 的真实度量(2026-11-17 对抗审查 X-1):此前固定 100×40,
 *  长文本导出按旧宽裁切(19 汉字实测右缘超出约 150px)。与 R9 编辑路径同源
 *  14px / 行高 18;测试/SSR 无 canvas ctx(jsdom 未装 canvas)时退化为字符估算
 *  (CJK 14px、latin 8px)。ctx 模块级缓存,避免每条 text 创建都建 canvas。 */
let applyMeasureCtx: CanvasRenderingContext2D | null | undefined
function measureTextForApply(text: string): { w: number; h: number } {
  const lines = text.split('\n')
  if (typeof document !== 'undefined') {
    try {
      if (applyMeasureCtx === undefined) {
        applyMeasureCtx = document.createElement('canvas').getContext('2d')
      }
      if (applyMeasureCtx) {
        const size =
          getComputedStyle(document.documentElement).getPropertyValue('--font-size-sm').trim() ||
          '14px'
        const family =
          getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() ||
          'Inter, sans-serif'
        return measureText(text, applyMeasureCtx, `${size} ${family}`, 18)
      }
    } catch {
      /* fall through to estimate */
    }
  }
  let maxW = 0
  for (const line of lines) {
    let w = 0
    for (const ch of line) {
      const code = ch.codePointAt(0) ?? 0
      w += code >= 0x1100 ? 14 : 8
    }
    if (w > maxW) maxW = w
  }
  return { w: Math.max(1, Math.ceil(maxW)), h: Math.max(18, lines.length * 18) }
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

type PlannedMutation = 'card-create' | 'card-update' | 'freeform' | 'card-delete' | 'freeform-delete'

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
  /** v10:delete 行携带;commit 时经 onCardRemove(card)+host.remove 执行删除。 */
  deletedId?: string
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
  /** v10:card-delete 计入 applied(镜像 cardsCreated),单列供报告/测试断言。 */
  cardsDeleted: number
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
  const hashes = sanitized.map(({ line: _sourceLine, ...op }) => JSON.stringify(op))
  // 关系行是声明式约束，不是一次性指令：锚点可能在上一次应用后被移动，
  // 重试时必须重新求解，绝不能按“本次会话已应用”跳过（v11.2 三审 A-02）。
  // 其余行仍按稳定 hash 去重（create 一行只造一次卡；文本/属性补丁幂等）。
  const skippableByHash = (opIndex: number) => {
    const op = sanitized[opIndex]
    if (
      op?.type === 'card' &&
      op.rel !== undefined &&
      !op.create &&
      !op.delete
    ) {
      return false
    }
    return appliedHashes?.has(hashes[opIndex]!) === true
  }
  const pendingIndices = sanitized.flatMap((_, index) => skippableByHash(index) ? [] : [index])
  const { ops: solved, diagnostics: solveDiagnostics, anchorDependencies } = solveRelational(
    pendingIndices.map((index) => sanitized[index]!),
    buildExistingGeometry(host),
  )
  const diagnostics = [
    ...sanitizeDiagnostics.filter(({ opIndex }) => !skippableByHash(opIndex)),
    ...solveDiagnostics.map((diagnostic) => ({ ...diagnostic, opIndex: pendingIndices[diagnostic.opIndex]! })),
  ]
  const shadow = new Map(host.getElements().map((element) => [element.id, element]))
  const items: ApplyPlanItem[] = []
  let solvedIndex = 0

  for (let opIndex = 0; opIndex < sanitized.length; opIndex++) {
    const hash = hashes[opIndex]!
    if (skippableByHash(opIndex)) {
      const op = sanitized[opIndex]!
      items.push({
        opIndex,
        op,
        hash,
        disposition: 'skipped',
        reason: HASH_SKIP_REASON,
        dependencies: [],
      })
      continue
    }
    const op = solved[solvedIndex]!
    const anchors = anchorDependencies.get(solvedIndex++)
    const item = planOp(shadow, op, opIndex, hash, anchors)
    items.push(item)
    if (item.disposition === 'ready' && item.element) {
      shadow.set(item.element.id, item.element)
    } else if (item.disposition === 'ready' && item.deletedId) {
      // v10:delete 从 shadow 摘除,后续 op 看到"删除后的世界"(再 create 同 id = 复活,合法)。
      shadow.delete(item.deletedId)
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
  onCardRemove?: (cardId: string) => void,
): ApplyResult {
  const report = emptyReport(plan.items.length)
  const failedElementIds = new Set<string>()

  const commit = () => {
    for (const item of plan.items) {
      if (item.disposition === 'skipped' || !item.mutation) {
        report.skipped++
        report.opResults.push(opResult(item, 'skipped', item.reason ?? 'operation is not applicable'))
        continue
      }

      // v10:delete 行——先 DB(onCardRemove)后 host.remove(镜像 card-create 的 persist 先行:
      // DB 是卡的真源,先摘 host 会被 snap 同步复活)。host.remove 级联清挂接箭头。
      if (item.mutation === 'card-delete' || item.mutation === 'freeform-delete') {
        const id = item.deletedId!
        try {
          if (item.mutation === 'card-delete' && onCardRemove) onCardRemove(id)
          host.remove(id)
        } catch (error) {
          report.failed++
          report.opResults.push(opResult(item, 'failed', errorReason(error)))
          continue
        }
        report.applied++
        if (item.mutation === 'card-delete') report.cardsDeleted++
        else report.freeformChanged++
        report.opResults.push(opResult(item, 'applied'))
        if (appliedHashes) {
          appliedHashes.add(item.hash)
          report.newlyApplied.push(item.hash)
        }
        continue
      }

      const missingDependency = item.dependencies.find(
        (id) => failedElementIds.has(id) || !host.getElement(id),
      )
      if (missingDependency) {
        if (item.element) failedElementIds.add(item.element.id)
        report.skipped++
        report.opResults.push(
          opResult(item, 'skipped', `dependency #${missingDependency} was not committed`),
        )
        continue
      }

      // delete 分支已 continue;此处必有 element(create/update/freeform)。防御性守卫,
      // 同时让后续 failedElementIds.add(item.element.id) 收窄为非空。
      if (!item.element) {
        report.skipped++
        report.opResults.push(opResult(item, 'skipped', 'mutation has no element'))
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

  // DSL/关系求解是程序化重排：同一锚描述符解到新位置时，不能把刚写入的
  // layoutAnchor 当作用户拖拽清掉（清锚回调用几何变化识别拖拽，两者形状相同）。
  withLayoutAnchorPreserved(() => {
    if (plan.items.some((item) => item.disposition === 'ready')) host.batch(commit)
    else commit()
  })

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
  onCardRemove?: (cardId: string) => void,
): ApplyResult {
  const plan = buildApplyPlan(host, ops, appliedHashes)
  return commitApplyPlan(host, plan, appliedHashes, onCardCreate, onCardUpdate, onCardRemove)
}

export type ApplyPlanOutcome =
  | { ok: true; plan: ApplyPlan; report: ApplyResult }
  | { ok: false; plan: ApplyPlan; diagnostics: SanitizeDiagnostic[] }

/**
 * Build and commit only when the plan has no blocking diagnostics. UI paths
 * that preview or apply user-authored DSL must use this entry point: a missing
 * anchor or other solver diagnostic otherwise leaves placeholder coordinates
 * that commitApplyPlan would write to the host.
 */
export function applyPlanIfClean(
  host: CanvasHost,
  ops: DslOp[],
  appliedHashes?: Set<string>,
  onCardCreate?: CardCreateHandler,
  onCardUpdate?: CardUpdateHandler,
  onCardRemove?: (cardId: string) => void,
): ApplyPlanOutcome {
  const plan = buildApplyPlan(host, ops, appliedHashes)
  if (plan.diagnostics.length > 0) {
    return { ok: false, plan, diagnostics: plan.diagnostics }
  }
  return {
    ok: true,
    plan,
    report: commitApplyPlan(host, plan, appliedHashes, onCardCreate, onCardUpdate, onCardRemove),
  }
}

function emptyReport(total: number): ApplyResult {
  return {
    total,
    applied: 0,
    skipped: 0,
    failed: 0,
    cardsCreated: 0,
    cardsUpdated: 0,
    cardsDeleted: 0,
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
  // 只做 NaN/Infinity 防御,不取整 —— 取整会破坏小数坐标的 byte-equal 往返(x=100.5 → apply → 101)。
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
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

/** v10:delete 行的计划项——无 element(删除不产几何),携带 deletedId 供 commit 执行。 */
function deleteItem(
  opIndex: number,
  op: DslOp,
  hash: string,
  deletedId: string,
  mutation: 'card-delete' | 'freeform-delete',
): ApplyPlanItem {
  return {
    opIndex,
    op,
    hash,
    disposition: 'ready',
    mutation,
    deletedId,
    dependencies: [],
  }
}

function planOp(
  shadow: Map<string, CanvasElement>,
  op: DslOp,
  opIndex: number,
  hash: string,
  anchors?: readonly string[],
): ApplyPlanItem {
  switch (op.type) {
    case 'card':
      return planCard(shadow, op, opIndex, hash, anchors)
    case 'free':
      return planFree(shadow, op, opIndex, hash)
    case 'arrow':
      return planArrow(shadow, op, opIndex, hash)
  }
}

/** v7: 给 card 套 group/href meta(幂等合并;空串/空数组清键)。无 group/href → 原 meta(含 undefined)。
 *  v11: relMeta → meta.layoutAnchor；绝对 @pos 覆盖时清除；纯内容编辑(keepExistingPos)保留。 */
function applyCardMeta(
  existing: CanvasElement | undefined,
  op: DslCardOp,
): Record<string, unknown> | undefined {
  const hasRel = op.relMeta !== undefined
  const shouldClearAnchor =
    op.keepExistingPos !== true && existing?.meta?.layoutAnchor !== undefined
  if (
    op.group === undefined &&
    op.href === undefined &&
    !hasRel &&
    !shouldClearAnchor
  ) {
    return existing?.meta
  }
  const meta: Record<string, unknown> = { ...(existing?.meta ?? {}) }
  if (op.group !== undefined) {
    if (op.group === '') delete meta.group
    else meta.group = op.group
  }
  if (op.href !== undefined) {
    if (op.href.length === 0) delete meta.href
    else meta.href = op.href
  }
  if (op.relMeta) {
    meta.layoutAnchor = { ...op.relMeta }
  } else if (op.keepExistingPos !== true) {
    delete meta.layoutAnchor
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
  anchors?: readonly string[],
): ApplyPlanItem {
  const id = String(op.cardId)
  const existing = shadow.get(id)
  const dependencies = anchors?.filter((anchorId) => anchorId !== id) ?? []
  // v10:删除行。目标存在 → card-delete(引擎 host.remove 级联清挂接箭头,DB 侧经 onCardRemove
  // 移出画布,卡本体保留可恢复);不存在/跨 kind → skip(sanitize 已产信息性 diagnostic)。
  if (op.delete) {
    if (!existing) return skippedItem(opIndex, op, hash, `delete card #${id} does not exist`)
    if (existing.kind !== 'card') {
      return skippedItem(opIndex, op, hash, `delete card #${id} id conflict with existing ${existing.kind}`)
    }
    return deleteItem(opIndex, op, hash, id, 'card-delete')
  }
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
      dependencies,
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
    dependencies,
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
  // v10:删除行。id 存在(任意 kind 均可删——free op 只认 id)→ freeform-delete;不存在 → skip。
  if (op.delete) {
    const target = op.id ? shadow.get(op.id) : undefined
    if (!target) return skippedItem(opIndex, op, hash, `delete ${op.shape} #${op.id ?? ''} does not exist`)
    // 2026-11-17 边界审查:delete 的 kind 前缀由模型自选(prompt 只约定带 #id),
    // 写错前缀(如 [rect #某卡id delete])不得把卡送进 freeform-delete——那会绕过
    // DB-first 守卫(canvasPosition 不清 → syncCardsToEditor 静默复活卡,挂接箭头
    // 永久丢)。目标实为卡 → 与 planCard 同语义 card-delete;free 元素 → freeform-delete。
    if (target.kind === 'card') return deleteItem(opIndex, op, hash, target.id, 'card-delete')
    return deleteItem(opIndex, op, hash, target.id, 'freeform-delete')
  }
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
      const text = 'text' in computedText ? computedText.text : (op.text ?? '')
      const measured = text.trim() ? measureTextForApply(text) : { w: 100, h: 40 }
      element = {
        id,
        kind: 'text',
        x,
        y,
        w: op.w ?? measured.w,
        h: op.h ?? measured.h,
        rotation: 0,
        text,
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
  // v10:删除行。#id 存在(须是 arrow)→ freeform-delete;无 id/不存在 → skip。
  // 注意 [arrow] 语法 id 可省,delete 无目标即无意义。
  if (op.delete) {
    const target = op.id ? shadow.get(op.id) : undefined
    if (!target) return skippedItem(opIndex, op, hash, `delete arrow #${op.id ?? ''} does not exist`)
    if (target.kind !== 'arrow') {
      return skippedItem(opIndex, op, hash, `delete arrow #${op.id} id conflict with existing ${target.kind}`)
    }
    return deleteItem(opIndex, op, hash, target.id, 'freeform-delete')
  }
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
  const existingElementIds = new Set<string>()
  for (const element of host.getElements()) {
    existingElementIds.add(element.id)
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
  return { existingCardIds, existingFreeIds, existingFreeKinds, existingElementIds }
}

function buildExistingGeometry(host: CanvasHost): Map<string, ExistingGeom> {
  const geometry = new Map<string, ExistingGeom>()
  for (const element of host.getElements()) {
    if (element.kind === 'card') {
      // v9 组级相对锚:card meta.group 进 geom,rel 可 @组名 锚到画布既有分组
      const group = typeof element.meta?.group === 'string' ? element.meta.group : undefined
      geometry.set(element.id, {
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
        ...(group !== undefined ? { group } : {}),
      })
    }
  }
  return geometry
}
