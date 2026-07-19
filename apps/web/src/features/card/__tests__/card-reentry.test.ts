import { describe, expect, it, vi } from 'vitest'
import type { Card } from '@cys-stift/domain'
import { canvasCardHref, openCardFromOverview } from '../card-reentry'

function reentryCard(id: string, onCanvas: boolean): Pick<Card, 'id' | 'canvasPosition'> {
  return {
    id: id as Card['id'],
    canvasPosition: onCanvas
      ? {
          canvasId: 'canvas-b' as NonNullable<Card['canvasPosition']>['canvasId'],
          x: 10,
          y: 20,
          w: 200,
          h: 80,
          z: 1,
        }
      : undefined,
  }
}

describe('card overview re-entry', () => {
  it('deep-links placed cards so /canvas can switch canvas and focus them', () => {
    const card = reentryCard('card/with space', true)

    expect(canvasCardHref(card)).toBe('/canvas?card=card%2Fwith%20space')

    const navigate = vi.fn()
    const showDetail = vi.fn()
    openCardFromOverview(card, navigate, showDetail)

    expect(navigate).toHaveBeenCalledWith('/canvas?card=card%2Fwith%20space')
    expect(showDetail).not.toHaveBeenCalled()
  })

  it('keeps cards without a canvas in the local detail flow', () => {
    const card = reentryCard('inbox-card', false)
    const navigate = vi.fn()
    const showDetail = vi.fn()

    expect(canvasCardHref(card)).toBeNull()
    openCardFromOverview(card, navigate, showDetail)

    expect(showDetail).toHaveBeenCalledWith(card)
    expect(navigate).not.toHaveBeenCalled()
  })
})
