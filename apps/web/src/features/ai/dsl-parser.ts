'use client'

/**
 * DSL Parser — parses AI output for canvas layout (P6 v0.33.1).
 *
 * The AI outputs a DSL block like:
 *
 *   [card #abc123] @pos(300, 400) @color(blue)
 *   [rect #r1] @pos(100, 200) @size(300, 400) @color(red)
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
  w?: number
  h?: number
  color?: string
}

export type DslFreeOp =
  | {
      type: 'free'
      shape: 'rect'
      /** Element id (round-trip with serializeCanvas's `[rect #id]`). */
      id?: string
      x: number
      y: number
      w?: number
      h?: number
      color?: string
    }
  | {
      type: 'free'
      shape: 'text'
      /** Element id (round-trip with serializeCanvas's `[text #id]`). */
      id?: string
      x: number
      y: number
      w?: number
      h?: number
      text?: string
      color?: string
    }
  | {
      type: 'free'
      shape: 'frame'
      /** Element id (round-trip with serializeCanvas's `[frame #id]`). */
      id?: string
      x: number
      y: number
      w?: number
      h?: number
      text?: string
      color?: string
    }

export type DslArrowOp = {
  type: 'arrow'
  /** Arrow element id (round-trip with serializeCanvas's `[arrow #id]`). When
   *  present and the host already has this arrow, applyArrowOp updates it in
   *  place (changing its relation signature) instead of creating a new one. */
  id?: string
  from: string
  to: string
  label?: string
  color?: string
  /** Relation signature line style (semantics): solid/dashed/dotted. */
  dash?: 'solid' | 'dashed' | 'dotted'
  /** Relation signature terminal (semantics): arrow/triangle/none. */
  arrowhead?: 'arrow' | 'triangle' | 'none'
  /** 自由箭头标记:无 from/to,pos+size 编码线段 bbox。 */
  freeArrow?: boolean
  /** 自由箭头 bbox(仅 freeArrow=true 时有意义)。 */
  x?: number
  y?: number
  w?: number
  h?: number
  /** 弯曲控制点(二次贝塞尔,绝对页坐标)。关系/自由箭头均可。 */
  curve?: { cx: number; cy: number }
  /** 箭头路由形态:straight(直线)/curve(弯曲)/elbow(折线)。缺省 straight。
   *  向后兼容:无 route 但有 curve → 当 curve(serialize 不为 straight 主动输出 route,
   *  除非显式切过)。 */
  route?: 'straight' | 'curve' | 'elbow'
  /** 折线折点(1-2 个,绝对页坐标)。route='elbow' 时用。 */
  elbow?: { x: number; y: number }[]
}

export type DslOp = DslCardOp | DslFreeOp | DslArrowOp

/** A diagnostic describing a single malformed DSL line that was dropped. */
export type DslDiagnostic = {
  /** 1-based original line number in the source text. */
  line: number
  /** The trimmed source line that failed to parse. */
  text: string
  /** Short technical reason (English, dev-facing — dialog prefixes i18n). */
  message: string
}

// ── Parser ───────────────────────────────────────────────────────────────────

/** Card reference: `#id` or `shape:cardId` */
const ID_RE = /#([a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)/

/** Position directive: `@pos(300, 400)` or inline `at (300, 400)`. Supports
 *  negatives — elements dragged above/left of origin serialize as @pos(-x,-y)
 *  (canvas pan lets coords go negative), so the regex must round-trip them
 *  (else negative-coord cards fail to reparse → "missing @pos"). */
const POS_RE = /@pos\((-?\d+),\s*(-?\d+)\)/
const AT_RE = /at\s+\((-?\d+),\s*(-?\d+)\)/

/** Color directive: Bauhaus 6 原色 + grey 别名。引擎 colorOf 只认这 7 个
 *  名字(red/yellow/blue/black/white/gray/grey)。其他写法(green/teal/pink/
 *  orange/purple)不匹配 → color 字段 undefined → 渲染回退默认色(而非
 *  静默变黑)。审计 H3:此前正则 `[a-z]+` 接受任意小写色名,越界色被引擎
 *  colorOf 回退成黑色,造成转义契约的静默违反。 */
const COLOR_RE = /@color\((red|yellow|blue|black|white|gray|grey)\)/

/** Label directive: `@label\("([^"]*)"\)` */
const LABEL_RE = /@label\("([^"]*)"\)/

/** Text directive: `@text("...")` — escape-aware (serializeCanvas escapes quotes/backslashes). */
const TEXT_RE = /@text\("((?:[^"\\]|\\.)*)"\)/

/** Size directive: `@size(w,h)` — supports negative values (free arrow direction encoding). */
const SIZE_RE = /@size\((-?\d+),\s*(-?\d+)\)/

/** Arrow relation signature — line style + terminal (semantics). */
const DASH_RE = /@dash\((solid|dashed|dotted)\)/
const ARROWHEAD_RE = /@arrowhead\((arrow|triangle|none)\)/
/** 弯曲控制点:@curve(cx, cy)(支持负坐标)。 */
const CURVE_RE = /@curve\((-?\d+),\s*(-?\d+)\)/
/** 路由形态:@route(straight|curve|elbow)。 */
const ROUTE_RE = /@route\((straight|curve|elbow)\)/
/** 折点:@elbow(x,y;x,y) — 分号分隔 1-2 个折点(均支持负坐标)。 */
const ELBOW_RE = /@elbow\(([^)]+)\)/

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
  const m = text.match(SIZE_RE)
  if (m) return { w: parseInt(m[1]!, 10), h: parseInt(m[2]!, 10) }
  return null
}

function extractDash(
  text: string,
): 'solid' | 'dashed' | 'dotted' | undefined {
  return text.match(DASH_RE)?.[1] as 'solid' | 'dashed' | 'dotted' | undefined
}

function extractArrowhead(
  text: string,
): 'arrow' | 'triangle' | 'none' | undefined {
  return text.match(ARROWHEAD_RE)?.[1] as
    | 'arrow'
    | 'triangle'
    | 'none'
    | undefined
}

function extractCurve(text: string): { cx: number; cy: number } | undefined {
  const m = text.match(CURVE_RE)
  if (!m) return undefined
  return { cx: Number(m[1]), cy: Number(m[2]) }
}

function extractRoute(text: string): 'straight' | 'curve' | 'elbow' | undefined {
  const m = text.match(ROUTE_RE)
  return m?.[1] as 'straight' | 'curve' | 'elbow' | undefined
}

/** 解析 @elbow(x,y;x,y):分号分隔,每个折点 x,y(支持负)。返回 1-2 个折点;解析失败 → undefined。 */
function extractElbow(text: string): { x: number; y: number }[] | undefined {
  const m = text.match(ELBOW_RE)
  if (!m) return undefined
  const pts = m[1]!
    .split(';')
    .map((pair) => pair.trim().match(/^(-?\d+)\s*,\s*(-?\d+)$/))
    .filter(Boolean)
    .map((pm) => ({ x: Number(pm![1]), y: Number(pm![2]) }))
  return pts.length >= 1 ? pts.slice(0, 2) : undefined
}

/**
 * Parse a DSL block into ops AND per-line diagnostics for dropped lines.
 *
 * Unlike {@link parseDsl}, this preserves 1-based original line numbers so
 * the editor can tell the user WHICH lines were dropped and why (the
 * "transliteration core selling point" — silent data loss is a trust
 * problem). Lines are classified:
 *
 * - empty / `# comment` / non-`[`-prefixed prose → skipped silently (no error)
 * - a `[`-prefixed line that fails to parse → records a {@link DslDiagnostic}
 *
 * `ops` from this function are identical to what {@link parseDsl} returns.
 */
export function parseDslWithDiagnostics(dslText: string): {
  ops: DslOp[]
  errors: DslDiagnostic[]
} {
  const ops: DslOp[] = []
  const errors: DslDiagnostic[] = []

  const rawLines = dslText.split('\n')
  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1
    const line = rawLines[i]!.trim()
    if (!line) continue
    // `#` comment lines (serializeCanvasReadable title etc.) → skip silently.
    if (line.startsWith('#')) continue
    // Non-`[`-prefixed lines are free-form prose the user/AI may include.
    // Only `[`-prefixed lines that fail to parse are errors.
    if (!line.startsWith('[')) continue

    // ── Card line: `[card #abc123] @pos(300, 400)`
    if (line.startsWith('[card ')) {
      const id = extractId(line)
      if (!id) {
        errors.push({ line: lineNo, text: line, message: 'missing #id' })
        continue
      }
      const pos = extractPos(line)
      if (!pos) {
        errors.push({ line: lineNo, text: line, message: 'missing @pos' })
        continue
      }
      const size = extractSize(line)
      ops.push({
        type: 'card',
        cardId: id as CardId,
        x: pos.x,
        y: pos.y,
        w: size?.w,
        h: size?.h,
        color: extractColor(line),
      })
      continue
    }

    // ── Arrow line: `[arrow #arr1] from #a to #b @label("ref")`
    //    Free arrow (no from/to): `[arrow #id] @pos(x,y) @size(w,h) + sig`
    if (line.startsWith('[arrow ')) {
      const id = extractId(line)
      if (!id) {
        errors.push({ line: lineNo, text: line, message: 'missing #id' })
        continue
      }
      const fromMatch = line.match(/from\s+(#[a-zA-Z0-9_-]+)/)
      const toMatch = line.match(/to\s+(#[a-zA-Z0-9_-]+)/)

      if (fromMatch && toMatch) {
        // 关系箭头
        ops.push({
          type: 'arrow',
          id,
          from: fromMatch[1]!.replace('#', ''),
          to: toMatch[1]!.replace('#', ''),
          label: extractLabel(line),
          color: extractColor(line),
          dash: extractDash(line),
          arrowhead: extractArrowhead(line),
          curve: extractCurve(line),
          route: extractRoute(line),
          elbow: extractElbow(line),
        })
      } else {
        // 自由箭头:无 from/to,需 pos + size(w/h 可负,编码线段方向)
        const pos = extractPos(line)
        const size = extractSize(line)
        if (!pos || !size) {
          errors.push({
            line: lineNo,
            text: line,
            message: 'free arrow missing @pos/@size',
          })
          continue
        }
        ops.push({
          type: 'arrow',
          id,
          from: '',
          to: '',
          freeArrow: true,
          x: pos.x,
          y: pos.y,
          w: size.w,
          h: size.h,
          label: extractLabel(line),
          color: extractColor(line),
          dash: extractDash(line),
          arrowhead: extractArrowhead(line),
          curve: extractCurve(line),
          route: extractRoute(line),
          elbow: extractElbow(line),
        })
      }
      continue
    }

    // ── Rect line (Phase 0 / T3 unified grammar): `[rect #id] @pos(x,y) @size(w,h) @color(c)`
    if (line.startsWith('[rect ')) {
      const id = extractId(line)
      if (!id) {
        errors.push({ line: lineNo, text: line, message: 'missing #id' })
        continue
      }
      const pos = extractPos(line)
      if (!pos) {
        errors.push({ line: lineNo, text: line, message: 'missing @pos' })
        continue
      }
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

    // ── Text line (Phase 0 / T3): `[text #id] @pos(x,y) @text("...") @color(c)`
    if (line.startsWith('[text ')) {
      const id = extractId(line)
      if (!id) {
        errors.push({ line: lineNo, text: line, message: 'missing #id' })
        continue
      }
      const pos = extractPos(line)
      if (!pos) {
        errors.push({ line: lineNo, text: line, message: 'missing @pos' })
        continue
      }
      ops.push({
        type: 'free',
        id,
        shape: 'text',
        x: pos.x,
        y: pos.y,
        text: extractText(line),
        color: extractColor(line),
      })
      continue
    }

    // ── Frame line (主题分区): `[frame #id] @pos(x,y) @size(w,h) @text("title") @color(c)`
    if (line.startsWith('[frame ')) {
      const id = extractId(line)
      if (!id) {
        errors.push({ line: lineNo, text: line, message: 'missing #id' })
        continue
      }
      const pos = extractPos(line)
      if (!pos) {
        errors.push({ line: lineNo, text: line, message: 'missing @pos' })
        continue
      }
      const size = extractSize(line)
      ops.push({
        type: 'free',
        id,
        shape: 'frame',
        x: pos.x,
        y: pos.y,
        w: size?.w,
        h: size?.h,
        text: extractText(line),
        color: extractColor(line),
      })
      continue
    }

    // ── Freedraw line: `[freedraw #id] @pos(x,y)` — recognized but a
    //    deliberate NO-OP. freedraw point sequences never enter the DSL
    //    (privacy R2), so serializeCanvasReadable emits position-only metadata
    //    for human readability; the parser acknowledges the line (so a canvas
    //    doesn't flag its OWN exported freedraw as "invalid") but produces no
    //    apply op — the host's freedraw element is left untouched on apply.
    if (line.startsWith('[freedraw ')) {
      continue
    }

    // ── `[`-prefixed but no recognized kind prefix (e.g. `[foo #x] ...`)
    errors.push({
      line: lineNo,
      text: line,
      message: 'unrecognized element kind',
    })
  }

  return { ops, errors }
}

/**
 * Parse a DSL block (the AI's output) into a list of layout operations.
 *
 * Graceful: unrecognized lines are skipped (no throw). The DSL is
 * intended for AI-to-machine communication — if the AI produces
 * invalid syntax, we silently ignore bad lines.
 *
 * Thin wrapper over {@link parseDslWithDiagnostics}: returns only the ops
 * (the diagnostics are irrelevant for the AI path). Behavior is unchanged.
 */
export function parseDsl(dslText: string): DslOp[] {
  return parseDslWithDiagnostics(dslText).ops
}
