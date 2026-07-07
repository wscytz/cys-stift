'use client'

/**
 * Apply AI-generated layout DSL to the canvas host (P7 v0.33.2; Phase 0 / T2
 * 2026-06-22 refactored from tldraw Editor → CanvasHost).
 *
 * Takes the output of `parseDsl` and executes it against the host:
 * - Cards: update position (x, y) and optionally color (preserving w/h/rotation)
 * - Free shapes: create rectangles / ellipses / notes / lines
 * - Arrows: create with label, bound to existing card endpoints
 *
 * Design decisions (unchanged from pre-refactor):
 * - Layout runs inside host.batch() for a single undo step
 * - Missing cards are skipped (no-op); arrows missing an endpoint are skipped
 * - Card positions preserve negative coords (canvas pan allows negative); sanitize clamps size only
 * - Errors on individual ops are swallowed; the rest of the layout applies
 */
import type { CanvasHost } from '@cys-stift/canvas-engine'
import type { CardId } from '@cys-stift/domain'
import type { DslOp, DslCardOp, DslFreeOp, DslArrowOp } from '../ai/dsl-parser'
import { sanitizeDslOps } from '../ai/dsl-sanitize'

/** AI-created free shapes / arrows need a unique id (tldraw used to auto-mint). */
function uid(prefix: string): string {
  // crypto.randomUUID is available in the browser and in vitest's jsdom env.
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}-${rand}`
}

/**
 * Result of applying a DSL batch: how many ops actually mutated the host vs
 * how many were skipped at the apply stage. Used by the DSL dialog to give
 * honest feedback instead of always reporting ops.length.
 *
 * `skipped` here ONLY counts apply-stage no-ops: a missing card/endpoint
 * (deliberate no-op), an op that threw and was swallowed, OR an op that was
 * already applied and skipped by the incremental cache. Lines that failed to
 * *parse* never reach `applyLayout` — they are dropped by the parser and
 * reported separately via `parseDslWithDiagnostics` diagnostics.
 */
export interface ApplyResult {
  applied: number
  skipped: number
  newlyApplied: string[]
}

/**
 * Apply a list of DSL operations to the host. All operations are within
 * `host.batch()` for a single undo step.
 *
 * If `appliedHashes` is provided, only ops with hashes not in the set are
 * applied (incremental apply optimization). Matching hashes are skipped.
 * Newly applied hashes are added to the set and returned as `newlyApplied`.
 *
 * Returns `{ applied, skipped, newlyApplied }`: each applyXxxOp returns `true`
 * when it mutated the host, `false` when it was a deliberate no-op (card/endpoint
 * missing). Per-op throws count as skipped so one bad op doesn't abort the
 * rest — the caller can surface "N applied, M skipped" honestly.
 *
 * Note: `skipped` covers apply-stage no-ops only. Parse-stage drops (malformed
 * lines) are not counted here — the caller (DSL dialog) pre-filters via
 * `parseDslWithDiagnostics` and surfaces those as a separate diagnostic list.
 */
export function applyLayout(
  host: CanvasHost,
  ops: DslOp[],
  appliedHashes?: Set<string>,
  onCardCreate?: (params: { cardId: string; x: number; y: number; w: number; h: number; color?: string }) => void,
): ApplyResult {
  // Sanitize:修正 LLM 常见错误(非法 size 等)。纯函数,永不抛错。放 hash 前,
  // 让 appliedHashes 基于 sanitized op(一致)。diagnostics 暂不透出 UI(后续 case 1/11)。
  const cleanOps = sanitizeDslOps(ops).ops

  if (cleanOps.length === 0) return { applied: 0, skipped: 0, newlyApplied: [] }

  let applied = 0
  let skipped = 0
  const newlyApplied: string[] = []

  host.batch(() => {
    for (const op of cleanOps) {
      const hash = JSON.stringify(op)
      if (appliedHashes?.has(hash)) {
        skipped++
        continue
      }
      try {
        let ok = false
        switch (op.type) {
          case 'card':
            ok = applyCardOp(host, op, onCardCreate)
            break
          case 'free':
            ok = applyFreeOp(host, op)
            break
          case 'arrow':
            ok = applyArrowOp(host, op)
            break
        }
        if (ok) {
          applied++
          if (appliedHashes !== undefined) {
            appliedHashes.add(hash)
            newlyApplied.push(hash)
          }
        } else {
          skipped++
        }
      } catch {
        // Swallow per-op errors — the rest of the layout still applies.
        skipped++
      }
    }
  })

  return { applied, skipped, newlyApplied }
}

/** Math.round + 有限性守卫:AI/用户输入 @pos(1e309) → Number 得 Infinity,
 *  存进元素后 JSON.stringify 序列化成 null → reload 变 0(静默坐标损坏)。
 *  非有限值回落 fallback(已有元素保留原坐标,新建元素用 0)。 */
function finiteRound(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback
}

function applyCardOp(
  host: CanvasHost,
  op: DslCardOp,
  onCardCreate?: (params: { cardId: string; x: number; y: number; w: number; h: number; color?: string }) => void,
): boolean {
  // Partial update: preserve the existing card's w/h/rotation, override x/y
  // (and optionally color/size). Equivalent to tldraw's partial updateShape.
  const existing = host.getElement(String(op.cardId))
  if (!existing) {
    if (!op.create) {
      // No create flag: skip with no-op
      return false
    }
    // create flag is set: create an empty card if it doesn't exist.
    // If a create callback was supplied, call it first (DSL id + geometry)
    // so the web layer can persist the Card row before geometry is upserted
    // under the same DSL id (BUG-A engine side).
    const x = finiteRound(op.x, 0)
    const y = finiteRound(op.y, 0)
    const w = op.w ?? 240
    const h = op.h ?? 120
    onCardCreate?.({ cardId: String(op.cardId), x, y, w, h, color: op.color })
    host.upsert({
      id: String(op.cardId),
      kind: 'card',
      x,
      y,
      w,
      h,
      rotation: 0,
      color: op.color ?? 'white',
    })
    return true
  }

  host.upsert({
    ...existing,
    x: finiteRound(op.x, existing.x),
    y: finiteRound(op.y, existing.y),
    ...(op.w !== undefined ? { w: op.w } : {}),
    ...(op.h !== undefined ? { h: op.h } : {}),
    ...(op.color ? { color: op.color } : {}),
  })
  return true
}

function applyFreeOp(host: CanvasHost, op: DslFreeOp): boolean {
  const x = finiteRound(op.x, 0)
  const y = finiteRound(op.y, 0)

  // ── Update path: op.id 命中已有同 kind 元素 → 覆盖提供的字段,保留其余 ──
  // rect op 只更新 rect,text op 只更新 text(防跨 kind 误更新)。
  if (op.id) {
    const existing = host.getElement(op.id)
    if (existing && existing.kind === op.shape) {
      host.upsert({
        ...existing,
        x,
        y,
        ...(op.w !== undefined ? { w: op.w } : {}),
        ...(op.h !== undefined ? { h: op.h } : {}),
        ...(op.color ? { color: op.color } : {}),
        // text 变体才有 op.text;判别联合 narrow 后访问(undefined 时不覆盖)。
        ...('text' in op && op.text !== undefined ? { text: op.text } : {}),
      })
      return true
    }
  }

  // ── Create path ──
  const base = { id: uid('free'), x, y, rotation: 0 } as const
  switch (op.shape) {
    case 'rect':
      host.upsert({ ...base, kind: 'rect', w: op.w ?? 200, h: op.h ?? 150, color: op.color ?? 'black' })
      break
    case 'text':
      host.upsert({
        ...base,
        kind: 'text',
        w: op.w ?? 100,
        h: op.h ?? 40,
        text: op.text ?? '',
        ...(op.color ? { color: op.color } : {}),
      })
      break
    case 'frame':
      host.upsert({
        ...base,
        kind: 'frame',
        w: op.w ?? 400,
        h: op.h ?? 300,
        text: op.text ?? '',
        color: op.color ?? 'blue',
      })
      break
  }
  return true
}

function applyArrowOp(host: CanvasHost, op: DslArrowOp): boolean {
  // wikilink meta 应用:op.wikilink=true → host 元素 meta.wikilink=true。
  // create 路径:新建时直接带 meta;update 路径:在各自的 existing.meta 上就地合并
  // (inline 在每个 update 分支,保留 existing.meta 的其他键)。
  const wikilinkMetaForCreate =
    op.wikilink === true ? { meta: { wikilink: true } } : {}

  // ── 自由箭头:无 from/to,bbox 编码线段(w/h 可负表方向)──
  // 既认显式 freeArrow 标记,也认 from/to 都空串的兜底(防御 parse 端漏标)。
  if (op.freeArrow || (!op.from && !op.to)) {
    // Update-in-place path: op.id 命中已有 arrow → 改 bbox + 关系签名,
    // 显式清掉 from/to(自由箭头无端点)。
    if (op.id) {
      const existing = host.getElement(op.id)
      if (existing && existing.kind === 'arrow') {
        host.upsert({
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
          ...(op.wikilink === true
            ? {
                meta: {
                  ...((existing.meta as Record<string, unknown> | undefined) ?? {}),
                  wikilink: true,
                },
              }
            : {}),
        })
        return true
      }
    }
    // Create path:自由箭头无需端点存在(关系箭头 create 要求端点存在,自由箭头不要求)。
    host.upsert({
      id: uid('arrow'),
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
      ...wikilinkMetaForCreate,
    })
    return true
  }

  // ── 关系箭头:现有逻辑不变 ──
  // Update-in-place path: if the op carries an id and the host already has
  // that arrow, rewrite its relation signature (dash/arrowhead/color/label)
  // while keeping from/to — this lets the AI change an existing arrow's
  // semantics instead of stacking a duplicate. (DSL symmetry fix 1.)
  if (op.id) {
    const existing = host.getElement(op.id)
    if (existing && existing.kind === 'arrow') {
      host.upsert({
        ...existing,
        ...(op.dash ? { dash: op.dash } : {}),
        ...(op.arrowhead ? { arrowhead: op.arrowhead } : {}),
        ...(op.color ? { color: op.color } : {}),
        ...(op.label !== undefined ? { text: op.label } : {}),
        ...(op.curve ? { curve: op.curve } : {}),
        ...(op.route ? { route: op.route } : {}),
        ...(op.elbow ? { elbow: op.elbow } : {}),
        ...(op.wikilink === true
          ? {
              meta: {
                ...((existing.meta as Record<string, unknown> | undefined) ?? {}),
                wikilink: true,
              },
            }
          : {}),
      })
      return true
    }
  }

  // Create path (original behavior): mint a new arrow bound to two endpoints.
  // Skip if either endpoint doesn't exist (was a no-op pre-refactor too).
  const fromEl = host.getElement(op.from)
  const toEl = host.getElement(op.to)
  if (!fromEl || !toEl) return false

  host.upsert({
    id: uid('arrow'),
    kind: 'arrow',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    from: op.from,
    to: op.to,
    text: op.label ?? '',
    color: op.color ?? 'black',
    ...(op.dash ? { dash: op.dash } : {}),
    ...(op.arrowhead ? { arrowhead: op.arrowhead } : {}),
    ...(op.curve ? { curve: op.curve } : {}),
    ...(op.route ? { route: op.route } : {}),
    ...(op.elbow ? { elbow: op.elbow } : {}),
    ...wikilinkMetaForCreate,
  })
  return true
}
