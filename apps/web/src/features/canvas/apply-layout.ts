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
 * - Card positions are clamped to positive coordinates
 * - Errors on individual ops are swallowed; the rest of the layout applies
 */
import type { CanvasHost } from '@cys-stift/canvas-engine'
import type { CardId } from '@cys-stift/domain'
import type { DslOp, DslFreeOp, DslArrowOp } from '../ai/dsl-parser'

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
 * (deliberate no-op), or an op that threw and was swallowed. Lines that
 * failed to *parse* never reach `applyLayout` — they are dropped by the
 * parser and reported separately via `parseDslWithDiagnostics` diagnostics.
 */
export interface ApplyResult {
  applied: number
  skipped: number
}

/**
 * Apply a list of DSL operations to the host. All operations are within
 * `host.batch()` for a single undo step.
 *
 * Returns `{ applied, skipped }`: each applyXxxOp returns `true` when it
 * mutated the host, `false` when it was a deliberate no-op (card/endpoint
 * missing). Per-op throws count as skipped so one bad op doesn't abort the
 * rest — the caller can surface "N applied, M skipped" honestly.
 *
 * Note: `skipped` covers apply-stage no-ops only. Parse-stage drops (malformed
 * lines) are not counted here — the caller (DSL dialog) pre-filters via
 * `parseDslWithDiagnostics` and surfaces those as a separate diagnostic list.
 */
export function applyLayout(host: CanvasHost, ops: DslOp[]): ApplyResult {
  if (ops.length === 0) return { applied: 0, skipped: 0 }

  let applied = 0
  let skipped = 0

  host.batch(() => {
    for (const op of ops) {
      try {
        let ok = false
        switch (op.type) {
          case 'card':
            ok = applyCardOp(host, op)
            break
          case 'free':
            ok = applyFreeOp(host, op)
            break
          case 'arrow':
            ok = applyArrowOp(host, op)
            break
        }
        if (ok) applied++
        else skipped++
      } catch {
        // Swallow per-op errors — the rest of the layout still applies.
        skipped++
      }
    }
  })

  return { applied, skipped }
}

function applyCardOp(
  host: CanvasHost,
  op: {
    type: 'card'
    cardId: CardId
    x: number
    y: number
    w?: number
    h?: number
    color?: string
  },
): boolean {
  // Partial update: preserve the existing card's w/h/rotation, override x/y
  // (and optionally color/size). Equivalent to tldraw's partial updateShape.
  const existing = host.getElement(String(op.cardId))
  if (!existing) return false

  host.upsert({
    ...existing,
    x: Math.round(op.x),
    y: Math.round(op.y),
    ...(op.w !== undefined ? { w: op.w } : {}),
    ...(op.h !== undefined ? { h: op.h } : {}),
    ...(op.color ? { color: op.color } : {}),
  })
  return true
}

function applyFreeOp(host: CanvasHost, op: DslFreeOp): boolean {
  const x = Math.round(op.x)
  const y = Math.round(op.y)

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
  })
  return true
}
