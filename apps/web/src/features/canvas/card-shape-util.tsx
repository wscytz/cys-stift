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
import type { CardId } from '@cys-stift/domain'
import { useCardService } from './card-service-context'
import { useI18n } from '@/lib/i18n'
import { typeKeyOf } from '@/lib/type-label'

export const CARD_TYPE = 'card' as const

export type CardShape = TLBaseShape<
  typeof CARD_TYPE,
  {
    w: number
    h: number
  }
>

export class CardShapeUtil extends BaseBoxShapeUtil<CardShape> {
  static override type = CARD_TYPE

  // F1.3 (v0.26.0): slimmed to geometry only. Content (title/body/type/
  // pinned) is read from CardService at render time (F1.2), so it never
  // lives in tldraw's store — no stale props, no sync conflicts.
  static override props = {
    w: T.positiveNumber,
    h: T.positiveNumber,
  }

  override getDefaultProps(): CardShape['props'] {
    return { w: 240, h: 120 }
  }

  override component(shape: CardShape) {
    // F1.2 (v0.26.0): render from the domain CardService (single source of
    // truth) via React context, not from stale shape props. The shape id
    // encodes the cardId ("shape:<id>"); we reverse it to look the card up.
    // If the card is gone (deleted) or the service isn't ready yet, render a
    // muted placeholder so the shape doesn't pop out mid-interaction.
    const service = useCardService()
    const { t } = useI18n()
    const cardId = String(shape.id).replace(/^shape:/, '') as unknown as CardId
    const card = service?.get(cardId)
    const title = card?.title || t('card.untitled')
    const preview = card?.body ?? ''
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
          position: 'relative',
          // pointerEvents: none so tldraw's canvas layer receives pointer
          // events and can select/drag the shape. Open-detail is wired via
          // tldraw's shape double-click (DoubleClickBridge).
          pointerEvents: 'none',
        }}
      >
        {card?.pinned && (
          <span
            style={{
              position: 'absolute',
              top: 'var(--space-1)',
              right: 'var(--space-1)',
              color: 'var(--color-yellow)',
              fontSize: 'var(--font-size-base)',
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            ★
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--color-gray)',
          }}
        >
          {card ? t(typeKeyOf(card.type)) : '—'}
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
          {title}
        </h3>
        {preview && (
          <p
            style={{
              margin: 0,
              color: 'var(--color-black-soft)',
              fontSize: 'var(--font-size-sm)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}
          >
            {preview}
          </p>
        )}
      </HTMLContainer>
    )
  }

  override indicator(shape: CardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={1} ry={1} />
  }
}
