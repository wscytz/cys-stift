/**
 * useDraggablePanelPos — 共享可拖浮窗位置 hook(抽自 minimap proven 逻辑)。
 *
 * 验证:
 * 1. 初始无持久 → positioned=false / pos=null
 * 2. localStorage 有 pos → positioned=true + 用持久值
 * 3. drag(pointerdown/move/up)写 localStorage + clamp 到 container 矩形
 * 4. 非 button 0(right-click)被忽略
 *
 * codebase policy:react-dom/client + act(非 @testing-library/react)。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useDraggablePanelPos } from '../use-draggable-panel-pos'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({ storageKey }: { storageKey: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { pos, onPointerDown, positioned } = useDraggablePanelPos(ref, storageKey)
  return (
    <div ref={ref} style={{ position: 'absolute', left: pos?.left ?? 0, top: pos?.top ?? 0 }}>
      <div data-testid="handle" onPointerDown={onPointerDown}>drag</div>
      <span data-testid="positioned">{String(positioned)}</span>
      <span data-testid="pos">{pos ? `${pos.left},${pos.top}` : 'null'}</span>
    </div>
  )
}

/** stub 一个元素的 getBoundingClientRect 返回指定 rect(覆盖 jsdom 默认全 0)。 */
function mockRect(el: HTMLElement, rect: Partial<DOMRect>) {
  el.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}),
    ...rect,
  }) as DOMRect
}

function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(<Harness storageKey="test-pos" />) })
  return {
    host,
    root,
    handle: () => host.querySelector('[data-testid="handle"]') as HTMLElement,
    positioned: () => host.querySelector('[data-testid="positioned"]')?.textContent ?? '',
    posText: () => host.querySelector('[data-testid="pos"]')?.textContent ?? '',
    unmount() { act(() => { root.unmount() }); host.remove() },
  }
}

describe('useDraggablePanelPos', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('初始无持久位置 → positioned=false / pos=null', () => {
    const r = render()
    expect(r.positioned()).toBe('false')
    expect(r.posText()).toBe('null')
    r.unmount()
  })

  it('localStorage 有 pos → positioned=true + 用持久值', () => {
    window.localStorage.setItem('test-pos', JSON.stringify({ left: 100, top: 50 }))
    const r = render()
    expect(r.positioned()).toBe('true')
    expect(r.posText()).toBe('100,50')
    r.unmount()
  })

  /**
   * drag 链:pointerdown(handle)→ pointermove(window)→ pointerup(window)。
   * 数学(container 800×600,outer 100×100 at (100,100),dx=dy=40):
   *   curLeft = startLeft - contRect.left = 100 - 0 = 100
   *   maxLeft = 800 - 100 - 4 = 696, maxTop = 600 - 100 = 500
   *   newLeft = 100 + 40 = 140(clamp 不触发)
   */
  it('drag 写 localStorage + clamp 不触发(富余空间)', () => {
    const r = render()
    const handle = r.handle()
    const outer = handle.parentElement as HTMLElement
    const container = outer.parentElement as HTMLElement
    mockRect(outer, { left: 100, top: 100, right: 200, bottom: 200, width: 100, height: 100, x: 100, y: 100 })
    mockRect(container, { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 })

    act(() => {
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: 110, clientY: 110, pointerId: 1, button: 0,
      }))
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 150, clientY: 150, pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', {
        clientX: 150, clientY: 150, pointerId: 1,
      }))
    })

    const raw = window.localStorage.getItem('test-pos')
    expect(raw).not.toBeNull()
    const p = JSON.parse(raw!) as { left: number; top: number }
    expect(p.left).toBe(140)
    expect(p.top).toBe(140)
    expect(r.positioned()).toBe('true')
    expect(r.posText()).toBe('140,140')
    r.unmount()
  })

  /**
   * clamp:outer 已贴容器右下角,继续拖出 → 限制在 maxLeft/maxTop。
   *   curLeft = 696, curTop = 500(已是 max);dx=dy=100
   *   newLeft = min(max(0, 696 + 100), 696) = 696
   *   newTop  = min(max(0, 500 + 100), 500) = 500
   */
  it('drag clamp 到 container 边界(不能拖出)', () => {
    const r = render()
    const handle = r.handle()
    const outer = handle.parentElement as HTMLElement
    const container = outer.parentElement as HTMLElement
    mockRect(outer, { left: 696, top: 500, right: 796, bottom: 600, width: 100, height: 100, x: 696, y: 500 })
    mockRect(container, { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 })

    act(() => {
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: 696, clientY: 500, pointerId: 1, button: 0,
      }))
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 796, clientY: 600, pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', {
        clientX: 796, clientY: 600, pointerId: 1,
      }))
    })

    const raw = window.localStorage.getItem('test-pos')
    expect(raw).not.toBeNull()
    const p = JSON.parse(raw!) as { left: number; top: number }
    expect(p.left).toBe(696)
    expect(p.top).toBe(500)
    r.unmount()
  })

  it('非 button 0(right-click)被忽略,不写 localStorage', () => {
    const r = render()
    const handle = r.handle()
    const outer = handle.parentElement as HTMLElement
    const container = outer.parentElement as HTMLElement
    mockRect(outer, { left: 100, top: 100, width: 100, height: 100 })
    mockRect(container, { left: 0, top: 0, width: 800, height: 600 })

    act(() => {
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: 110, clientY: 110, pointerId: 1, button: 2,
      }))
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 150, clientY: 150, pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', {
        clientX: 150, clientY: 150, pointerId: 1,
      }))
    })

    expect(window.localStorage.getItem('test-pos')).toBeNull()
    r.unmount()
  })
})

// ── edge-case 补测 ────────────────────────────────────────────────────────
// justDraggedRef 是防误触折叠的关键:pointerup 后浏览器仍 fire click → 折叠按钮
// onClick 检查 justDraggedRef.current,true 则吞掉。hook 本身只设 true(消费者重置),
// 所以这里验证:拖动设 true、亚像素抖动不设。

/** 暴露 justDraggedRef 给 test(通过外层变量捕获 hook 返回,ref 对象稳定)。 */
let hookBag: ReturnType<typeof useDraggablePanelPos> | null = null
function HarnessWithRef({ storageKey }: { storageKey: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  hookBag = useDraggablePanelPos(ref, storageKey)
  const { pos, onPointerDown } = hookBag
  return (
    <div ref={ref} style={{ position: 'absolute', left: pos?.left ?? 0, top: pos?.top ?? 0 }}>
      <div data-testid="handle" onPointerDown={onPointerDown}>drag</div>
    </div>
  )
}

function renderWithRef(storageKey = 'test-pos') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(<HarnessWithRef storageKey={storageKey} />) })
  return {
    host,
    root,
    handle: () => host.querySelector('[data-testid="handle"]') as HTMLElement,
    unmount() { act(() => { root.unmount() }); host.remove() },
  }
}

describe('useDraggablePanelPos — justDraggedRef(防误触折叠)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    hookBag = null
  })

  it('超过阈值的拖动 → justDraggedRef.current=true', () => {
    const r = renderWithRef()
    const handle = r.handle()
    const outer = handle.parentElement as HTMLElement
    const container = outer.parentElement as HTMLElement
    mockRect(outer, { left: 100, top: 100, width: 100, height: 100 })
    mockRect(container, { left: 0, top: 0, width: 800, height: 600 })

    expect(hookBag!.justDraggedRef.current).toBe(false)
    act(() => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 110, clientY: 110, pointerId: 1, button: 0 }))
      // 移动 40px(远超 3px 阈值)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, clientY: 150, pointerId: 1 }))
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, clientY: 150, pointerId: 1 }))
    })
    expect(hookBag!.justDraggedRef.current).toBe(true)
    r.unmount()
  })

  it('亚像素抖动(<3px)→ justDraggedRef 不设 + 不写 localStorage', () => {
    const r = renderWithRef()
    const handle = r.handle()
    const outer = handle.parentElement as HTMLElement
    const container = outer.parentElement as HTMLElement
    mockRect(outer, { left: 100, top: 100, width: 100, height: 100 })
    mockRect(container, { left: 0, top: 0, width: 800, height: 600 })

    act(() => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 110, clientY: 110, pointerId: 1, button: 0 }))
      // 移动 2px(低于 3px 阈值 → moved 不触发)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 112, clientY: 112, pointerId: 1 }))
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 112, clientY: 112, pointerId: 1 }))
    })
    expect(hookBag!.justDraggedRef.current).toBe(false)
    expect(window.localStorage.getItem('test-pos')).toBeNull()
    r.unmount()
  })
})

describe('useDraggablePanelPos — localStorage 损坏/缺字段', () => {
  beforeEach(() => {
    window.localStorage.clear()
    hookBag = null
  })

  it('corrupt JSON → 不抛 + pos=null', () => {
    window.localStorage.setItem('test-pos', '{ NOT JSON {{{')
    const r = renderWithRef()
    expect(hookBag!.pos).toBeNull()
    expect(hookBag!.positioned).toBe(false)
    r.unmount()
  })

  it('缺 top 字段(只有 left)→ pos=null(不半成形)', () => {
    window.localStorage.setItem('test-pos', JSON.stringify({ left: 100 }))
    const r = renderWithRef()
    expect(hookBag!.pos).toBeNull()
    expect(hookBag!.positioned).toBe(false)
    r.unmount()
  })

  it('left/top 非数字(字符串)→ pos=null', () => {
    window.localStorage.setItem('test-pos', JSON.stringify({ left: '100', top: '50' }))
    const r = renderWithRef()
    expect(hookBag!.pos).toBeNull()
    r.unmount()
  })
})

describe('useDraggablePanelPos — 多 panel 不串(storageKey 隔离)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    hookBag = null
  })

  it('两个 panel 不同 storageKey → 拖一个不污染另一个的持久值', () => {
    // panel A 持久 (10,20);panel B 无持久
    window.localStorage.setItem('pos-a', JSON.stringify({ left: 10, top: 20 }))
    const hostA = document.createElement('div')
    const hostB = document.createElement('div')
    document.body.appendChild(hostA)
    document.body.appendChild(hostB)
    const rootA = createRoot(hostA)
    const rootB = createRoot(hostB)
    act(() => { rootA.render(<HarnessWithRef storageKey="pos-a" />) })
    const bagA = hookBag
    act(() => { rootB.render(<HarnessWithRef storageKey="pos-b" />) })
    const bagB = hookBag

    expect(bagA!.pos).toEqual({ left: 10, top: 20 })
    expect(bagB!.pos).toBeNull()

    // pos-b 仍是 null(A 的持久没串过来)
    act(() => { rootA.unmount(); rootB.unmount() })
    hostA.remove()
    hostB.remove()
  })
})
