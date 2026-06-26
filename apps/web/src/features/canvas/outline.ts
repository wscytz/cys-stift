/**
 * Outline (大纲视图) — pure helper.
 *
 * Turns the layer-sorted `CanvasElement[]` into a flat, structural text overview
 * (a table-of-contents / layers list) for the Outline panel. This is the
 * **structural** complement to the minimap's **spatial** overview — and the
 * 转义(画布↔文字)core selling point **productized for browsing/navigation**
 * (distinct from the DSL modal, which is the editable interchange format).
 *
 * Pure, zero side effects, no React. The panel layer supplies i18n + click
 * handling; this fn only maps elements → `{ id, kind, label, sublabel? }`.
 *
 * R2 privacy: freedraw is reduced to a '(sketch)' label — the raw point sequence
 * NEVER enters an OutlineItem (matches the DSL/snapshot privacy rule). The
 * outline is local-render only, never sent to AI.
 */
import type { CanvasElement } from '@cys-stift/canvas-engine'

export type OutlineKind = 'card' | 'text' | 'arrow' | 'rect' | 'frame' | 'freedraw' | 'legacy'

export interface OutlineItem {
  id: string
  kind: OutlineKind
  /** Primary text shown for the entry. */
  label: string
  /** Secondary text (e.g. an arrow relation "A → B"). */
  sublabel?: string
}

/** Max chars kept from a text element's body (long floating notes get truncated). */
const TEXT_LABEL_MAX = 40

const LEGACY_KINDS = new Set<string>(['ellipse', 'note', 'line', 'image'])

/**
 * Build a structural overview of the canvas. `elements` is assumed already
 * layer-sorted (the host's `getElements()` returns it that way) — this fn does
 * NOT re-sort, it preserves input order so the outline mirrors z-order top→down
 * as the user sees it. Pure function of the element list + two optional resolvers.
 *
 * @param getCardTitle     card id → human title (page reads CardService). Falls
 *                         back to '(untitled)'.
 * @param getEndpointTitle arrow endpoint id → title, used to build the
 *                         "From → To" sublabel for relation arrows.
 */
export function buildOutline(
  elements: CanvasElement[],
  getCardTitle?: (id: string) => string | undefined,
  getEndpointTitle?: (id: string) => string | undefined,
): OutlineItem[] {
  const out: OutlineItem[] = []
  for (const el of elements) {
    const item = toItem(el, getCardTitle, getEndpointTitle)
    if (item) out.push(item)
  }
  return out
}

function toItem(
  el: CanvasElement,
  getCardTitle: ((id: string) => string | undefined) | undefined,
  getEndpointTitle: ((id: string) => string | undefined) | undefined,
): OutlineItem | null {
  switch (el.kind) {
    case 'card':
      return {
        id: el.id,
        kind: 'card',
        label: getCardTitle?.(el.id) || '(untitled)',
      }

    case 'text': {
      const raw = (el.text ?? '').trim()
      const label = raw ? truncate(raw, TEXT_LABEL_MAX) : '(text)'
      return { id: el.id, kind: 'text', label }
    }

    case 'arrow':
      return arrowItem(el, getEndpointTitle)

    case 'rect':
      return { id: el.id, kind: 'rect', label: '(rect)' }

    case 'frame': {
      // 主题分区:标题优先,无标题回退 '(frame)'。
      const raw = (el.text ?? '').trim()
      return { id: el.id, kind: 'frame', label: raw ? truncate(raw, TEXT_LABEL_MAX) : '(frame)' }
    }

    case 'freedraw':
      // R2: never surface the point sequence — only a static label.
      return { id: el.id, kind: 'freedraw', label: '(sketch)' }

    default:
      // ellipse / line / note / image — legacy kinds the self-built canvas never
      // creates; surfaced as a single '(legacy)' entry so old canvases still list them.
      if (LEGACY_KINDS.has(el.kind)) {
        return { id: el.id, kind: 'legacy', label: '(legacy)' }
      }
      return null
  }
}

/**
 * Arrow → outline item.
 *  - Relation arrow (has from/to): label = el.text (the relation label) or a
 *    fallback; sublabel = "From → To" when both endpoints resolve to titles.
 *  - Free arrow (no from/to): label = '(free arrow)', no sublabel.
 */
function arrowItem(
  el: CanvasElement,
  getEndpointTitle: ((id: string) => string | undefined) | undefined,
): OutlineItem {
  const hasEndpoints = !!(el.from && el.to)

  if (!hasEndpoints) {
    return { id: el.id, kind: 'arrow', label: '(free arrow)' }
  }

  const label = el.text && el.text.trim() ? el.text!.trim() : '(arrow)'

  let sublabel: string | undefined
  if (el.from && el.to && getEndpointTitle) {
    const fromTitle = getEndpointTitle(el.from)
    const toTitle = getEndpointTitle(el.to)
    if (fromTitle && toTitle) {
      sublabel = `${fromTitle} → ${toTitle}`
    }
  }

  return { id: el.id, kind: 'arrow', label, sublabel }
}

/** Truncate `s` to `max` chars, appending an ellipsis when it was cut. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  // Keep room for the ellipsis so the visible width stays ≤ max.
  return s.slice(0, Math.max(0, max - 1)) + '…'
}
