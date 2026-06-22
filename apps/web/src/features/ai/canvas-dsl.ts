'use client'

/**
 * Canvas DSL — the unified bidirectional text format for the canvas (Phase 0 / T3).
 *
 * `serializeCanvas(elements)` is the **canvas → text** direction (the missing
 * half before Phase 0). The **text → canvas** direction is `parseDsl` (in
 * ./dsl-parser.ts); together they round-trip the active geometric kinds.
 *
 * Grammar (active kinds only; see CanvasElementKind active/legacy split):
 *   [card #<id>] @pos(<x>,<y>) @size(<w>,<h>) @color(<c>)
 *   [rect #<id>] @pos(<x>,<y>) @size(<w>,<h>) @color(<c>)
 *   [text #<id>] @pos(<x>,<y>) @text("<t>")
 *   [arrow #<id>] from #<a> to #<b> @label("<l>") @color(<c>)
 *   [freedraw #<id>] @pos(<x>,<y>)            ← metadata only, NO point sequence
 *
 * Legacy kinds (ellipse/line/note/image) are NOT serialized — they're not in
 * the active set. freedraw emits position only; its point sequence stays in the
 * engine store (R2: hand-draw is vector; also keeps point data out of AI view).
 */
import type { CanvasElement } from '../canvas/host/canvas-host'

/** Kinds the DSL serializes. Legacy kinds are skipped. */
const DSL_KINDS: ReadonlySet<string> = new Set([
  'card',
  'rect',
  'text',
  'arrow',
  'freedraw',
])

/**
 * Serialize the canvas's active elements to a text block the AI can read.
 * Pure function of the element list — no side-effects, no engine access.
 */
export function serializeCanvas(elements: CanvasElement[]): string {
  return elements
    .filter((e) => DSL_KINDS.has(e.kind))
    .map(serializeElement)
    .filter(Boolean)
    .join('\n')
}

function serializeElement(e: CanvasElement): string {
  const pos = `@pos(${Math.round(e.x)},${Math.round(e.y)})`
  const color = e.color ? ` @color(${e.color})` : ''
  switch (e.kind) {
    case 'card':
      return `[card #${e.id}] ${pos} @size(${Math.round(e.w)},${Math.round(e.h)})${color}`
    case 'rect':
      return `[rect #${e.id}] ${pos} @size(${Math.round(e.w)},${Math.round(e.h)})${color}`
    case 'text':
      return `[text #${e.id}] ${pos} @text("${escapeQuoted(e.text ?? '')}")`
    case 'arrow':
      return (
        `[arrow #${e.id}] from #${e.from ?? ''} to #${e.to ?? ''}` +
        (e.text ? ` @label("${escapeQuoted(e.text)}")` : '') +
        color
      )
    case 'freedraw':
      // Position only — never the point sequence (R2 + privacy).
      return `[freedraw #${e.id}] ${pos}`
    default:
      // ellipse/line/note/image (legacy) — not in the DSL.
      return ''
  }
}

/** Escape double-quotes/backslashes inside a quoted DSL string value. */
function escapeQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
