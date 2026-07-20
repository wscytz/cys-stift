import { describe, expect, it } from 'vitest'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { isFullyInsideFrame } from '../frame-membership'

function element(id: string, kind: CanvasElement['kind'], x: number, y: number, w: number, h: number): CanvasElement {
  return { id, kind, x, y, w, h, rotation: 0 }
}

describe('isFullyInsideFrame', () => {
  it('uses full normalized containment and rejects partial overlaps', () => {
    const frame = element('f', 'frame', 0, 0, 100, 100)
    expect(isFullyInsideFrame(element('inside', 'card', 10, 10, 20, 20), frame)).toBe(true)
    expect(isFullyInsideFrame(element('partial', 'card', 90, 10, 20, 20), frame)).toBe(false)
    expect(isFullyInsideFrame(element('negative', 'card', 80, 80, -20, -20), frame)).toBe(true)
  })
})
