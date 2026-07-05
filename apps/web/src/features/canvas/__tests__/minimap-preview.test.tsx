/**
 * MinimapPreview —— 专注编辑态的画布预览(独立组件,不复用 Minimap)。
 * 测试:渲染 canvas + 收起剩角 chip + 收起态持久。
 * codebase policy:react-dom/client + act(非 RTL)。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import { MinimapPreview } from '../minimap-preview'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** mock host:elements + 三个订阅事件(getElements/getView/onViewChange...)。 */
function mockHost(els: CanvasElement[] = []): CanvasHost {
  return {
    getElements: () => els,
    getView: () => ({ zoom: 1, panX: 0, panY: 0, gridMode: 'off' }),
    setView: () => {},
    onViewChange: () => () => {},
    onUserChange: () => () => {},
    onSelectionChange: () => () => {},
  } as unknown as CanvasHost
}

function render(host: CanvasHost | null) {
  const h = document.createElement('div')
  document.body.appendChild(h)
  const root = createRoot(h)
  act(() => { root.render(React.createElement(MinimapPreview, { host })) })
  return {
    host: h,
    canvas: () => h.querySelector('canvas'),
    collapseBtn: () => h.querySelector('[data-testid="mp-collapse"]') as HTMLButtonElement | null,
    chip: () => h.querySelector('[data-testid="mp-chip"]'),
    unmount() { act(() => { root.unmount() }); h.remove() },
  }
}

describe('MinimapPreview', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // jsdom 的 HTMLCanvasElement.getContext('2d') 默认返回 null,会让 draw()
    // 在 ctx 空检查处早返回 → canvas.width 永远不会被设成 PREVIEW_W * dpr。
    // 这里 stub 一个宽松 2D context(任何方法调用 no-op、任何属性赋值接受)
    // 让 draw() 能跑到 canvas.width = PREVIEW_W * dpr 那行。
    const stubCtx = new Proxy({}, {
      get: () => () => {},
      set: () => true,
    })
    HTMLCanvasElement.prototype.getContext = function () {
      return stubCtx
    } as unknown as HTMLCanvasElement['getContext']
  })

  it('renders a canvas when host given and not collapsed', () => {
    const { canvas, unmount } = render(mockHost())
    expect(canvas()).not.toBeNull()
    unmount()
  })

  it('renders nothing when host is null', () => {
    const { canvas, unmount } = render(null)
    expect(canvas()).toBeNull()
    unmount()
  })

  it('collapse → only a small chip remains (no canvas)', () => {
    const { canvas, collapseBtn, chip, unmount } = render(mockHost())
    act(() => { collapseBtn()!.click() })
    expect(canvas()).toBeNull()
    expect(chip()).not.toBeNull()
    unmount()
  })

  it('collapse state persists to its own localStorage key', () => {
    const { collapseBtn, unmount } = render(mockHost())
    act(() => { collapseBtn()!.click() })
    expect(window.localStorage.getItem('cys-stift.workbench-preview-collapsed.v1')).toBe('1')
    unmount()
  })

  it('expand from collapsed triggers draw (regression: blank canvas until next host event)', () => {
    // Bug:host 订阅 effect 的 deps 是 [host, scheduleDraw],collapsed 翻转时
    // 两者都不变 → 订阅 effect 不重跑,而 canvas 是展开后才挂载的空 canvas →
    // 没有任何东西触发 draw(),画布保持空白直到下一次 host 事件。
    // 修法:加一个独立 effect,collapsed 翻 false 后 scheduleDraw() 一帧。
    //
    // 必须用 fake timers:jsdom 的 rAF 是异步 setTimeout(~0)。如果用真实 timers,
    // 初始 mount 排的 rAF 会偶然在「点击展开」之后才触发 → 那一帧碰巧画到已挂载
    // 的 canvas 上 → bug 不暴露。fake timers 让我们能在 click 前显式 flush rAF,
    // 把「展开后才需要画」这个 bug 锁死。
    //
    // 断言:draw() 设 canvas.width = PREVIEW_W * dpr;jsdom dpr=1 → 240。
    // 修复前:展开后无 rAF → canvas.width 保持 HTML 默认 300。
    vi.useFakeTimers()
    try {
      window.localStorage.setItem('cys-stift.workbench-preview-collapsed.v1', '1')
      const { chip, canvas, unmount } = render(mockHost())
      expect(canvas()).toBeNull() // 收起态:只剩 chip
      // 把初始 mount 排的 rAF 全部 flush(此时 canvas 还没挂载 → draw 空跑到早返回)
      // 这一步把「展开后偶然被初始 rAF 画到」的逃生路径堵掉。
      act(() => { vi.runAllTimers() })
      expect(canvas()).toBeNull() // 仍然收起

      // 展开画布预览
      act(() => { (chip() as HTMLElement).click() })
      expect(canvas()).not.toBeNull() // canvas 已挂载(width 还是默认 300)
      // flush 修复新增的 effect 排出来的 rAF;无 fix 时这里没东西可 flush
      act(() => { vi.runAllTimers() })
      expect(canvas()?.width).toBe(240) // PREVIEW_W * dpr (jsdom dpr=1)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
