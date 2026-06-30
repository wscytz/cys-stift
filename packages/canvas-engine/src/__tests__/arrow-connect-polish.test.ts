/**
 * connect 工具打磨回归 — v0.40 手测反馈:拖箭头中途消失。
 * 根因:pointercancel 复用 onUp 在坏坐标 hitTest 失败 → 不建箭头 + 预览消失。
 * 修复:pointercancel 对 connect 走丢弃路径(不 hitTest、不建)。
 */
import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'
import type { CanvasElement } from '../canvas-host'

function makeHost(): { host: SelfBuiltAdapter; canvas: HTMLCanvasElement } {
  const host = new SelfBuiltAdapter(document.createElement('canvas'))
  host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
  host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })
  return { host, canvas: (host as unknown as { canvas: HTMLCanvasElement }).canvas }
}

function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y, ...extra }),
  )
}

function arrowCount(host: SelfBuiltAdapter): number {
  return host.getElements().filter((e) => e.kind === 'arrow').length
}

describe('[connect 打磨] pointercancel — 系统中断不在坏坐标判定', () => {
  it('connect 拖到卡B 过程中 pointercancel → 不建箭头(connecting 丢弃)', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    const before = arrowCount(host)
    dispatch(canvas, 'pointerdown', 50, 50) // 卡A 开 connect
    dispatch(canvas, 'pointermove', 350, 50) // 拖到卡B
    // pointercancel:系统中断时坐标常落在中断点(此处卡B 上)。旧逻辑会在该坏坐标
    // hitTest 命中卡B → 建错箭头(bug)。修复后走丢弃路径不判定。
    dispatch(canvas, 'pointercancel', 350, 50)
    expect(arrowCount(host)).toBe(before) // 不新建
  })

  it('pointercancel 后无残留 connecting(后续 move 不误建)', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50)
    dispatch(canvas, 'pointercancel', 0, 0)
    // cancel 后的陈旧 move/up 不应建箭头
    dispatch(canvas, 'pointermove', 350, 50)
    dispatch(canvas, 'pointerup', 350, 50)
    expect(arrowCount(host)).toBe(0)
  })
})
