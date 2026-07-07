'use client'

/**
 * DSL Sanitize 层 —— 解析后、apply 前,纯函数修正 LLM 常见错误 + 产 diagnostic。
 *
 * 学 tldraw agent sanitization(corrects non-existent IDs / ensures unique IDs /
 * normalizes coordinates):不指望 LLM 算对,用引擎层兜底。
 *
 * 契约(不可破):
 * - 纯函数,永不抛错(继承 dsl-robustness.test.ts 的 36 测试契约)
 * - 合法 op 原样返回(引用稳定 —— sanitize 是 opt-in 修正,不改合规输入)
 * - free arrow 的 w/h 不动(负值编码方向,dsl-parser.ts:143)
 * - 不破坏 roundtrip byte-equal(dsl-e2e-roundtrip.test.ts):合法小卡(如 10×10)原样往返
 * - 无 ctx 时不产 diagnostic(case 6 等不依赖 ctx 的路径仍可用)
 *
 * 接入:apply-layout.ts 的 applyLayout 入口(所有 5+ 调用点必经,零调用方改)。
 * case 清单见 cys-stift-docs/docs/specs/2026-07-07-dsl-sanitize-layer-draft.md。
 * 当前实现:case 6(非法 size)+ case 1/11(card 不存在 diagnostic)+ case 7(arrow 端点 diagnostic)。
 */
import type { DslOp, DslCardOp, DslFreeOp, DslArrowOp } from './dsl-parser'

/** Sanitize 诊断:亮给用户/AI 看(让 AgentConfirmCard/dsl-dialog 把"引用了不存在的卡 #X"反馈出来)。 */
export type SanitizeDiagnostic = {
  opIndex: number
  message: string
}

export interface SanitizeResult {
  ops: DslOp[]
  diagnostics: SanitizeDiagnostic[]
}

/** 上下文:画布上已有的 card/free id(case 1/11/7 判断 id 是否存在用)。可选 —— 无 ctx 时不产 diagnostic。 */
export interface SanitizeCtx {
  existingCardIds?: Set<string>
  existingFreeIds?: Set<string>
}

/** card/rect/frame 的 w/h MAX 上限(防 LLM 生成超大跑出可视区)。
 *  不设 MIN 下界 —— 合法小卡(如 10×10)必须原样往返(commit fac88bb 负坐标契约的同理)。 */
const MAX_SIZE = 2000

/** w/h sanitize:非正(≤0)/非有限 → undefined(让 apply 用 shape 默认 240×120 等);
 *  超大 → MAX;合法正数(含小卡)原样保留。 */
function sanitizeSize(n: number | undefined): number | undefined {
  if (n === undefined) return undefined
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(MAX_SIZE, n)
}

/** x/y 坐标 MAX 绝对值(防 LLM 生成 1e6 跑出可视区)。保负向 —— 负坐标合法(画布 pan 允许,
 *  commit fac88bb 契约),只钳极端有限值,不钳合理负值(如 -100)。 */
const MAX_COORD = 10000

/** 坐标钳位:n 已是有限数(parse POS_RE 保证) → 钳 [-MAX_COORD, MAX_COORD];防御性防非有限(→0)。 */
function clampCoord(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(MAX_COORD, Math.max(-MAX_COORD, n))
}

/** card op:case 6(size)+ case 1/11(id 不存在 diagnostic)。 */
function sanitizeCard(
  op: DslCardOp,
  idx: number,
  ctx: SanitizeCtx | undefined,
  diagnostics: SanitizeDiagnostic[],
): DslCardOp {
  // case 1+11:无 create flag + id 不在 existingCardIds → diagnostic
  // (apply 会 skip,sanitize 额外提示让用户/AI 知道"引用了不存在的卡,想新建加 create")
  if (ctx?.existingCardIds !== undefined && !op.create && !ctx.existingCardIds.has(String(op.cardId))) {
    diagnostics.push({
      opIndex: idx,
      message: `card #${op.cardId} 不存在于画布(若想新建需加 create 标记)`,
    })
  }
  // case 6:size 修正 + case 5:坐标钳位
  const w = sanitizeSize(op.w)
  const h = sanitizeSize(op.h)
  const x = clampCoord(op.x)
  const y = clampCoord(op.y)
  if (w === op.w && h === op.h && x === op.x && y === op.y) return op
  return { ...op, w, h, x, y }
}

/** free shape(rect/text/frame)op:case 6(size)。case 3(跨 kind 告警)待后续。 */
function sanitizeFree(op: DslFreeOp): DslFreeOp {
  const w = sanitizeSize(op.w)
  const h = sanitizeSize(op.h)
  const x = clampCoord(op.x)
  const y = clampCoord(op.y)
  if (w === op.w && h === op.h && x === op.x && y === op.y) return op
  return { ...op, w, h, x, y }
}

/** arrow op:case 7(端点不存在 diagnostic)。free arrow 不检查(无端点)。
 *  case 4(端点重写)待后续。 */
function sanitizeArrow(
  op: DslArrowOp,
  idx: number,
  existingIds: Set<string> | undefined,
  diagnostics: SanitizeDiagnostic[],
): DslArrowOp {
  const isFreeArrow = op.freeArrow || (!op.from && !op.to)
  if (!isFreeArrow && existingIds !== undefined) {
    if (op.from && !existingIds.has(op.from)) {
      diagnostics.push({ opIndex: idx, message: `arrow from #${op.from} 不存在于画布` })
    }
    if (op.to && !existingIds.has(op.to)) {
      diagnostics.push({ opIndex: idx, message: `arrow to #${op.to} 不存在于画布` })
    }
  }
  // case 5:free arrow x/y 钳位(位置);w/h 不动(负值编码方向)。关系箭头无 x/y(undefined 透传)
  const x = op.x !== undefined ? clampCoord(op.x) : undefined
  const y = op.y !== undefined ? clampCoord(op.y) : undefined
  if (x === op.x && y === op.y) return op
  return { ...op, x, y }
}

/**
 * Sanitize 一批 DSL ops。纯函数,永不抛错。
 *
 * 单个 op sanitize 失败(异常或未知类型)→ 原样保留,让 apply 自己 skip。
 * 保守策略:宁可让 apply 阶段 diagnostic,也不在 sanitize 丢数据。
 *
 * @param ops parseDslWithDiagnostics 输出的 ops
 * @param ctx 画布现有 id(case 1/11/7 diagnostic 用;可选,无则不产 diagnostic)
 * @returns { ops: 修正后的 ops, diagnostics: 诊断 }
 */
export function sanitizeDslOps(ops: DslOp[], ctx?: SanitizeCtx): SanitizeResult {
  const diagnostics: SanitizeDiagnostic[] = []
  const out: DslOp[] = []

  // 预合并 existingIds(arrow 端点检查用 —— 端点可能是 card 或 free 元素)
  let existingIds: Set<string> | undefined
  if (ctx?.existingCardIds || ctx?.existingFreeIds) {
    existingIds = new Set<string>()
    ctx.existingCardIds?.forEach((id) => existingIds!.add(id))
    ctx.existingFreeIds?.forEach((id) => existingIds!.add(id))
  }

  let i = 0
  for (const op of ops) {
    const idx = i++
    try {
      switch (op.type) {
        case 'card':
          out.push(sanitizeCard(op, idx, ctx, diagnostics))
          break
        case 'free':
          out.push(sanitizeFree(op))
          break
        case 'arrow':
          out.push(sanitizeArrow(op, idx, existingIds, diagnostics))
          break
        default:
          // 未知类型:原样保留(保守,让 apply 自己处理)
          out.push(op)
      }
    } catch {
      // 永不抛错契约:单个 op sanitize 失败 → 原样保留
      out.push(op)
    }
  }
  return { ops: out, diagnostics }
}
