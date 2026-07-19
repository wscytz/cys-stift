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

function render(host: CanvasHost | null, options: { expanded?: boolean } = {}) {
  if (options.expanded !== false) {
    window.localStorage.setItem('cys-stift.workbench-preview-collapsed.v1', '0')
  }
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

  it('starts collapsed when the user has not chosen a preview state', () => {
    const r = render(mockHost(), { expanded: false })
    expect(r.canvas()).toBeNull()
    expect(r.chip()).not.toBeNull()
    r.unmount()
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
    expect((chip() as HTMLElement).style.width).toBe('44px')
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
      const { chip, canvas, unmount } = render(mockHost(), { expanded: false })
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

/**
 * 拖拽位置 + 持久化(Task 3)。
 *
 * jsdom 不做 layout(getBoundingClientRect 默认全 0),所以拖拽测试直接 stub
 * outer(组件外层 div)和 container(parentElement)的 getBoundingClientRect
 * 返回真实尺寸,让 clamp 公式能算出非零 left/top。然后 dispatch pointer 事件
 * 链:header 上 pointerdown → window 上 pointermove + pointerup。最后断言
 * localStorage 被写入(最可靠的信号 —— 无像素/布局依赖)。
 */
describe('MinimapPreview drag', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // 同主 describe 的 getContext stub(draw() 才不会在 ctx 空检查处早返回)
    const stubCtx = new Proxy({}, {
      get: () => () => {},
      set: () => true,
    })
    HTMLCanvasElement.prototype.getContext = function () {
      return stubCtx
    } as unknown as HTMLCanvasElement['getContext']
  })

  /** stub 一个元素的 getBoundingClientRect 返回指定 rect(覆盖默认全 0)。 */
  function mockRect(el: HTMLElement, rect: Partial<DOMRect>) {
    el.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect
  }

  /** 找到 drag handler 作用的三个元素:header(onPointerDown)/ outer(ref)/ container(parentElement)。 */
  function findDragElements(r: ReturnType<typeof render>) {
    const header = r.collapseBtn()!.parentElement as HTMLElement
    const outer = header.parentElement as HTMLElement
    const container = outer.parentElement as HTMLElement
    return { header, outer, container }
  }

  /** 跑一次 pointerdown(header)→ pointermove(window)→ pointerup(window)的拖拽序列。 */
  function dragSequence(header: HTMLElement, fromX: number, fromY: number, toX: number, toY: number) {
    act(() => {
      header.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: fromX, clientY: fromY, pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: toX, clientY: toY, pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', {
        clientX: toX, clientY: toY, pointerId: 1,
      }))
    })
  }

  it('drag (pointerdown + pointermove + pointerup) writes pos to its own localStorage key', () => {
    const r = render(mockHost())
    const { header, outer, container } = findDragElements(r)
    // outer 240×204(展开态:header ~24 + canvas 180)
    // container 800×600(富余空间让 clamp 不触发,拖拽真实落点)
    mockRect(outer, { left: 100, top: 100, right: 340, bottom: 304, width: 240, height: 204, x: 100, y: 100 })
    mockRect(container, { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 })

    dragSequence(header, 110, 110, 150, 150)

    const posRaw = window.localStorage.getItem('cys-stift.workbench-preview-pos.v1')
    expect(posRaw).not.toBeNull()
    const pos = JSON.parse(posRaw!) as { left: unknown; top: unknown }
    // 必须是真数字(null/undefined 算失败 —— 拖拽确实落了位置)
    expect(typeof pos.left).toBe('number')
    expect(typeof pos.top).toBe('number')
    // 数学验证(防 clamp 公式漂移):
    //   dx = 150 - 110 = 40, dy = 40
    //   startLeft - contRect.left + dx = 100 - 0 + 40 = 140
    //   maxLeft = 800 - 240 - 4 = 556, maxTop = 600 - 204 = 396
    //   → newLeft = 140, newTop = 140(clamp 不触发)
    expect(pos.left).toBe(140)
    expect(pos.top).toBe(140)
    r.unmount()
  })

  it('drag does NOT pollute the right-bottom Minimap\'s pos key (independent keys)', () => {
    const r = render(mockHost())
    const { header, outer, container } = findDragElements(r)
    mockRect(outer, { left: 100, top: 100, right: 340, bottom: 304, width: 240, height: 204, x: 100, y: 100 })
    mockRect(container, { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 })

    dragSequence(header, 110, 110, 150, 150)

    expect(window.localStorage.getItem('cys-stift.workbench-preview-pos.v1')).not.toBeNull()
    // 反向断言:不能写到原 minimap 的位置 key(那是右下小地图的)
    expect(window.localStorage.getItem('cys-stift.minimap-pos.v1')).toBeNull()
    r.unmount()
  })

  it('drag clamps position to container bounds (cannot drag out of viewport)', () => {
    const r = render(mockHost())
    const { header, outer, container } = findDragElements(r)
    // outer 已贴在容器右下角,继续往右下拖 → clamp 到 maxLeft/maxTop
    mockRect(outer, { left: 556, top: 396, right: 796, bottom: 600, width: 240, height: 204, x: 556, y: 396 })
    mockRect(container, { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 })

    // 从 outer 左上角拖 100px → 期望被 clamp 到 maxLeft=556, maxTop=396(不动)
    dragSequence(header, 556, 396, 656, 496)

    const posRaw = window.localStorage.getItem('cys-stift.workbench-preview-pos.v1')
    expect(posRaw).not.toBeNull()
    const pos = JSON.parse(posRaw!) as { left: number; top: number }
    // maxLeft = 800 - 240 - 4 = 556, maxTop = 600 - 204 = 396 → clamp 到这两值
    // Tightened to exact === (off-by-one guard on clamp formula):
    //   startLeft - contRect.left + dx = 556 - 0 + 100 = 656 → min(656, 556) = 556
    //   startTop  - contRect.top  + dy = 396 - 0 + 100 = 496 → min(496, 396) = 396
    expect(pos.left).toBe(556)
    expect(pos.top).toBe(396)
    r.unmount()
  })

  /**
   * Regression: drag-then-release-on-collapse-button must NOT toggle collapse.
   *
   * Bug (Task 3 review finding): collapse button is a CHILD of the header div
   * with onPointerDown, not a sibling. User pointerdowns on/near the button,
   * drifts >3px (dead zone passed → drag fires), releases on the button →
   * browser synthesizes a `click` on the release target → toggleCollapse fires
   * → preview collapses unexpectedly. The 3px dead zone only prevents
   * click-misread-as-drag; it does NOT prevent the inverse (drag-then-release
   * misread as click). Fix mirrors minimap-component.tsx's justDraggedRef.
   */
  it('drag ending on collapse button does NOT collapse (justDraggedRef swallows click)', () => {
    const r = render(mockHost())
    const { collapseBtn } = r
    // 无需 mock rect —— 只验证 click-suppression 逻辑,不验证 clamp。
    // 但 onHeaderPointerDown 早返回若无 parentElement.getBoundingClientRect,
    // jsdom 默认全 0 rect 也能跑通 clamp 数学(0-0-4 取 max 0)。
    act(() => {
      // pointerdown on the collapse button (child of header → bubbles to onHeaderPointerDown)
      collapseBtn()!.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: 100, clientY: 100, pointerId: 1,
      }))
      // pointermove >3px → dead zone cleared → moved=true, justDraggedRef.current=true
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 110, clientY: 110, pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', {
        clientX: 110, clientY: 110, pointerId: 1,
      }))
      // jsdom 不自动在 pointerup 后合成 click;显式 dispatch 模拟真实浏览器行为
      // (release target receives click)。这正是 bug 触发路径。
      collapseBtn()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // 没折叠 → canvas 仍在 + chip 不存在
    expect(r.canvas()).not.toBeNull()
    expect(r.chip()).toBeNull()
    r.unmount()
  })
})
