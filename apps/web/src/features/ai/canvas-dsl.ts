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
 *   [text #<id>] @pos(<x>,<y>) @text("<t>") @color(<c>)
 *   [arrow #<id>] from #<a> to #<b> @label("<l>") @color(<c>) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)
 *   [freedraw #<id>] @pos(<x>,<y>)            ← metadata only, NO point sequence
 *
 * Legacy kinds (ellipse/line/note/image) are NOT serialized — they're not in
 * the active set. freedraw emits position only; its point sequence stays in the
 * engine store (R2: hand-draw is vector; also keeps point data out of AI view).
 */
import type { CanvasElement } from '@cys-stift/canvas-engine'

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

/**
 * 面向人的可读序列化:每元素一行(同 serializeCanvas),但 card 行后附
 * `  # title: <title>` 注释行,让人在 DSL 编辑器里看到卡片内容。
 * 注释行不匹配 parseDsl 的 `[kind ` 前缀 → 被静默跳过,不影响 apply。
 *
 * getCardTitle: 可选,card id → title(从 CardService 读)。无则注释附 (untitled)。
 * 非 card 元素不附注释。title 中的换行被压成空格,避免破坏单行结构。
 */
export function serializeCanvasReadable(
  elements: CanvasElement[],
  getCardTitle?: (id: string) => string | undefined,
): string {
  const lines: string[] = []
  for (const e of elements) {
    const line = serializeElement(e)
    if (!line) continue
    lines.push(line)
    if (e.kind === 'card') {
      const rawTitle = getCardTitle?.(e.id) || '(untitled)'
      // 防御:title 含换行会破坏单行注释结构,压平成空格。
      const title = rawTitle.replace(/\n/g, ' ')
      lines.push(`  # title: ${title}`)
    }
  }
  return lines.join('\n')
}

export function serializeElement(e: CanvasElement): string {
  const pos = `@pos(${Math.round(e.x)},${Math.round(e.y)})`
  const color = e.color ? ` @color(${e.color})` : ''
  switch (e.kind) {
    case 'card':
      return `[card #${e.id}] ${pos} @size(${Math.round(e.w)},${Math.round(e.h)})${color}`
    case 'rect':
      return `[rect #${e.id}] ${pos} @size(${Math.round(e.w)},${Math.round(e.h)})${color}`
    case 'text':
      return (
        `[text #${e.id}] ${pos} @text("${escapeQuoted(e.text ?? '')}")` + color
      )
    case 'arrow': {
      // Shared relation signature (label/color/dash/arrowhead).
      const sig =
        (e.text ? ` @label("${escapeQuoted(e.text)}")` : '') +
        color +
        (e.dash ? ` @dash(${e.dash})` : '') +
        (e.arrowhead ? ` @arrowhead(${e.arrowhead})` : '') +
        (e.curve ? ` @curve(${Math.round(e.curve.cx)},${Math.round(e.curve.cy)})` : '')
      if (e.from && e.to) {
        // Relation arrow: endpoint references.
        return `[arrow #${e.id}] from #${e.from} to #${e.to}${sig}`
      }
      // Free arrow: bbox encodes the segment (w/h may be negative for direction).
      return `[arrow #${e.id}] ${pos} @size(${Math.round(e.w)},${Math.round(e.h)})${sig}`
    }
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
