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
 * Canonical single source: ./dsl-grammar.ts (DSL_KINDS / DSL_COLORS / DSL_GRAMMAR_REFERENCE).
 */
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { DSL_KINDS } from './dsl-grammar'

/**
 * Serialize the canvas's active elements to a text block the AI can read.
 * Pure function of the element list — no side-effects, no engine access.
 */
export function serializeCanvas(
  elements: CanvasElement[],
  /** v5:可选,card id → {title, content}(消费者注入,如 CardService 的 title/body)。
   *  不传 → 几何-only(向后兼容,所有现有调用点零改动)。传了 → card 行附 @title/@content。 */
  resolve?: (id: string) => { title?: string; content?: string } | undefined,
): string {
  return elements
    .filter((e) => (DSL_KINDS as readonly string[]).includes(e.kind))
    .map((e) => serializeElement(e, e.kind === 'card' ? resolve?.(e.id) : undefined))
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

export function serializeElement(
  e: CanvasElement,
  /** v5:card 的 title/content(可选,由 serializeCanvas 的 resolve 注入)。非 card 元素忽略。 */
  content?: { title?: string; content?: string },
): string {
  const pos = `@pos(${e.x.toFixed(1)},${e.y.toFixed(1)})`
  const color = e.color ? ` @color(${e.color})` : ''
  switch (e.kind) {
    case 'card': {
      // v5:可选 @title/@content(消费者注入)。缺省几何-only(round-trip 与 v4 等价)。
      const titleAttr = content?.title ? ` @title("${escapeQuoted(content.title)}")` : ''
      const contentAttr = content?.content ? ` @content("${escapeQuoted(content.content)}")` : ''
      return `[card #${e.id}] ${pos} @size(${e.w.toFixed(1)},${e.h.toFixed(1)})${color}${titleAttr}${contentAttr}`
    }
    case 'rect':
      return `[rect #${e.id}] ${pos} @size(${e.w.toFixed(1)},${e.h.toFixed(1)})${color}`
    case 'frame':
      return (
        `[frame #${e.id}] ${pos} @size(${e.w.toFixed(1)},${e.h.toFixed(1)})` +
        ` @text("${escapeQuoted(e.text ?? '')}")` +
        color
      )
    case 'text':
      return (
        `[text #${e.id}] ${pos} @text("${escapeQuoted(e.text ?? '')}")` + color
      )
    case 'arrow': {
      // Shared relation signature (label/color/dash/arrowhead/route).
      // route 只在非 straight(或显式设过)时输出,保向后兼容(旧直线箭头无 @route)。
      // route + 对应数据(curve / elbow)按 route 输出,三者同源见 arrowRoute。
      const routeAttr =
        e.route === 'curve' || e.route === 'elbow' || e.route === 'straight'
          ? ` @route(${e.route})`
          : ''
      const elbowAttr =
        e.elbow && e.elbow.length > 0
          ? ` @elbow(${e.elbow.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';')})`
          : ''
      const sig =
        (e.text ? ` @label("${escapeQuoted(e.text)}")` : '') +
        color +
        (e.dash ? ` @dash(${e.dash})` : '') +
        (e.arrowhead ? ` @arrowhead(${e.arrowhead})` : '') +
        (e.curve ? ` @curve(${e.curve.cx.toFixed(1)},${e.curve.cy.toFixed(1)})` : '') +
        routeAttr +
        elbowAttr +
        (e.meta?.wikilink === true ? ' @wikilink' : '')
      if (e.from && e.to) {
        // Relation arrow: endpoint references.
        return `[arrow #${e.id}] from #${e.from} to #${e.to}${sig}`
      }
      // Free arrow: bbox encodes the segment (w/h may be negative for direction).
      return `[arrow #${e.id}] ${pos} @size(${e.w.toFixed(1)},${e.h.toFixed(1)})${sig}`
    }
    case 'freedraw':
      // Position only — never the point sequence (R2 + privacy).
      return `[freedraw #${e.id}] ${pos}`
    default:
      // ellipse/line/note/image (legacy) — not in the DSL.
      return ''
  }
}

/** Escape a string for a quoted DSL value:\\ = backslash, \" = quote, \n = newline(v5,@content 多行)。
 *  顺序:先 \ (防后续插入的 \ 被二次转义),再 ",再换行。是 dsl-parser unescapeQuoted 的逆。 */
function escapeQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}
