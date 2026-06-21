'use client'

/**
 * Apply AI-generated layout DSL to the tldraw canvas (P7 v0.33.2).
 *
 * Takes the output of `parseDsl` and executes it against the editor:
 * - Cards: update position (x, y) and optionally color
 * - Free shapes: create or reposition rectangles / ellipses / notes
 * - Arrows: create or reposition with label
 *
 * Design decisions:
 * - Layout is idempotent — running the same DSL twice produces the same result
 * - Missing shapes are created (for free shapes / arrows the AI might add)
 * - Card positions are clamped to positive coordinates
 * - Errors on individual shapes are swallowed; the rest of the layout applies
 */

import type { Editor } from '@tldraw/tldraw'
import type { CardId } from '@cys-stift/domain'
import type { DslOp } from '../ai/dsl-parser'

/**
 * Apply a list of DSL operations to the editor. All operations are within
 * `editor.batch()` for a single undo step.
 */
export function applyLayout(editor: Editor, ops: DslOp[]): void {
  if (ops.length === 0) return

  editor.batch(() => {
    for (const op of ops) {
      try {
        switch (op.type) {
          case 'card':
            applyCardOp(editor, op)
            break
          case 'free':
            applyFreeOp(editor, op)
            break
          case 'arrow':
            applyArrowOp(editor, op)
            break
        }
      } catch {
        // Swallow per-op errors — the rest of the layout still applies.
      }
    }
  })
}

function applyCardOp(
  editor: Editor,
  op: { type: 'card'; cardId: CardId; x: number; y: number; color?: string },
) {
  const shapeId = `shape:${String(op.cardId)}`
  const shape = editor.getShape(shapeId as never)
  if (!shape) return

  editor.updateShape({
    id: shapeId as never,
    type: 'card',
    x: Math.max(0, Math.round(op.x)),
    y: Math.max(0, Math.round(op.y)),
    ...(op.color ? { props: { color: op.color } } : {}),
  } as never)
}

function applyFreeOp(
  editor: Editor,
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

  switch (op.shape) {
    case 'rect':
      editor.createShape({
        type: 'geo',
        x,
        y,
        props: {
          geo: 'rectangle',
          w,
          h,
          color: op.color ?? 'black',
        },
      })
      break
    case 'ellipse':
      editor.createShape({
        type: 'geo',
        x,
        y,
        props: {
          geo: 'ellipse',
          w,
          h,
          color: op.color ?? 'black',
        },
      })
      break
    case 'note':
      editor.createShape({
        type: 'note',
        x,
        y,
        props: {
          color: op.color ?? 'yellow',
          text: op.text ?? '',
        },
      })
      break
    case 'line':
      editor.createShape({
        type: 'geo',
        x,
        y,
        props: {
          geo: 'line',
          w,
          h: 0,
          color: op.color ?? 'black',
        },
      })
      break
  }
}

function applyArrowOp(
  editor: Editor,
  op: {
    type: 'arrow'
    from: string
    to: string
    label?: string
    color?: string
  },
) {
  const fromId = `shape:${op.from}`
  const toId = `shape:${op.to}`

  const fromShape = editor.getShape(fromId as never)
  const toShape = editor.getShape(toId as never)
  if (!fromShape || !toShape) return

  editor.createShape({
    type: 'arrow',
    props: {
      start: { type: 'binding', boundShapeId: fromId, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false },
      end: { type: 'binding', boundShapeId: toId, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false },
      text: op.label ?? '',
      color: op.color ?? 'black',
    },
  })
}
