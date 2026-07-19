import type { Card } from '@cys-stift/domain'

type ReentryCard = Pick<Card, 'id' | 'canvasPosition'>

/** Build the canvas deep link consumed by /canvas's cross-canvas jump flow. */
export function canvasCardHref(card: ReentryCard): string | null {
  if (!card.canvasPosition) return null
  return `/canvas?card=${encodeURIComponent(String(card.id))}`
}

/**
 * Cards already placed on a canvas should return to their spatial context;
 * cards without a canvas remain in the overview's regular detail flow.
 */
export function openCardFromOverview<T extends ReentryCard>(
  card: T,
  navigate: (href: string) => void,
  showDetail: (card: T) => void,
): void {
  const href = canvasCardHref(card)
  if (href) {
    navigate(href)
    return
  }
  showDetail(card)
}
