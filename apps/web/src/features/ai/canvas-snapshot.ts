'use client'

/**
 * Canvas snapshot — geometry encoding for AI (P6 v0.33.1).
 *
 * Serializes the tldraw canvas (cards + free-form shapes) into a structured
 * text block the AI can reason about for DSL layout / cluster / suggest.
 *
 * Design decisions (v0.30.0):
 * - Hand-draw content IS included, but as geometric descriptions (point
 *   sequences), NOT by parsing pixels via vision models.
 * - Closed-region detection is deferred (M3.2 evaluation).
 * - media binary is NEVER sent — only card positions and annotations.
 */

import type { CanvasId } from '@cys-stift/domain'
import type { Editor } from '@tldraw/tldraw'

// ── Shape interfaces ─────────────────────────────────────────────────────────

export interface SnapshotCard {
  id: string
  x: number
  y: number
  w: number
  h: number
  color?: string
  title: string
}

export interface SnapshotArrow {
  id: string
  from: string
  to: string
  label?: string
}

export type FreeShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number }
  | { kind: 'draw'; points: Array<{ x: number; y: number }> }
  | { kind: 'note'; x: number; y: number; text: string }

export interface CanvasSnapshotOutput {
  cards: SnapshotCard[]
  arrows: SnapshotArrow[]
  freeShapes: FreeShape[]
}

// ── Public API ───────────────────────────────────────────────────────────────

const LINE_THRESHOLD = 0.9

/** Heuristic: is a draw shape roughly a straight line? */
function isRoughLine(points: Array<{ x: number; y: number }>): {
  isLine: boolean
  x1: number
  y1: number
  x2: number
  y2: number
} {
  if (points.length < 2) return { isLine: false, x1: 0, y1: 0, x2: 0, y2: 0 }
  const first = points[0]!
  const last = points[points.length - 1]!
  const dx = last.x - first.x
  const dy = last.y - first.y
  const endpointDist = Math.sqrt(dx * dx + dy * dy)

  let pathLen = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const cur = points[i]!
    pathLen += Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2)
  }

  return {
    isLine: pathLen > 0 && endpointDist / pathLen > LINE_THRESHOLD,
    x1: first.x,
    y1: first.y,
    x2: last.x,
    y2: last.y,
  }
}

/**
 * Serialize the current tldraw canvas into a structured snapshot the AI
 * can reason about. Cards get position + title; freeform shapes are described
 * geometrically (line / rect / ellipse / draw points / note text).
 *
 * This is a pure function of the editor — no side-effects, no network.
 */
export function snapshotCanvas(
  editor: Editor,
  _canvasId: CanvasId,
): CanvasSnapshotOutput {
  const shapes = editor.getCurrentPageShapes()
  const cards: SnapshotCard[] = []
  const arrows: SnapshotArrow[] = []
  const freeShapes: FreeShape[] = []

  for (const shape of shapes) {
    const { type, id, x, y, props: shapeProps, rotation } = shape as unknown as {
      type: string
      id: string
      x: number
      y: number
      props: Record<string, unknown>
      rotation: number
    }

    if (type === 'card') {
      cards.push({
        id: String(id),
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round((shapeProps.w as number) ?? 240),
        h: Math.round((shapeProps.h as number) ?? 120),
        color: shapeProps.color as string | undefined,
        title: String(shapeProps.title ?? ''),
      })
    } else if (type === 'arrow') {
      const bindings = (shapeProps as { start?: { boundShapeId?: string }; end?: { boundShapeId?: string } })
      arrows.push({
        id: String(id),
        from: String(bindings.start?.boundShapeId ?? ''),
        to: String(bindings.end?.boundShapeId ?? ''),
        label: shapeProps.text as string | undefined,
      })
    } else if (type === 'geo') {
      const geo = (shapeProps as { geo?: string }).geo
      if (geo === 'rectangle') {
        freeShapes.push({
          kind: 'rect',
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round((shapeProps.w as number) ?? 100),
          h: Math.round((shapeProps.h as number) ?? 100),
        })
      } else if (geo === 'ellipse') {
        freeShapes.push({
          kind: 'ellipse',
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round((shapeProps.w as number) ?? 100),
          h: Math.round((shapeProps.h as number) ?? 100),
        })
      } else if (geo === 'line' || geo === 'draw') {
        // tldraw's geo line (straight line tool) — always a line
        freeShapes.push({
          kind: 'line',
          x1: Math.round(x),
          y1: Math.round(y),
          x2: Math.round(x + ((shapeProps.w as number) ?? 0)),
          y2: Math.round(y + ((shapeProps.h as number) ?? 0)),
        })
      }
    } else if (type === 'draw') {
      // Hand-draw: apply line heuristic
      const segments = shapeProps.segments as Array<{
        type: string
        points: Array<{ x: number; y: number; z?: number }>
      }> | undefined
      if (segments && segments.length > 0) {
        const allPoints: Array<{ x: number; y: number }> = []
        for (const seg of segments) {
          // Each segment's points are in local coords — offset by shape position.
          for (const pt of seg.points) {
            allPoints.push({ x: x + pt.x, y: y + pt.y })
          }
        }
        const lineCheck = isRoughLine(allPoints)
        if (lineCheck.isLine && allPoints.length <= 20) {
          freeShapes.push({
            kind: 'line',
            x1: Math.round(lineCheck.x1),
            y1: Math.round(lineCheck.y1),
            x2: Math.round(lineCheck.x2),
            y2: Math.round(lineCheck.y2),
          })
        } else {
          freeShapes.push({
            kind: 'draw',
            points: allPoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
          })
        }
      }
    } else if (type === 'note') {
      freeShapes.push({
        kind: 'note',
        x: Math.round(x),
        y: Math.round(y),
        text: String(shapeProps.text ?? ''),
      })
    } else if (type === 'text') {
      freeShapes.push({
        kind: 'note',
        x: Math.round(x),
        y: Math.round(y),
        text: String(shapeProps.text ?? ''),
      })
    }
  }

  return { cards, arrows, freeShapes }
}

/**
 * Format the snapshot as a human+AI readable text block (for prompts).
 */
export function formatCanvasSnapshot(snapshot: CanvasSnapshotOutput): string {
  const parts: string[] = []

  parts.push(
    `Canvas: ${snapshot.cards.length} cards, ${snapshot.arrows.length} arrows, ${snapshot.freeShapes.length} free shapes`,
  )

  for (const c of snapshot.cards) {
    const colorHint = c.color ? `, color ${c.color}` : ''
    parts.push(
      `\n[card #${c.id}] at (${c.x}, ${c.y}) size ${c.w}x${c.h}${colorHint}` +
        `\n  title: ${c.title || '(untitled)'}`,
    )
  }

  for (const a of snapshot.arrows) {
    const label = a.label ? `, label "${a.label}"` : ''
    parts.push(`[arrow #${a.id}] from #${a.from} to #${a.to}${label}`)
  }

  for (const fs of snapshot.freeShapes) {
    switch (fs.kind) {
      case 'line':
        parts.push(`[free shape: line from (${fs.x1}, ${fs.y1}) to (${fs.x2}, ${fs.y2})]`)
        break
      case 'rect':
        parts.push(
          `[free shape: rect at (${fs.x}, ${fs.y}) size ${fs.w}x${fs.h}]`,
        )
        break
      case 'ellipse':
        parts.push(
          `[free shape: ellipse at (${fs.x}, ${fs.y}) size ${fs.w}x${fs.h}]`,
        )
        break
      case 'draw':
        parts.push(
          `[free shape: draw] points: ${fs.points.map((p) => `(${p.x},${p.y})`).join(' ')}`,
        )
        break
      case 'note':
        parts.push(
          `[free shape: note at (${fs.x}, ${fs.y}), text "${fs.text.slice(0, 200)}"]`,
        )
        break
    }
  }

  return parts.join('\n')
}
