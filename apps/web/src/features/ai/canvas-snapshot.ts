'use client'

/**
 * Canvas snapshot — geometry + titles encoding for AI (P6 v0.33.1; Phase 0 / T4
 * 2026-06-22 refactored from tldraw Editor → CanvasHost + CardService).
 *
 * Serializes the canvas (cards + free-form shapes) into a structured snapshot +
 * a text block the AI can reason about for DSL layout / cluster / suggest.
 *
 * Design decisions:
 * - Card TITLES are included (AI needs content to group/cluster) — read from
 *   CardService, never from the host element (which carries geometry only).
 * - Hand-draw (freedraw) is included as **position only** — NEVER the point
 *   sequence (R2: hand-draw is vector; also keeps bulk point data out of the
 *   AI view). No vision models (permanent decision).
 * - media binary / deviceId / soft-deleted cards are never in the snapshot
 *   (soft-deleted cards aren't on the host; deviceId isn't geometry).
 */
import type { CanvasId, CardId, CardService } from '@cys-stift/domain'
import type { CanvasHost } from '../canvas/host/canvas-host'

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
  /** 关系签名(语义三维:颜色 + 线型 + 箭头形)。AI 改签名需要先看到现状。 */
  color?: string
  dash?: 'solid' | 'dashed' | 'dotted'
  arrowhead?: 'arrow' | 'triangle' | 'none'
}

export type FreeShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number }
  | { kind: 'note'; x: number; y: number; text: string }
  | { kind: 'freedraw'; x: number; y: number }

export interface CanvasSnapshotOutput {
  cards: SnapshotCard[]
  arrows: SnapshotArrow[]
  freeShapes: FreeShape[]
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Serialize the current canvas (via the host) into a structured snapshot the AI
 * can reason about. Cards get position + title (from CardService); freeform
 * shapes are described geometrically. Freedraw is position-only (no points).
 *
 * Pure function of the host + service — no side-effects, no network, no engine
 * import.
 */
export function snapshotCanvas(
  host: CanvasHost,
  service: CardService,
  _canvasId: CanvasId,
): CanvasSnapshotOutput {
  const cards: SnapshotCard[] = []
  const arrows: SnapshotArrow[] = []
  const freeShapes: FreeShape[] = []

  for (const el of host.getElements()) {
    const x = Math.round(el.x)
    const y = Math.round(el.y)
    switch (el.kind) {
      case 'card': {
        // Title from CardService (content source of truth), not the element.
        const card = service.get(el.id as CardId)
        cards.push({
          id: el.id,
          x,
          y,
          w: Math.round(el.w),
          h: Math.round(el.h),
          color: el.color,
          title: card?.title ?? '',
        })
        break
      }
      case 'arrow':
        arrows.push({
          id: el.id,
          from: el.from ?? '',
          to: el.to ?? '',
          label: el.text,
          color: el.color,
          dash: el.dash,
          arrowhead: el.arrowhead,
        })
        break
      case 'rect':
        freeShapes.push({ kind: 'rect', x, y, w: Math.round(el.w), h: Math.round(el.h) })
        break
      case 'ellipse':
        freeShapes.push({ kind: 'ellipse', x, y, w: Math.round(el.w), h: Math.round(el.h) })
        break
      case 'text':
      case 'note':
        freeShapes.push({ kind: 'note', x, y, text: el.text ?? '' })
        break
      case 'freedraw':
        // Position only — NEVER the point sequence (R2 + privacy).
        freeShapes.push({ kind: 'freedraw', x, y })
        break
      default:
        // line/image (legacy) — not surfaced to the AI.
        break
    }
  }

  return { cards, arrows, freeShapes }
}

/**
 * Format the snapshot as a human+AI readable text block (for prompts).
 * Grammar stays close to the round-trip DSL (serializeCanvas) so the model
 * sees a consistent shape; card titles are annotated on a second line.
 */
export function formatCanvasSnapshot(snapshot: CanvasSnapshotOutput): string {
  const parts: string[] = []

  parts.push(
    `Canvas: ${snapshot.cards.length} cards, ${snapshot.arrows.length} arrows, ${snapshot.freeShapes.length} free shapes`,
  )

  for (const c of snapshot.cards) {
    const colorHint = c.color ? `, color ${c.color}` : ''
    parts.push(
      `[card #${c.id}] @pos(${c.x}, ${c.y}) @size(${c.w}x${c.h})${colorHint}`,
    )
    parts.push(`  title: ${c.title || '(untitled)'}`)
  }

  for (const a of snapshot.arrows) {
    // 输出完整关系签名(颜色 + 线型 + 箭头形),让 AI 看到现状并能改。
    const seg: string[] = [`[arrow #${a.id}] from #${a.from} to #${a.to}`]
    if (a.label) seg.push(`@label("${a.label}")`)
    if (a.color) seg.push(`@color(${a.color})`)
    if (a.dash) seg.push(`@dash(${a.dash})`)
    if (a.arrowhead) seg.push(`@arrowhead(${a.arrowhead})`)
    parts.push(seg.join(' '))
  }

  for (const fs of snapshot.freeShapes) {
    switch (fs.kind) {
      case 'rect':
        parts.push(`[rect] @pos(${fs.x}, ${fs.y}) @size(${fs.w}x${fs.h})`)
        break
      case 'ellipse':
        parts.push(`[ellipse] @pos(${fs.x}, ${fs.y}) @size(${fs.w}x${fs.h})`)
        break
      case 'note':
        parts.push(`[text] @pos(${fs.x}, ${fs.y}) @text("${fs.text.slice(0, 200)}")`)
        break
      case 'freedraw':
        // Position only — no points.
        parts.push(`[freedraw] @pos(${fs.x}, ${fs.y})`)
        break
    }
  }

  return parts.join('\n')
}
