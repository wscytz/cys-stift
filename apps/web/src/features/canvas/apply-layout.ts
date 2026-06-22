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
import type { CanvasHost } from './host/canvas-host'
import type { CardId } from '@cys-stift/domain'
import type { DslOp } from '../ai/dsl-parser'

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
 * Apply a list of DSL operations to the host. All operations are within
 * `host.batch()` for a single undo step.
 */
export function applyLayout(host: CanvasHost, ops: DslOp[]): void {
  if (ops.length === 0) return

  host.batch(() => {
    for (const op of ops) {
      try {
        switch (op.type) {
          case 'card':
            applyCardOp(host, op)
            break
          case 'free':
            applyFreeOp(host, op)
            break
          case 'arrow':
            applyArrowOp(host, op)
            break
        }
      } catch {
        // Swallow per-op errors — the rest of the layout still applies.
      }
    }
  })
}

function applyCardOp(
  host: CanvasHost,
  op: { type: 'card'; cardId: CardId; x: number; y: number; color?: string },
) {
  // Partial update: preserve the existing card's w/h/rotation, override x/y
  // (and optionally color). Equivalent to tldraw's partial updateShape.
  const existing = host.getElement(String(op.cardId))
  if (!existing) return

  host.upsert({
    ...existing,
    x: Math.max(0, Math.round(op.x)),
    y: Math.max(0, Math.round(op.y)),
    ...(op.color ? { color: op.color } : {}),
  })
}

function applyFreeOp(
  host: CanvasHost,
  op: {
    type: 'free'
    shape: 'rect' | 'ellipse' | 'line' | 'note'
    x: number
    y: number
    w?: number
    h?: number
    color?: string
    text?: string
  },
) {
  const w = op.w ?? 200
  const h = op.h ?? 150
  const x = Math.max(0, Math.round(op.x))
  const y = Math.max(0, Math.round(op.y))
  const base = { id: uid('free'), x, y, rotation: 0 } as const

  switch (op.shape) {
    case 'rect':
      host.upsert({ ...base, kind: 'rect', w, h, color: op.color ?? 'black' })
      break
    case 'ellipse':
      host.upsert({ ...base, kind: 'ellipse', w, h, color: op.color ?? 'black' })
      break
    case 'note':
      host.upsert({
        ...base,
        kind: 'note',
        w: 200,
        h: 200,
        color: op.color ?? 'yellow',
        text: op.text ?? '',
      })
      break
    case 'line':
      host.upsert({ ...base, kind: 'line', w, h: 0, color: op.color ?? 'black' })
      break
  }
}

function applyArrowOp(
  host: CanvasHost,
  op: {
    type: 'arrow'
    from: string
    to: string
    label?: string
    color?: string
  },
) {
  // Skip if either endpoint doesn't exist (was a no-op pre-refactor too).
  const fromEl = host.getElement(op.from)
  const toEl = host.getElement(op.to)
  if (!fromEl || !toEl) return

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
  })
}
