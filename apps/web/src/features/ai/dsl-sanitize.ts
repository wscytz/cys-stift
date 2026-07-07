'use client'

/**
 * DSL Sanitize 层 —— 解析后、apply 前,纯函数修正 LLM 常见错误。
 *
 * 学 tldraw agent sanitization(corrects non-existent IDs / ensures unique IDs /
 * normalizes coordinates):不指望 LLM 算对,用引擎层兜底。
 *
 * 契约(不可破):
 * - 纯函数,永不抛错(继承 dsl-robustness.test.ts 的 36 测试契约)
 * - 合法 op 原样返回(引用稳定 —— sanitize 是 opt-in 修正,不改合规输入)
 * - free arrow 的 w/h 不动(负值编码方向,dsl-parser.ts:143)
 * - 不破坏 roundtrip byte-equal(dsl-e2e-roundtrip.test.ts):合法小卡(如 10×10)原样往返
 *
 * 接入:apply-layout.ts 的 applyLayout 入口(所有 5+ 调用点必经,零调用方改)。
 * case 清单见 cys-stift-docs/docs/specs/2026-07-07-dsl-sanitize-layer-draft.md。
 * 当前实现:case 6(非法 size 修正)。其余 case 逐步加。
 */
import type { DslOp, DslCardOp, DslFreeOp, DslArrowOp } from './dsl-parser'

/** Sanitize 诊断(case 1/11 等亮给用户/AI 用。case 6 静默修正不产 diagnostic)。 */
export type SanitizeDiagnostic = {
  opIndex: number
  message: string
}

export interface SanitizeResult {
  ops: DslOp[]
  diagnostics: SanitizeDiagnostic[]
}

/** card/rect/frame 的 w/h MAX 上限(防 LLM 生成超大跑出可视区)。
 *  不设 MIN 下界 —— 用户/roundtrip 的合法小卡(如 10×10)必须原样往返(commit fac88bb
 *  负坐标契约的同理:合法性由"正且有限"定,不由"够大"定)。free arrow 的 w/h 不进这里。 */
const MAX_SIZE = 2000

/** w/h sanitize:非正(≤0)/非有限 → undefined(让 apply 用 shape 默认 240×120 等);
 *  超大 → MAX;合法正数(含小卡)原样保留。
 *  关键:不动合法正数(含 10×10 小卡),保 roundtrip byte-equal。 */
function sanitizeSize(n: number | undefined): number | undefined {
  if (n === undefined) return undefined
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(MAX_SIZE, n)
}

/** card op:w/h 非正 → undefined(apply 默认);超大 → MAX;合法保留。 */
function sanitizeCard(op: DslCardOp): DslCardOp {
  const w = sanitizeSize(op.w)
  const h = sanitizeSize(op.h)
  if (w === op.w && h === op.h) return op
  return { ...op, w, h }
}

/** free shape(rect/text/frame)op:同 card。 */
function sanitizeFree(op: DslFreeOp): DslFreeOp {
  const w = sanitizeSize(op.w)
  const h = sanitizeSize(op.h)
  if (w === op.w && h === op.h) return op
  return { ...op, w, h }
}

/** arrow op:w/h 不动。free arrow 的 w/h 可负(编码方向),关系箭头 w/h 是 0。
 *  case 7(dangling arrow)/case 4(端点重写)待后续加,届时在此扩展。 */
function sanitizeArrow(op: DslArrowOp): DslArrowOp {
  return op
}

/**
 * Sanitize 一批 DSL ops。纯函数,永不抛错。
 *
 * 单个 op sanitize 失败(异常或未知类型)→ 原样保留,让 apply 自己 skip。
 * 保守策略:宁可让 apply 阶段 diagnostic,也不在 sanitize 丢数据。
 *
 * @param ops parseDslWithDiagnostics 输出的 ops
 * @returns { ops: 修正后的 ops, diagnostics: 诊断(预留) }
 */
export function sanitizeDslOps(ops: DslOp[]): SanitizeResult {
  const diagnostics: SanitizeDiagnostic[] = []
  const out: DslOp[] = []
  for (const op of ops) {
    try {
      switch (op.type) {
        case 'card':
          out.push(sanitizeCard(op))
          break
        case 'free':
          out.push(sanitizeFree(op))
          break
        case 'arrow':
          out.push(sanitizeArrow(op))
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
