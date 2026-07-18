import { describe, expect, it, vi } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'

describe('SelfBuiltAdapter shared command bus', () => {
  it('selects, nudges, deletes and undoes through executeCommand', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({
      id: 'sketch-1',
      kind: 'freedraw',
      x: 10,
      y: 20,
      w: 10,
      h: 10,
      rotation: 0,
      meta: { points: [[10, 20], [20, 30]] },
    })

    expect(host.executeCommand({ type: 'select', ids: ['sketch-1'] })).toBe(true)
    expect(
      host.executeCommand({
        type: 'nudgeSelection',
        dx: 4,
        dy: -2,
        history: 'single',
      }),
    ).toBe(true)
    expect(host.getElement('sketch-1')).toMatchObject({ x: 14, y: 18 })
    expect(host.getElement('sketch-1')?.meta?.points).toEqual([
      [14, 18],
      [24, 28],
    ])

    expect(host.executeCommand({ type: 'deleteSelection' })).toBe(true)
    expect(host.getElement('sketch-1')).toBeUndefined()
    expect(host.executeCommand({ type: 'undo' })).toBe(true)
    expect(host.getElement('sketch-1')).toMatchObject({ x: 14, y: 18 })
    host.detach()
  })

  it('routes window keyboard actions through the same command bus', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({
      id: 'card-1',
      kind: 'card',
      x: 0,
      y: 0,
      w: 100,
      h: 60,
      rotation: 0,
    })
    host.setSelectedIds(['card-1'])
    const execute = vi.spyOn(host, 'executeCommand')

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    )
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }))

    expect(execute).toHaveBeenCalledWith({
      type: 'nudgeSelection',
      dx: 1,
      dy: 0,
      history: 'start',
    })
    expect(host.getElement('card-1')).toMatchObject({ x: 1, y: 0 })
    host.detach()
  })
})
