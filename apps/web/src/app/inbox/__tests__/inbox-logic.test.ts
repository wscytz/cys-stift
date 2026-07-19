import { describe, expect, it, vi } from 'vitest'
import {
  applyInboxCardPlacements,
  applyInboxCanvasPlacements,
  buildInboxCardCreateInput,
  nextCanvasZ,
  planInboxCanvasPlacements,
  parseInboxCardCreateLines,
  sortCardsByCapturedAtDesc,
} from '../inbox-logic'

describe('inbox core logic guards', () => {
  it('carries the runtime device id into pasted-card source metadata', () => {
    const placement = { id: 'a', x: 1, y: 2, w: 240, h: 120 }
    expect(buildInboxCardCreateInput(placement, 'canvas-a' as never, 'device-local')).toMatchObject({
      source: { kind: 'manual', deviceId: 'device-local' },
      canvasPosition: { canvasId: 'canvas-a', x: 1, y: 2, w: 240, h: 120, z: 0 },
    })
  })

  it('parses card-create DSL with the legacy defaults', () => {
    expect(
      parseInboxCardCreateLines(
        '[card #a create] @pos(10, -20) @size(300, 140)\n[rect #r]',
      ),
    ).toEqual([{ id: 'a', x: 10, y: -20, w: 300, h: 140 }])
    expect(parseInboxCardCreateLines('[card #b create]')).toEqual([
      { id: 'b', x: 0, y: 0, w: 240, h: 120 },
    ])
  })

  it('stops card creation after the first thrown persistence error', () => {
    const placements = parseInboxCardCreateLines(
      '[card #a create]\n[card #b create]\n[card #c create]',
    )
    const attempted: string[] = []
    const result = applyInboxCardPlacements(placements, ({ id }) => {
      attempted.push(id)
      if (id === 'b') throw new Error('quota')
    })
    expect(result).toEqual({ created: 1, stopped: true })
    expect(attempted).toEqual(['a', 'b'])
  })

  it('keeps invalid capturedAt cards last and preserves ties', () => {
    const cards = [
      { id: 'invalid', capturedAt: new Date('invalid') },
      { id: 'old', capturedAt: new Date('2026-01-01') },
      { id: 'new-a', capturedAt: new Date('2026-02-01') },
      { id: 'new-b', capturedAt: new Date('2026-02-01') },
    ]
    expect(sortCardsByCapturedAtDesc(cards).map((c) => c.id)).toEqual([
      'new-a',
      'new-b',
      'old',
      'invalid',
    ])
  })

  it('allocates batch z above finite existing layers', () => {
    expect(
      nextCanvasZ([
        { canvasPosition: { z: 3 } },
        { canvasPosition: { z: Number.NaN } },
        { canvasPosition: { z: Number.POSITIVE_INFINITY } },
      ] as never),
    ).toBe(4)
    expect(nextCanvasZ([{ canvasPosition: { z: Number.NaN } }] as never)).toBe(0)
  })

  it('plans unique, non-overlapping batch slots around existing cards', () => {
    const existing = [
      {
        canvasPosition: {
          canvasId: 'canvas-a',
          x: 100,
          y: 100,
          w: 200,
          h: 80,
          z: 5,
        },
      },
    ]
    const placements = planInboxCanvasPlacements(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      existing as never,
      'canvas-a' as never,
    )

    expect(placements).toHaveLength(7)
    expect(placements[0]?.position).toMatchObject({ x: 340, y: 100, z: 6 })
    expect(new Set(placements.map(({ position }) => `${position.x}:${position.y}`)).size).toBe(7)
    expect(placements.map(({ position }) => position.z)).toEqual([6, 7, 8, 9, 10, 11, 12])
    expect(
      placements.some(({ position }) => position.x === 100 && position.y === 100),
    ).toBe(false)
  })

  it('returns a one-shot undo for only the cards that were moved', () => {
    const placements = planInboxCanvasPlacements(
      ['a', 'b'],
      [],
      'canvas-a' as never,
    )
    const move = vi.fn(({ cardId }: { cardId: string }) => cardId !== 'b')
    const remove = vi.fn((_placement: (typeof placements)[number]) => true)
    const result = applyInboxCanvasPlacements(placements, move, remove)

    expect(result.movedIds).toEqual(['a'])
    expect(result.failedIds).toEqual(['b'])
    expect(result.undo()).toEqual({ restored: 1, failed: 0, alreadyUndone: false })
    expect(result.undo()).toEqual({ restored: 0, failed: 0, alreadyUndone: true })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0]?.[0]).toMatchObject({ cardId: 'a' })
  })

  it('stops attempting the batch after the first persistence failure', () => {
    const placements = planInboxCanvasPlacements(
      ['a', 'b', 'c'],
      [],
      'canvas-a' as never,
    )
    const attempted: string[] = []
    const result = applyInboxCanvasPlacements(
      placements,
      ({ cardId }) => {
        attempted.push(cardId)
        return cardId !== 'b'
      },
      () => true,
    )

    expect(attempted).toEqual(['a', 'b'])
    expect(result.movedIds).toEqual(['a'])
    expect(result.failedIds).toEqual(['b', 'c'])
  })

  it('reports a changed card as an undo failure without retrying the batch', () => {
    const placements = planInboxCanvasPlacements(['a'], [], 'canvas-a' as never)
    const remove = vi.fn(() => false)
    const result = applyInboxCanvasPlacements(placements, () => true, remove)

    expect(result.undo()).toEqual({ restored: 0, failed: 1, alreadyUndone: false })
    expect(result.undo().alreadyUndone).toBe(true)
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
