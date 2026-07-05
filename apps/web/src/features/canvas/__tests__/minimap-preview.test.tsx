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
})
