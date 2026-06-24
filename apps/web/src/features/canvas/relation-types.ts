'use client'

/**
 * Relation types (M1) — map a semantic relationship (blocks / references /
 * derived-from / related-to) onto a Canvas arrow's NATIVE style props
 * (`color` + `text` label). No tldraw fork, no extra persistence layer: the
 * type is fully encoded in the arrow CanvasElement (color + text), which the
 * Phase 1 host snapshot already saves transparently.
 *
 * v0.32.0 (Phase 2 子4): the registry migrated off tldraw. `inferRelationType`
 * now reads from a `CanvasElement` (arrow's color+text), and
 * `applyRelationType` writes via `host.upsert` (no more editor.updateShape).
 * The tldraw-style unions (`ArrowColor` / `ArrowDash` / `ArrowArrowhead`) are
 * kept as plain string unions for future use (dash not rendered by Canvas 2D
 * arrow yet — YAGNI), but no tldraw import remains in this file.
 *
 * The registry is web-local (not domain) because it maps to canvas style
 * strings; domain must stay zero-dependency.
 */
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import type { MessageKey } from '@/lib/i18n/messages'

// Arrow 样式联合类型。颜色收紧到 Bauhaus 6 原色里实际用得到的几种(red/blue/
// black/grey)——不再带 tldraw 调色板的 green/light-*/orange/violet(那些既无对应
// 设计 token,也违反「6 原色」铁律)。dash/arrowhead 现已由 Canvas 2D arrow 渲染
// (语义三维签名:线型 + 箭头形 + 颜色)。
export type ArrowColor = 'black' | 'blue' | 'red' | 'grey'
export type ArrowDash = 'solid' | 'dashed' | 'dotted'
export type ArrowArrowhead = 'arrow' | 'triangle' | 'none'

export type RelationTypeId = 'blocks' | 'references' | 'derived-from' | 'related-to'

export interface RelationType {
  id: RelationTypeId
  labelKey: MessageKey
  color: ArrowColor
  dash: ArrowDash
  arrowhead: ArrowArrowhead
  labelColor: ArrowColor
  /** Maps the relation color to a real CSS color token so the panel can show
   *  an actual colored bar. Falls back to --color-black if a color has no
   *  matching project token. */
  swatch: string
}

export const RELATION_TYPES: RelationType[] = [
  {
    id: 'blocks',
    labelKey: 'relation.blocks',
    color: 'red',
    dash: 'solid',
    arrowhead: 'arrow',
    labelColor: 'red',
    swatch: 'var(--color-red)',
  },
  {
    id: 'references',
    labelKey: 'relation.references',
    color: 'blue',
    dash: 'dashed',
    arrowhead: 'none',
    labelColor: 'blue',
    swatch: 'var(--color-blue)',
  },
  {
    id: 'derived-from',
    labelKey: 'relation.derivedFrom',
    color: 'black',
    dash: 'solid',
    arrowhead: 'arrow',
    labelColor: 'black',
    swatch: 'var(--color-black)',
  },
  {
    id: 'related-to',
    labelKey: 'relation.relatedTo',
    color: 'grey',
    dash: 'dotted',
    arrowhead: 'arrow',
    labelColor: 'grey',
    swatch: 'var(--color-gray)',
  },
]

export function relationTypeById(id: RelationTypeId): RelationType | undefined {
  return RELATION_TYPES.find((t) => t.id === id)
}

/**
 * Reverse-lookup: given an arrow CanvasElement, find the registry type whose
 * visual signature matches (color + text === rt.id). Returns null when the
 * arrow has no type set yet (color/text empty) or was hand-edited.
 *
 * Match rule: el.color === rt.color && el.text === rt.id. The text label is
 * the relation type id (e.g. 'blocks'), so the highlight survives reload
 * (state lives in the arrow element, not React).
 */
export function inferRelationType(el: CanvasElement): RelationType | null {
  if (!el.color || !el.text) return null
  // grey/gray 归一化:注册表用 'grey'(英式),AI/用户可能写 'gray'(美式)。
  // colorOf 已双向映射到 --color-gray 渲染正确,但此处严格匹配 rt.color='grey'
  // 会漏(反推失败 → RelationPanel 显示无类型)。归一化后再匹配。
  const normalizedColor = el.color === 'gray' ? 'grey' : el.color
  return RELATION_TYPES.find((rt) => rt.color === normalizedColor && el.text === rt.id) ?? null
}

/**
 * Apply a relation type to an arrow via host.upsert (one write). Writes the
 * arrow's full visual signature: `color` + `dash`(线型) + `arrowhead`(箭头形)
 * + visible text label (`text`). All persist via the host snapshot (no separate
 * store), so the semantic signature survives reload. 这是与 tldraw/excalidraw
 * 的差异点——它们的箭头是用户手选样式的几何箭头,我们的是「每种语义关系一个
 * 固定的三维视觉签名」(线型+箭头形+颜色),一眼读出卡片间关系性质。
 *
 * No-ops if the element isn't an arrow (defensive — the panel only ever calls
 * this on a selected arrow, but a stale selection could race).
 */
export function applyRelationType(
  host: CanvasHost,
  arrowId: string,
  type: RelationType,
  label: string,
): void {
  const el = host.getElement(arrowId)
  if (!el || el.kind !== 'arrow') return
  host.upsert({
    ...el,
    color: type.color,
    dash: type.dash,
    arrowhead: type.arrowhead,
    text: label,
  })
}
