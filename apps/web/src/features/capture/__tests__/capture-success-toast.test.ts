import { describe, it, expect, vi } from 'vitest'
import type { CardId, CardService, CanvasId } from '@cys-stift/domain'

// We test the pure redirect builder in isolation (the onSubmit closure is
// heavy with hooks; the redirect logic is extracted into a helper).
import { buildCaptureRedirectActions } from '../capture-redirect'

function fakeCardId(s = 'card-1'): CardId {
  return s as unknown as CardId
}

describe('buildCaptureRedirectActions', () => {
  it('returns 3 actions labelled →画布 / →归档 / 打开', () => {
    const service = { moveToCanvas: vi.fn(), archive: vi.fn() } as unknown as CardService
    const actions = buildCaptureRedirectActions({
      cardId: fakeCardId(),
      service,
      activeCanvasId: 'canvas-1' as CanvasId,
      openCard: () => {},
      onError: () => {},
    })
    expect(actions).toHaveLength(3)
    expect(actions.map((a) => a.label)).toEqual(
      expect.arrayContaining(['→ canvas', '→ archive', 'open']),
    )
  })

  it('→ canvas calls service.moveToCanvas with the active canvas id + a computed z', () => {
    const moveToCanvas = vi.fn()
    const service = { moveToCanvas, archive: vi.fn() } as unknown as CardService
    const actions = buildCaptureRedirectActions({
      cardId: fakeCardId('c2'),
      service,
      activeCanvasId: 'cv-active' as CanvasId,
      openCard: () => {},
      onError: () => {},
    })
    const toCanvas = actions.find((a) => a.label === '→ canvas')!
    toCanvas.onClick()
    expect(moveToCanvas).toHaveBeenCalledTimes(1)
    const arg = moveToCanvas.mock.calls[0]?.[1]
    expect(arg).toBeDefined()
    expect(arg!.canvasId).toBe('cv-active')
    expect(typeof arg!.z).toBe('number')
    expect(arg!.x).toBeGreaterThanOrEqual(0)
    expect(arg!.y).toBeGreaterThanOrEqual(0)
    expect(arg!.w).toBeGreaterThan(0)
    expect(arg!.h).toBeGreaterThan(0)
  })

  it('→ archive calls service.archive with the card id', () => {
    const archive = vi.fn()
    const service = { moveToCanvas: vi.fn(), archive } as unknown as CardService
    const actions = buildCaptureRedirectActions({
      cardId: fakeCardId('c3'),
      service,
      activeCanvasId: 'cv' as CanvasId,
      openCard: () => {},
      onError: () => {},
    })
    const toArchive = actions.find((a) => a.label === '→ archive')!
    toArchive.onClick()
    expect(archive).toHaveBeenCalledWith('c3')
  })

  it('open fires the openCard callback with the card id', () => {
    const openCard = vi.fn()
    const service = { moveToCanvas: vi.fn(), archive: vi.fn() } as unknown as CardService
    const actions = buildCaptureRedirectActions({
      cardId: fakeCardId('c4'),
      service,
      activeCanvasId: 'cv' as CanvasId,
      openCard,
      onError: () => {},
    })
    const open = actions.find((a) => a.label === 'open')!
    open.onClick()
    expect(openCard).toHaveBeenCalledWith('c4')
  })

  it('→ canvas redirect failure calls onError (does not throw out)', () => {
    const moveToCanvas = vi.fn(() => {
      throw new Error('quota')
    })
    const onError = vi.fn()
    const service = { moveToCanvas, archive: vi.fn() } as unknown as CardService
    const actions = buildCaptureRedirectActions({
      cardId: fakeCardId('c5'),
      service,
      activeCanvasId: 'cv' as CanvasId,
      openCard: () => {},
      onError,
    })
    const toCanvas = actions.find((a) => a.label === '→ canvas')!
    expect(() => toCanvas.onClick()).not.toThrow()
    expect(onError).toHaveBeenCalled()
  })

  it('→ canvas returning false calls onError instead of silently dismissing the toast', () => {
    const moveToCanvas = vi.fn(() => false)
    const onError = vi.fn()
    const service = { moveToCanvas, archive: vi.fn() } as unknown as CardService
    const actions = buildCaptureRedirectActions({
      cardId: fakeCardId('c6'),
      service,
      activeCanvasId: 'cv' as CanvasId,
      openCard: () => {},
      onError,
    })

    actions.find((a) => a.label === '→ canvas')!.onClick()

    expect(onError).toHaveBeenCalledWith('The card could not be moved to the canvas')
  })
})
