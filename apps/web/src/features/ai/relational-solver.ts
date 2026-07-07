'use client'

/**
 * Relational solver(B工程 pilot)—— 解析后、apply 前,把 relational card op
 * (`right-of`/`below #anchor`)解成绝对坐标 op。纯函数,永不抛错。
 *
 * 设计(见 cys-derivative/paper/experiment/b-relational-dsl-pilot-design.md):
 * - 单遍顺序求解:rel op anchor 到**已处理**元素(同批更早 op 的绝对坐标已知,或画布已有的 card)
 * - right-of #X:x = X.x + X.w + gap;y = X.y
 * - below    #X:y = X.y + X.h + gap;x = X.x
 * - anchor 不存在(前向引用 / 指向幽灵 id)→ diagnostic(op 保留占位坐标,apply 自己 skip/create)
 * - 环检测:单遍天然防环(anchor 必须已在 geom,前向引用直接 diagnostic)
 * - 默认 card 尺寸 240×120(op.w/h undefined + 非 existing 时);existing card 用其真实 w/h
 *
 * 与 sanitize 协作:applyLayout 入口先 sanitize(修正 size/coord/id)再 solve(rel → 绝对)。
 * diagnostic 复用 SanitizeDiagnostic 形态,apply-layout 合并透出。
 */
import type { DslOp, DslCardOp } from './dsl-parser'
import type { SanitizeDiagnostic } from './dsl-sanitize'

/** 已知几何(anchor 查找用)。来自画布现有 card 或同批更早 op。 */
export interface ExistingGeom {
  x: number
  y: number
  w: number
  h: number
}

/** card 默认尺寸(与 apply-layout applyCardOp 一致:op.w ?? 240 / op.h ?? 120)。 */
const DEFAULT_CARD_W = 240
const DEFAULT_CARD_H = 120

export interface SolveResult {
  ops: DslOp[]
  diagnostics: SanitizeDiagnostic[]
}

/**
 * 解 relational card op → 绝对坐标 op。
 *
 * @param ops sanitize 后的 ops(含 rel card + 绝对 card + free + arrow)
 * @param existingGeometry 画布现有 card 的 id→几何(seed geom,让 rel 能 anchor 到画布已有 card)
 * @returns { ops: 全绝对坐标 op(rel 已剥离), diagnostics: anchor 缺失等 }
 */
export function solveRelational(
  ops: DslOp[],
  existingGeometry?: Map<string, ExistingGeom>,
): SolveResult {
  const diagnostics: SanitizeDiagnostic[] = []
  const out: DslOp[] = []

  // seed:画布现有 card 几何(复制,不污染入参)
  const geom = new Map<string, ExistingGeom>(existingGeometry)

  let i = 0
  for (const op of ops) {
    const idx = i++
    if (op.type !== 'card') {
      // free / arrow:透传(非 pilot 关系式范围)
      out.push(op)
      continue
    }

    const cardId = String(op.cardId)
    // 解析本 card 的几何宽高:op 显式 > existing 真实 > 默认
    const exist = geom.get(cardId)
    const w = op.w ?? exist?.w ?? DEFAULT_CARD_W
    const h = op.h ?? exist?.h ?? DEFAULT_CARD_H

    if (op.rel) {
      const anchor = geom.get(op.rel.anchor)
      if (!anchor) {
        // anchor 不存在(前向引用 / 幽灵 id)→ diagnostic,op 保留占位坐标
        diagnostics.push({
          opIndex: idx,
          message: `relational card #${cardId} 的 anchor #${op.rel.anchor} 不存在(画布/同批更早均无)`,
        })
        // 剥离 rel,保留占位 x/y(apply 自己 create/skip)
        const { rel: _rel, ...rest } = op
        out.push({ ...rest, w, h })
        geom.set(cardId, { x: op.x, y: op.y, w, h })
        continue
      }
      const gap = op.rel.gap
      const x = op.rel.dir === 'right-of' ? anchor.x + anchor.w + gap : anchor.x
      const y = op.rel.dir === 'below' ? anchor.y + anchor.h + gap : anchor.y
      const { rel: _rel, ...rest } = op
      out.push({ ...rest, x, y, w, h })
      geom.set(cardId, { x, y, w, h })
      continue
    }

    // 绝对 card:记录几何(供后续 rel anchor),op 原样返回(引用稳定)
    geom.set(cardId, { x: op.x, y: op.y, w, h })
    out.push(op)
  }

  return { ops: out, diagnostics }
}

/** 仅供测试/类型导出:从 DslCardOp 判定是否 relational(apply 层不直接用)。 */
export function isRelationalCard(op: DslCardOp): boolean {
  return op.rel !== undefined
}
