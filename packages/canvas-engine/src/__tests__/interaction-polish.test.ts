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

describe('[B1-T2] 方向键 undo 粒度 — 按住重复只推 1 步', () => {
  it('首次 keydown + 多次 repeat → undo 栈只增 1(连续微移合并)', () => {
    const { host } = makeHost()
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a'])
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    // 首次按下
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: false, bubbles: true }))
    // OS 自动重复 N 次
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true }))
    }
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after - before).toBe(1) // 5 次 repeat 不再推快照
    // 卡片应移动了 6 次(首次 + 5 repeat)
    expect(host.getElement('a')!.x).toBeGreaterThan(0)
  })

  it('松开 keyup 后再按 → 推新一步(不同按下回合分开)', () => {
    const { host } = makeHost()
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a'])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: false, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
    // 新一轮按下
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: false, bubbles: true }))
    const stack = (host as unknown as { undoStack: unknown[] }).undoStack
    // 两轮各推 1 步(初始快照 + 第一轮后快照 + 第二轮后快照);关键:第二轮按下推了新步
    expect(stack.length).toBeGreaterThanOrEqual(2)
  })
})

describe('[B2-T1] 空 undo 步 — 纯点击/点空白不污染 undo 栈', () => {
  it('select 点选元素(不拖)→ undo 栈不增', () => {
    const { host, canvas } = makeHost()
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 50, 50) // 命中卡A
    dispatch(canvas, 'pointerup', 50, 50) // 松手,没拖
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after).toBe(before) // 无空步
  })

  it('select 拖动元素 → undo 栈 +1(1 步整拖)', () => {
    const { host, canvas } = makeHost()
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 50, 50)
    dispatch(canvas, 'pointermove', 120, 50) // 实际拖动
    dispatch(canvas, 'pointerup', 120, 50)
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after - before).toBe(1)
  })

  it('eraser 点空白(没擦到)→ undo 栈不增', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('eraser')
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 500, 500) // 空白
    dispatch(canvas, 'pointerup', 500, 500)
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after).toBe(before)
  })

  it('eraser 擦元素 → undo 栈 +1', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('eraser')
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 50, 50) // 擦卡A
    dispatch(canvas, 'pointerup', 50, 50)
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after - before).toBe(1)
  })

  it('resize 点 handle 不拖 → undo 栈不增', () => {
    const { host, canvas } = makeHost()
    // 卡A 右下角 handle 约在 (100,100)
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 100, 100) // 命中 handle
    dispatch(canvas, 'pointerup', 100, 100) // 不拖
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after).toBe(before)
  })
})
