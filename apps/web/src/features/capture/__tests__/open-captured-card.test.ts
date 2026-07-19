import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workbenchStore } from '@/lib/workbench-store'
import {
  openCapturedCardInWorkbench,
  routeFromLocation,
} from '../open-captured-card'

describe('openCapturedCardInWorkbench', () => {
  beforeEach(() => {
    workbenchStore.close()
    workbenchStore.setOrigin('/canvas')
  })

  it('selects the card and navigates from any app route', () => {
    const navigate = vi.fn()

    openCapturedCardInWorkbench({
      cardId: 'captured-on-settings',
      origin: '/settings?section=ai#providers',
      navigate,
    })

    expect(workbenchStore.getCardId()).toBe('captured-on-settings')
    expect(workbenchStore.getOrigin()).toBe('/settings?section=ai#providers')
    expect(navigate).toHaveBeenCalledWith('/workbench')
  })

  it('keeps the original return route when capture is opened inside workbench', () => {
    const navigate = vi.fn()
    workbenchStore.setOrigin('/inbox')

    openCapturedCardInWorkbench({
      cardId: 'captured-in-workbench',
      origin: '/workbench',
      navigate,
    })

    expect(workbenchStore.getCardId()).toBe('captured-in-workbench')
    expect(workbenchStore.getOrigin()).toBe('/inbox')
    expect(navigate).toHaveBeenCalledWith('/workbench')
  })
})

describe('routeFromLocation', () => {
  it('preserves pathname, query and hash for the workbench return action', () => {
    expect(routeFromLocation({
      pathname: '/canvas',
      search: '?mode=all',
      hash: '#card-1',
    })).toBe('/canvas?mode=all#card-1')
  })
})
