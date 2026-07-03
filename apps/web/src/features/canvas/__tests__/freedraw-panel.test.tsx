/**
 * FreedrawPanel — 识别选择器(v1:转箭头 / 转矩形)。
 *
 * 组件测试不用 @testing-library/react(非 devDep),走 react-dom/client + act。
 * useI18n mock 成 t(k)=k,故按钮 textContent === i18n key(如 'freedraw.toRect')。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { InMemoryCanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import { FreedrawPanel } from '../freedraw-panel'

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: 'zh' as const }) }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function freedrawEl(id: string, points: [number, number][]): CanvasElement {
  return { id, kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: { points } }
}

function renderPanel(host: InMemoryCanvasHost): { container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<FreedrawPanel host={host} canvasEl={null} />)
  })
  return { container }
}

function btn(container: HTMLElement, key: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === key) as
    | HTMLButtonElement
    | undefined
}

describe('FreedrawPanel — 识别选择器(转箭头 / 转矩形)', () => {
  it('闭合矩形笔画 → 显「转为矩形」不显「转为箭头」;点击 → 替换为 rect + 选中切到新元素', () => {
    const host = new InMemoryCanvasHost()
    host.upsert(freedrawEl('f1', [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]]))
    host.setSelectedIds(['f1'])
    const { container } = renderPanel(host)

    expect(btn(container, 'freedraw.toRect')).toBeTruthy() // 闭合 decoration → 显
    expect(btn(container, 'freedraw.toArrow')).toBeFalsy() // 不是 arrow → 不显

    act(() => btn(container, 'freedraw.toRect')!.click())

    const els = host.getElements()
    expect(els.some((e) => e.kind === 'rect')).toBe(true) // 转出了 rect
    expect(els.some((e) => e.id === 'f1')).toBe(false) // 原 freedraw 已移除
    expect(host.getSelectedIds()[0]).not.toBe('f1') // 选中切到新元素
  })

  it('长直线笔画 → 显「转为箭头」不显「转为矩形」', () => {
    const host = new InMemoryCanvasHost()
    const line: [number, number][] = Array.from({ length: 30 }, (_, i) => [i * 10, 0] as [number, number])
    host.upsert(freedrawEl('f2', line))
    host.setSelectedIds(['f2'])
    const { container } = renderPanel(host)

    expect(btn(container, 'freedraw.toArrow')).toBeTruthy() // 直 + 细长 → arrow
    expect(btn(container, 'freedraw.toRect')).toBeFalsy() // 非 decoration → 不显矩形
  })

  it('复制按钮始终显示(任何笔画都能复制)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert(freedrawEl('f3', [[0, 0], [50, 50]]))
    host.setSelectedIds(['f3'])
    const { container } = renderPanel(host)
    expect(btn(container, 'freedraw.duplicate')).toBeTruthy()
  })
})
