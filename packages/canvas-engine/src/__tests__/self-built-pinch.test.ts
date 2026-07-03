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

  it('双指纯 pan(距离不变,中点位移)→ zoom 不变、pan 变', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    const zoom0 = host.getView().zoom
    const panX0 = host.getView().panX
    const panY0 = host.getView().panY
    // 落两指:距离 100,中点 (150,100)
    dispatch(canvas, 'pointerdown', 100, 100, 1)
    dispatch(canvas, 'pointerdown', 200, 100, 2)
    // 两指同向平移 (+20,+20):末距仍 100(距离不变),中点 (150,100)→(170,120)
    dispatch(canvas, 'pointermove', 120, 120, 1)
    dispatch(canvas, 'pointermove', 220, 120, 2)
    const v = host.getView()
    // 距离不变 → 复合 zoom 因子 = 末距/初距 = 1,zoom 不变(浮点容差)
    expect(v.zoom).toBeCloseTo(zoom0, 10)
    // 中点位移 → pan 变
    expect(v.panX).not.toBe(panX0)
    expect(v.panY).not.toBe(panY0)
  })

  it('抬一指退 pinch 后,剩余指 move 不触发 drag/pan', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    dispatch(canvas, 'pointerdown', 100, 100, 1)
    dispatch(canvas, 'pointerdown', 200, 100, 2)
    // pinch 中 zoom 变化(确认进了 pinch)
    dispatch(canvas, 'pointermove', 50, 100, 1)
    dispatch(canvas, 'pointermove', 350, 100, 2)
    expect((host as unknown as { pinch: unknown }).pinch).not.toBeNull()
    const viewAfterPinch = { ...host.getView() }
    // 抬一指 → size<2 退 pinch;onUp early return(防剩余指误 drag/pan)
    dispatch(canvas, 'pointerup', 50, 100, 1)
    expect((host as unknown as { pinch: unknown }).pinch).toBeNull()
    // 剩余指 move → view 应不变(单指态已在 startPinch 时 clearInteractionState 清空)
    dispatch(canvas, 'pointermove', 300, 200, 2)
    const v = host.getView()
    expect(v.zoom).toBe(viewAfterPinch.zoom)
    expect(v.panX).toBe(viewAfterPinch.panX)
    expect(v.panY).toBe(viewAfterPinch.panY)
  })
})
