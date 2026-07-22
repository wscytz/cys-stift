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
 *
 * Legacy kinds (ellipse/line/note/image) and freedraw are NOT serialized — they're
 * not in DSL_KINDS. freedraw is program-managed (R2 store + renderer): point sequence
 * is heavy / low-value / privacy-sensitive, so it stays out of the text format entirely.
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
 * 面向人的可读序列化(DSL 编辑器用)。
 *
 * v5 现状:与 strict {@link serializeCanvas} **逐字节收敛**(card 行带真实 @title/@content
 * token,由 resolve 注入;旧的 `  # title:` 注释行已退役)。故本函数**委托** serializeCanvas,
 * 不另留一份相同实现(消除漂移风险;F)。
 *
 * 保留独立命名的理由:它是编辑器的「人读视图」语义入口。将来若要加人读增强(如 @content
 * 多行展开显示、注释),从**这里**分叉,strict 仍是机器往返形态。当前二者同形态。
 *
 * resolve: 可选,card id → {title, content}(消费者从 CardService 读)。不给 → 几何-only。
 */
export function serializeCanvasReadable(
  elements: CanvasElement[],
  resolve?: (id: string) => { title?: string; content?: string } | undefined,
): string {
  return serializeCanvas(elements, resolve)
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
      return `[card #${e.id}] ${pos} @size(${e.w.toFixed(1)},${e.h.toFixed(1)})${color}${titleAttr}${contentAttr}${metaGroup(e)}${metaHref(e)}`
    }
    case 'rect':
      return `[rect #${e.id}] ${pos} @size(${e.w.toFixed(1)},${e.h.toFixed(1)})${color}${metaGroup(e)}`
    case 'frame':
      return (
        `[frame #${e.id}] ${pos} @size(${e.w.toFixed(1)},${e.h.toFixed(1)})` +
        ` @text("${escapeQuoted(e.text ?? '')}")` +
        color +
        metaGroup(e)
      )
    case 'text':
      return (
        `[text #${e.id}] ${pos} @text("${escapeQuoted(e.text ?? '')}")` + color + metaGroup(e) + metaCompute(e)
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
      // Position only — never the point sequence (R2 + privacy)。注意:freedraw 已出 DSL 契约
      // (serializeCanvas 按 DSL_KINDS 过滤,不 emit)。本 case 仅供**直接调用方**(如 AI snapshot,
      // 它是单向上下文格式、非往返 DSL)用;parseDsl 不接受 `[freedraw]`(→ unrecognized)。
      return `[freedraw #${e.id}] ${pos}`
    default:
      // ellipse / line / note / image (legacy) — not in the DSL。
      return ''
  }
}

/** Escape a string for a quoted DSL value:\\ = backslash, \" = quote, \n = newline(v5,@content 多行)。
 *  顺序:先 \ (防后续插入的 \ 被二次转义),再 ",再换行。是 dsl-parser unescapeQuoted 的逆。 */
function escapeQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

/** v7:读 element.meta.group(语义分组名)。非字符串 / 空 → 不 emit。 */
function metaGroup(e: CanvasElement): string {
  const g = e.meta?.group
  return typeof g === 'string' && g !== '' ? ` @group("${escapeQuoted(g)}")` : ''
}

/** v7:读 element.meta.href(卡片显式语义引用目标 id 列表)。非数组 / 空 → 不 emit。
 *  emit 形如 ` @href(#a;#b)`(每个 id 补 `#`,`;` 分隔),是 parseHref 的逆。 */
function metaHref(e: CanvasElement): string {
  const h = e.meta?.href
  if (!Array.isArray(h)) return ''
  const ids = h.filter((x): x is string => typeof x === 'string' && x !== '')
  if (ids.length === 0) return ''
  return ` @href(${ids.map((id) => '#' + id).join(';')})`
}

/** v7:读 element.meta.compute(text 元素安全公式原文)。非字符串 / 空 → 不 emit。 */
function metaCompute(e: CanvasElement): string {
  const c = e.meta?.compute
  return typeof c === 'string' && c !== '' ? ` @compute("${escapeQuoted(c)}")` : ''
}
