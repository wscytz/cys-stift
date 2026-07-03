import { describe, it, expect } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'

function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number, pointerId = 1) {
  canvas.dispatchEvent(
    new PointerEvent(type, { pointerId, pointerType: 'touch', bubbles: true, clientX: x, clientY: y }),
  )
}

describe('self-built pinch', () => {
  it('双指拉开 → zoom 放大;双指捏合 → zoom 缩小', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    const zoom0 = host.getView().zoom
    dispatch(canvas, 'pointerdown', 100, 100, 1)
    dispatch(canvas, 'pointerdown', 200, 100, 2)
    dispatch(canvas, 'pointermove', 50, 100, 1)
    dispatch(canvas, 'pointermove', 350, 100, 2)
    const zoomAfterSpread = host.getView().zoom
    expect(zoomAfterSpread).toBeGreaterThan(zoom0)
    dispatch(canvas, 'pointermove', 150, 100, 1)
    dispatch(canvas, 'pointermove', 200, 100, 2)
    expect(host.getView().zoom).toBeLessThan(zoomAfterSpread)
  })
})
