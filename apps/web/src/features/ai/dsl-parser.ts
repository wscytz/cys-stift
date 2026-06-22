'use client'

/**
 * DSL Parser — parses AI output for canvas layout (P6 v0.33.1).
 *
 * The AI outputs a DSL block like:
 *
 *   [card #abc123] @pos(300, 400) @color(blue)
 *   [free: rect at (100, 200) size 300x400] @color(red)
 *   [arrow #arr1] @label("references")
 *
 * The parser extracts these directives into typed operations that
 * `applyLayout(editor, ops)` can execute.
 */

import type { CardId } from '@cys-stift/domain'

// ── Operation types ──────────────────────────────────────────────────────────

export type DslCardOp = {
  type: 'card'
  cardId: CardId
  x: number
  y: number
  color?: string
}

export type DslFreeOp = {
  type: 'free'
  /** Element id (round-trip with serializeCanvas's `[rect #id]` / `[text #id]`). */
  id?: string
  shape: 'rect' | 'ellipse' | 'line' | 'note' | 'text'
  x: number
  y: number
  w?: number
  h?: number
  color?: string
  text?: string
}

export type DslArrowOp = {
  type: 'arrow'
  from: string
  to: string
  label?: string
  color?: string
}

export type DslOp = DslCardOp | DslFreeOp | DslArrowOp

// ── Parser ───────────────────────────────────────────────────────────────────

/** Card reference: `#id` or `shape:cardId` */
const ID_RE = /#([a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)/

/** Position directive: `@pos(300, 400)` or inline `at (300, 400)` */
const POS_RE = /@pos\((\d+),\s*(\d+)\)/
const AT_RE = /at\s+\((\d+),\s*(\d+)\)/

/** Color directive: `@color\((red|yellow|blue|black|white|gray|teal|pink|orange|purple|green)\)` */
const COLOR_RE = /@color\(([a-z]+)\)/

/** Label directive: `@label\("([^"]*)"\)` */
const LABEL_RE = /@label\("([^"]*)"\)/

/** Text directive: `@text("...")` — escape-aware (serializeCanvas escapes quotes/backslashes). */
const TEXT_RE = /@text\("((?:[^"\\]|\\.)*)"\)/

/** Size directive: `@size\((\d+),\s*(\d+)\)` or inline `size 300x400` */
const SIZE_RE = /@size\((\d+),\s*(\d+)\)/
const SIZE_INLINE_RE = /size\s+(\d+)x(\d+)/

function extractId(text: string): string | null {
  const m = text.match(ID_RE)
  return m ? m[1]! : null
}

function extractPos(text: string): { x: number; y: number } | null {
  let m = text.match(POS_RE)
  if (m) return { x: parseInt(m[1]!, 10), y: parseInt(m[2]!, 10) }
  m = text.match(AT_RE)
  if (m) return { x: parseInt(m[1]!, 10), y: parseInt(m[2]!, 10) }
  return null
}

function extractColor(text: string): string | undefined {
  const m = text.match(COLOR_RE)
  return m?.[1]
}

function extractLabel(text: string): string | undefined {
  const m = text.match(LABEL_RE)
  return m?.[1] || undefined
}

/** Extract + unescape an `@text("...")` value (inverse of serializeCanvas's escapeQuoted). */
function extractText(text: string): string | undefined {
  const m = text.match(TEXT_RE)
  if (!m) return undefined
  return m[1]!.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function extractSize(text: string): { w: number; h: number } | null {
  let m = text.match(SIZE_RE)
  if (m) return { w: parseInt(m[1]!, 10), h: parseInt(m[2]!, 10) }
  m = text.match(SIZE_INLINE_RE)
  if (m) return { w: parseInt(m[1]!, 10), h: parseInt(m[2]!, 10) }
  return null
}

/**
 * Parse a DSL block (the AI's output) into a list of layout operations.
 *
 * Graceful: unrecognized lines are skipped (no throw). The DSL is
 * intended for AI-to-machine communication — if the AI produces
 * invalid syntax, we silently ignore bad lines.
 */
export function parseDsl(dslText: string): DslOp[] {
  const lines = dslText.split('\n').map((l) => l.trim()).filter(Boolean)
  const ops: DslOp[] = []

  for (const line of lines) {
    // ── Card line: `[card #abc123] @pos(300, 400)`
    if (line.startsWith('[card ')) {
      const id = extractId(line)
      if (!id) continue
      const pos = extractPos(line)
      if (!pos) continue
      ops.push({
        type: 'card',
        cardId: id as CardId,
        x: pos.x,
        y: pos.y,
        color: extractColor(line),
      })
      continue
    }

    // ── Arrow line: `[arrow #arr1] from #a to #b @label("ref")`
    if (line.startsWith('[arrow ')) {
      const id = extractId(line)
      if (!id) continue
      // Extract `from` and `to` references from the text
      const fromMatch = line.match(/from\s+(#[a-zA-Z0-9_-]+)/)
      const toMatch = line.match(/to\s+(#[a-zA-Z0-9_-]+)/)
      // Skip arrows missing either endpoint — applyLayout would no-op them
      // anyway (editor.getShape('shape:') → undefined), but skipping here
      // keeps the op list honest. (v0.37.0 review.)
      if (!fromMatch || !toMatch) continue
      ops.push({
        type: 'arrow',
        from: fromMatch[1]?.replace('#', '') ?? '',
        to: toMatch[1]?.replace('#', '') ?? '',
        label: extractLabel(line),
        color: extractColor(line),
      })
      continue
    }

    // ── Rect line (Phase 0 / T3 unified grammar): `[rect #id] @pos(x,y) @size(w,h) @color(c)`
    if (line.startsWith('[rect ')) {
      const id = extractId(line)
      if (!id) continue
      const pos = extractPos(line)
      if (!pos) continue
      const size = extractSize(line)
      ops.push({
        type: 'free',
        id,
        shape: 'rect',
        x: pos.x,
        y: pos.y,
        w: size?.w,
        h: size?.h,
        color: extractColor(line),
      })
      continue
    }

    // ── Text line (Phase 0 / T3): `[text #id] @pos(x,y) @text("...")`
    if (line.startsWith('[text ')) {
      const id = extractId(line)
      if (!id) continue
      const pos = extractPos(line)
      if (!pos) continue
      ops.push({
        type: 'free',
        id,
        shape: 'text',
        x: pos.x,
        y: pos.y,
        text: extractText(line),
      })
      continue
    }

    // ── Free shape lines: `[free: rect at (100, 200) size 300x400]`
    if (line.startsWith('[free: ') || line.startsWith('[free shape: ')) {
      const shapeMatch = line.match(
        /\[free(?:\s+shape)?:\s*(rect|ellipse|line|note|draw)/,
      )
      if (!shapeMatch) continue
      const shapeKind = shapeMatch[1]!

      const pos = extractPos(line)
      const size = extractSize(line)

      if (shapeKind === 'line') {
        // Line doesn't need pos/size — just note it exists
        ops.push({
          type: 'free',
          shape: 'line',
          x: pos?.x ?? 0,
          y: pos?.y ?? 0,
          color: extractColor(line),
        })
      } else {
        ops.push({
          type: 'free',
          shape: shapeKind as 'rect' | 'ellipse' | 'note',
          x: pos?.x ?? 0,
          y: pos?.y ?? 0,
          w: size?.w,
          h: size?.h,
          color: extractColor(line),
        })
      }
      continue
    }
  }

  return ops
}
