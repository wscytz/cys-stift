import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'

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
