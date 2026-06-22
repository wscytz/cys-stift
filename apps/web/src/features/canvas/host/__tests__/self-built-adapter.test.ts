import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'
import type { CanvasElement } from '../canvas-host'

describe('SelfBuiltAdapter drag → onUserChange', () => {
  it('upsert during drag emits UserChange (canvas-binding writes back via this)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const changes: { updated: unknown[]; removed: string[] }[] = []
    host.onUserChange((c) => changes.push(c))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c1', kind: 'card', x: 5, y: 6, w: 10, h: 10, rotation: 0 })
    expect(changes).toHaveLength(2)
    expect(changes[1]!.updated[0]).toMatchObject({ id: 'c1', x: 5, y: 6 })
  })

  it('drag under applyWithoutEcho does NOT emit (writeback-loop suppression)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    let fired = 0
    host.onUserChange(() => fired++)
    host.applyWithoutEcho(() => host.upsert({ id: 'c1', kind: 'card', x: 1, y: 1, w: 1, h: 1, rotation: 0 }))
    expect(fired).toBe(0)
  })
})

describe('SelfBuiltAdapter pan/zoom', () => {
  it('wheel zoom adjusts zoom + pan (zoom-to-cursor at cursor point)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.setView({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // delta < 0(放大)单步应用 1.1 因子;cursor 下页坐标应缩放前后不变。
    const sx = 100
    const sy = 100
    ;(host as unknown as { onWheel: (sx: number, sy: number, delta: number) => void }).onWheel(sx, sy, -1)
    const v = host.getView()
    expect(v.zoom).toBeCloseTo(1.1, 5)
    // zoom-to-cursor: page coord under cursor 不变 → panX 补偿
    expect((sx - v.panX) / v.zoom).toBeCloseTo(100, 5)
    expect((sy - v.panY) / v.zoom).toBeCloseTo(100, 5)
  })

  it('zoom clamps to [0.1, 8]', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.setView({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    const h = host as unknown as { onWheel: (sx: number, sy: number, delta: number) => void }
    h.onWheel(0, 0, 100) // 大幅缩小
    expect(host.getView().zoom).toBeGreaterThanOrEqual(0.1)
    host.setView({ panX: 0, panY: 0, zoom: 7.9, gridMode: 'free' })
    h.onWheel(0, 0, -100) // 大幅放大
    expect(host.getView().zoom).toBeLessThanOrEqual(8)
  })
})

describe('SelfBuiltAdapter freedraw input', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
        clientX: x,
        clientY: y,
      }),
    )
  }

  it('select 模式(默认)不产 freedraw', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    dispatch(canvas, 'pointerdown', 10, 10)
    dispatch(canvas, 'pointermove', 50, 50)
    dispatch(canvas, 'pointerup', 50, 50)
    expect(host.getElements().filter((e) => e.kind === 'freedraw')).toHaveLength(0)
  })

  it('freedraw 模式:down/move/up 产一个 freedraw 元素,点序列 + bbox 正确', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    ;(host as unknown as { setTool: (t: string) => void }).setTool('freedraw')

    const changes: { updated: CanvasElement[]; removed: string[] }[] = []
    host.onUserChange((c) => changes.push(c as never))

    dispatch(canvas, 'pointerdown', 10, 10)
    dispatch(canvas, 'pointermove', 40, 50)
    dispatch(canvas, 'pointerup', 40, 50)

    const freedraws = host.getElements().filter((e) => e.kind === 'freedraw')
    expect(freedraws).toHaveLength(1)
    expect(freedraws[0]).toMatchObject({ kind: 'freedraw', x: 10, y: 10, w: 30, h: 40 })
    expect((freedraws[0]!.meta?.points as unknown[]).length).toBe(2)
    // commit 触发一次 onUserChange
    expect(changes.some((c) => c.updated.some((e) => e.kind === 'freedraw'))).toBe(true)
  })

  it('getTool/setTool', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { getTool: () => string; setTool: (t: string) => void }
    expect(h.getTool()).toBe('select')
    h.setTool('freedraw')
    expect(h.getTool()).toBe('freedraw')
  })
})
