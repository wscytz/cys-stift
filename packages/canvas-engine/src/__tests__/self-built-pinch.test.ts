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

  it('单指 drag 元素中第二指落下 → 中断 drag(clearInteractionState)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['e1'])
    host.upsert({ id: 'e1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    host.setTool('select')
    dispatch(canvas, 'pointerdown', 50, 50, 1)
    dispatch(canvas, 'pointermove', 60, 60, 1)
    expect((host as unknown as { dragGroup: unknown }).dragGroup).not.toBeNull()
    dispatch(canvas, 'pointerdown', 120, 120, 2)
    expect((host as unknown as { dragGroup: unknown }).dragGroup).toBeNull()
    expect((host as unknown as { pinch: unknown }).pinch).not.toBeNull()
  })
})
