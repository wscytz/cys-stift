'use client'

/**
 * Relation types (M1) — map a semantic relationship (blocks / references /
 * derived-from / related-to) onto tldraw's NATIVE arrow style props. No tldraw
 * fork, no extra persistence layer: the type is fully encoded in the arrow
 * record (color / dash / arrowheadEnd / labelColor + the rich-text label),
 * which the F1.5 snapshot already saves transparently.
 *
 * The registry is web-local (not domain) because it references tldraw style
 * enums; domain must stay zero-dependency. Plain string unions mirror tldraw's
 * TLColorStyle / dash / arrowhead unions so the data block stays pure (no
 * tldraw import at module top — only applyRelationType pulls in tldraw).
 */
import { type Editor, type TLShapeId } from '@tldraw/tldraw'
import type { MessageKey } from '@/lib/i18n/messages'

// tldraw arrow style unions (mirror @tldraw/tldraw TLColorStyle /
// DefaultDashStyle / arrowhead enums — kept as plain string unions so the
// RELATION_TYPES data block is pure and free of runtime tldraw imports).
export type ArrowColor =
  | 'black' | 'blue' | 'red' | 'green' | 'grey'
  | 'light-blue' | 'light-green' | 'light-red' | 'light-violet'
  | 'orange' | 'violet' | 'yellow'
export type ArrowDash = 'solid' | 'dashed' | 'dotted' | 'draw'
export type ArrowArrowhead =
  | 'arrow' | 'bar' | 'diamond' | 'dot' | 'inverted'
  | 'none' | 'pipe' | 'square' | 'triangle'

export type RelationTypeId = 'blocks' | 'references' | 'derived-from' | 'related-to'

export interface RelationType {
  id: RelationTypeId
  labelKey: MessageKey
  color: ArrowColor
  dash: ArrowDash
  arrowhead: ArrowArrowhead
  labelColor: ArrowColor
  /** Maps the tldraw color to a real CSS color token so the panel can show
   *  an actual colored bar (not the tldraw palette which the design system
   *  doesn't expose). Falls back to --color-black if a tldraw color has no
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
 * Reverse-lookup: given an arrow's current native props, find the registry
 * type whose visual signature matches. Returns null when the user hand-edited
 * the arrow (so the panel shows "custom" rather than a stale type).
 */
export function inferRelationType(props: {
  color?: string
  dash?: string
  arrowheadEnd?: string
  labelColor?: string
}): RelationType | null {
  return (
    RELATION_TYPES.find(
      (t) =>
        t.color === props.color &&
        t.dash === props.dash &&
        t.arrowhead === props.arrowheadEnd &&
        t.labelColor === props.labelColor,
    ) ?? null
  )
}

/**
 * Apply a relation type to an arrow in one updateShape call. Writes native
 * arrow props (color/dash/arrowheadEnd/labelColor) + the visible text label
 * via the native `text` prop. Everything persists via the F1.5 snapshot (no
 * separate store). Not wrapped in mergeRemoteChanges: this is a user-driven
 * style choice, and only `card` shapes have a writeback listener
 * (canvas-binding.ts:166-178) — arrows are not observed.
 *
 * Note: tldraw 3.15's arrow label prop is `text: string` (NOT `richText` —
 * that key is create-only and rejected by updateShape's validator). Verified
 * against @tldraw/tldraw 3.15.6.
 */
export function applyRelationType(
  editor: Editor,
  arrowId: TLShapeId,
  type: RelationType,
  label: string,
): void {
  editor.updateShape({
    id: arrowId,
    type: 'arrow',
    props: {
      color: type.color,
      dash: type.dash,
      arrowheadEnd: type.arrowhead,
      labelColor: type.labelColor,
      text: label,
    },
  })
}
