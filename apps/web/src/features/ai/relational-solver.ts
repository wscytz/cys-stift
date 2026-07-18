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
import { DSL_MAX_COORD } from './dsl-sanitize'

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
  // anchor 缺失的 card(占位 geom)→ 依赖它的下游 rel 也判 broken,产链式 diagnostic
  // (否则下游会静默解析到占位坐标,用户看到卡在怪位置无信号)
  const brokenAnchors = new Set<string>()

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
        // 标 broken:下游 anchor 到本卡的 rel 也会得链式 diagnostic(否则静默解析到占位)
        brokenAnchors.add(cardId)
        // 剥离 rel,保留占位 x/y(apply 自己 create/skip)
        const { rel: _rel, ...rest } = op
        out.push({ ...rest, w, h })
        geom.set(cardId, { x: op.x, y: op.y, w, h })
        continue
      }
      // 传递性断链:anchor 存在但本身是 broken 占位 → 本卡也判 broken + diagnostic(链式传播)
      if (brokenAnchors.has(op.rel.anchor)) {
        diagnostics.push({
          opIndex: idx,
          message: `relational card #${cardId} 的 anchor #${op.rel.anchor} 上游 anchor 缺失(链式占位,坐标可能不符预期)`,
        })
        brokenAnchors.add(cardId)
      }
      const gap = op.rel.gap
      const ax = op.rel.dir === 'right-of' ? anchor.x + anchor.w + gap : anchor.x
      const ay = op.rel.dir === 'below' ? anchor.y + anchor.h + gap : anchor.y
      // 碰撞避让:沿关系轴(below→y / right-of→x)推开已置 card,消除参照系碰撞
      const { x, y } = resolveCollision(
        ax,
        ay,
        w,
        h,
        op.rel.dir === 'below' ? 'y' : 'x',
        geom,
        gap,
        cardId,
      )
      const { rel: _rel, ...rest } = op
      out.push({ ...rest, x, y, w, h })
      geom.set(cardId, { x, y, w, h })
      continue
    }

    // 绝对 card:记录几何(供后续 rel anchor),op 原样返回(引用稳定)
    geom.set(cardId, { x: op.x, y: op.y, w, h })
    out.push(op)
  }

  const validated = validateSolvedCoordinates(out, existingGeometry)
  return {
    ops: validated.ops,
    diagnostics: [...diagnostics, ...validated.diagnostics],
  }
}

/** 仅供测试/类型导出:从 DslCardOp 判定是否 relational(apply 层不直接用)。 */
export function isRelationalCard(op: DslCardOp): boolean {
  return op.rel !== undefined
}

/** AABB 相交(严格 >0 重叠面积)。纯函数,永不抛错。 */
function rectsOverlap(a: ExistingGeom, b: ExistingGeom): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * 碰撞避让:card (ax,ay,w,h) 若与 geom 里任何已置 card 相交,沿 axis 单向推进越过障碍,
 * 直到无相交(单调有界,每轮至少越过一张,≤ geom.size 轮收敛)。
 *
 * 为什么沿「关系自己的轴」:below 的 x 由 anchor 固定(列归属)→ 推 y 守列;
 * right-of 的 y 由 anchor 固定(行归属)→ 推 x 守行。语义最保真。
 * clearance = 该 card 的 @gap(与 anchor 间距一致,避让后视觉间距均匀)。
 *
 * 单遍不破依赖:anchor 在 op 序更早 → 避让时所有相关 card 已最终落位;后续 right-of/below
 * 本 card 的 op 用本 card 避让后的最终 geom 派生,自动跟随,无需级联。
 */
function resolveCollision(
  ax: number,
  ay: number,
  w: number,
  h: number,
  axis: 'x' | 'y',
  geom: Map<string, ExistingGeom>,
  clearance: number,
  selfId: string,
): { x: number; y: number } {
  // clearance 钳 ≥0:负 @gap(parser 接受负数)会让推进推不过障碍(新坐标仍相交)→ 跑满 max 轮残留重叠。
  // 钳 0 后负 gap 退化为"卡片贴合"(clearance=0,严格 >0 不算重叠),避让仍保证清空、且必收敛。
  const clr = Math.max(0, clearance)
  let x = ax
  let y = ay
  // 每轮扫所有已置 card,越过最深相交障碍;无相交则停。坐标只增 → 必收敛。
  // 上界 geom.size+1:最坏每轮新揭一张障碍(N 张需 N 轮越过 + 1 轮确认无相交),故 max=geom.size+1。
  for (let iter = 0, max = geom.size + 1; iter < max; iter++) {
    let bumped = false
    for (const [id, g] of geom) {
      if (id === selfId) continue
      if (rectsOverlap({ x, y, w, h }, g)) {
        if (axis === 'y') y = Math.max(y, g.y + g.h + clr)
        else x = Math.max(x, g.x + g.w + clr)
        bumped = true
      }
    }
    if (!bumped) break
  }
  return { x, y }
}

/**
 * solve 后的第二道坐标门。关系偏移和碰撞推进都可能把已 sanitize 的输入重新推到
 * 边界外；这里钳回统一坐标域，并在钳位造成重叠时明确诊断。
 */
function validateSolvedCoordinates(
  ops: DslOp[],
  existingGeometry?: Map<string, ExistingGeom>,
): SolveResult {
  const diagnostics: SanitizeDiagnostic[] = []
  const geom = new Map<string, ExistingGeom>(existingGeometry)
  const validated = ops.map((op, opIndex) => {
    if (op.type !== 'card') return op

    const id = String(op.cardId)
    const existing = geom.get(id)
    const w = op.w ?? existing?.w ?? DEFAULT_CARD_W
    const h = op.h ?? existing?.h ?? DEFAULT_CARD_H
    const x = Math.min(DSL_MAX_COORD, Math.max(-DSL_MAX_COORD, op.x))
    const y = Math.min(DSL_MAX_COORD, Math.max(-DSL_MAX_COORD, op.y))
    const changed = x !== op.x || y !== op.y
    const next = { x, y, w, h }

    if (changed) {
      diagnostics.push({
        opIndex,
        message: `relational card #${id} 的坐标已限制到 +/-${DSL_MAX_COORD} 边界`,
      })
      for (const [otherId, other] of geom) {
        if (otherId === id) continue
        if (rectsOverlap(next, other)) {
          diagnostics.push({
            opIndex,
            message: `card #${id} 在坐标边界钳位后与 #${otherId} 碰撞`,
          })
          break
        }
      }
    }

    geom.set(id, next)
    return changed ? { ...op, x, y } : op
  })

  return { ops: validated, diagnostics }
}
