'use client'

/**
 * CardShapeUtil — a domain Card rendered as a tldraw custom shape (spec §6.3,
 * ADR-0005). Geometry/selection/resize come from BaseBoxShapeUtil; we only own
 * the Bauhaus-styled HTML face.
 *
 * The shape's `id` is the domain CardId (see canvas-binding.ts in T3), so a
 * shape round-trips to the same card. Props hold only what tldraw needs to
 * render + resize; the card's full content lives in the DB, not in tldraw's
 * store (spec §6.11 — DB is the source of truth).
 *
 * Colours/sizing go through CSS-variable tokens so this file stays hex-free
 * (packages/ui CLAUDE.md). tldraw's HTML layer is in the document, so the
 * global :root tokens resolve here.
 */
import { BaseBoxShapeUtil, HTMLContainer, T, type TLBaseShape } from '@tldraw/tldraw'

export const CARD_TYPE = 'card' as const

export type CardShape = TLBaseShape<
  typeof CARD_TYPE,
  {
    w: number
    h: number
    title: string
    kind: string // CardType, kept as plain string for tldraw props
  }
>

export class CardShapeUtil extends BaseBoxShapeUtil<CardShape> {
  static override type = CARD_TYPE

  static override props = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    title: T.string,
    kind: T.string,
  }

  override getDefaultProps(): CardShape['props'] {
    return { w: 240, h: 120, title: '', kind: 'note' }
  }

  override component(shape: CardShape) {
    const { title, kind } = shape.props
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          padding: 'var(--space-2)',
          background: 'var(--color-white)',
          color: 'var(--color-black)',
          border: 'var(--border-hairline)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
          fontFamily: 'var(--font-body)',
          // pointerEvents: none so tldraw's canvas layer receives pointer
          // events and can select/drag the shape. The card has no inner
          // interaction in Phase 4; the open-detail action is wired via
          // tldraw's shape double-click (T4).
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--color-gray)',
          }}
        >
          {kind}
        </span>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--font-size-lg)',
            fontWeight: 500,
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            overflow: 'hidden',
          }}
        >
          {title || '(untitled)'}
        </h3>
      </HTMLContainer>
    )
  }

  override indicator(shape: CardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={1} ry={1} />
  }
}
