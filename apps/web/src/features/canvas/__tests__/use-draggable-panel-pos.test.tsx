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
