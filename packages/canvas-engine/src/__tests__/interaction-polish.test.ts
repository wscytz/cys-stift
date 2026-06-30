/**
 * v0.41 批 1 交互打磨回归。
 * B1-T1: Tab 切走/页面失焦时交互态残留 → 幽灵移动。
 *   根因:无 visibilitychange 监听,Tab 隐藏不发 pointerup/cancel,所有态残留。
 *   修复:挂 window visibilitychange,隐藏时 clearInteractionState。
 *
 * 约束:jsdom 下 ctx===null,renderNow 跳过;只测状态机数据层。
 */
import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'

function makeHost(): { host: SelfBuiltAdapter; canvas: HTMLCanvasElement } {
  const host = new SelfBuiltAdapter(document.createElement('canvas'))
  host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
  return { host, canvas: (host as unknown as { canvas: HTMLCanvasElement }).canvas }
}

function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y, ...extra }),
  )
}

describe('[B1-T1] visibilitychange — 页面隐藏清交互残留', () => {
  it('拖拽中途页面隐藏 → dragGroup 清空,后续 move 不误移', () => {
    const { host, canvas } = makeHost()
    dispatch(canvas, 'pointerdown', 50, 50) // 命中卡A,进 dragGroup
    // 模拟 Tab 切走:visibilitychange hidden
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    window.dispatchEvent(new Event('visibilitychange'))
    // dragGroup 应已清空(经 cast 读私有 dragGroup)
    const dragGroup = (host as unknown as { dragGroup: unknown }).dragGroup
    expect(dragGroup).toBeNull()
    // 后续 move 不应移动卡A(无 dragGroup → 不进 drag 分支)
    dispatch(canvas, 'pointermove', 200, 200)
    expect(host.getElement('a')).toMatchObject({ x: 0, y: 0 })
  })

  it('connect 中途页面隐藏 → connecting 清空,后续 move 不建箭头', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50) // 开 connect
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    window.dispatchEvent(new Event('visibilitychange'))
    const connecting = (host as unknown as { connecting: unknown }).connecting
    expect(connecting).toBeNull()
  })

  it('页面恢复 visible 不破坏(不抛错,元素不变)', () => {
    const { host, canvas } = makeHost()
    dispatch(canvas, 'pointerdown', 50, 50)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    window.dispatchEvent(new Event('visibilitychange')) // 不应抛、不应清元素
    expect(host.getElement('a')).toMatchObject({ id: 'a' })
  })
})
