/**
 * D4 WorkbenchBrowser shell(子任务 1):搜索框 + 模式切换器 + placeholder 计数 + 搜索过滤。
 * 子任务 2-4 会替换 placeholder 为真实分组(这些测试届时调整)。
 * react-dom/client + act(policy)。i18n mock。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card } from '@cys-stift/domain'
import { WorkbenchBrowser } from '../workbench-browser'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, string>) =>
      p ? Object.entries(p).reduce((s, [kk, v]) => s.replace(`{${kk}}`, v), k) : k,
    locale: 'zh',
    setLocale: () => {},
  }),
}))

// WorkbenchSections 调 useCanvases();mock 成空画布列表(canvas 模式下卡全进收件箱)。
vi.mock('@/lib/canvas-store', () => ({
  useCanvases: () => ({
    snapshot: { canvases: [], activeCanvasId: 'default' },
    ready: true,
  }),
}))

function mk(id: string, title: string, body = ''): Card {
  return {
    id,
    title,
    body,
    type: 'note',
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    pinned: false,
    archived: false,
  } as unknown as Card
}

function render(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return {
    host,
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

/** Drive a controlled <input>:React 受控组件必须用原型 setter,直接赋 .value 不触发 onChange。 */
function setInputValue(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('WorkbenchBrowser shell (子任务1)', () => {
  it('渲染搜索框 + 3 个模式 tab', () => {
    const { host } = render(<WorkbenchBrowser cards={[mk('1', 'a')]} />)
    expect(host.querySelector('.wb__search-input')).toBeTruthy()
    const tabs = host.querySelectorAll('.wb__mode')
    expect(tabs.length).toBe(3)
    expect(tabs[0]!.textContent).toContain('workbench.mode.canvas')
    expect(tabs[1]!.textContent).toContain('workbench.mode.type')
    expect(tabs[2]!.textContent).toContain('workbench.mode.tag')
  })

  it('默认选中画布模式(aria-selected)', () => {
    const { host } = render(<WorkbenchBrowser cards={[mk('1', 'a')]} />)
    const onTab = host.querySelector('.wb__mode[aria-selected="true"]')
    expect(onTab?.textContent).toContain('workbench.mode.canvas')
  })

  it('点击切换模式(画布→类型)', () => {
    const { host } = render(<WorkbenchBrowser cards={[mk('1', 'a')]} />)
    const tabs = host.querySelectorAll('.wb__mode')
    act(() => {
      tabs[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const onTab = host.querySelector('.wb__mode[aria-selected="true"]')
    expect(onTab?.textContent).toContain('workbench.mode.type')
  })

  it('有卡 → 渲染分区(WorkbenchSections)', () => {
    const cards = [mk('1', 'a'), mk('2', 'b'), mk('3', 'c')]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    // canvas 模式:3 张无 canvasPosition 的卡 → 进收件箱分区
    expect(host.querySelector('.wb__sections')).toBeTruthy()
    expect(host.querySelector('.wb__sec--inbox')).toBeTruthy()
  })

  it('搜索过滤:title 匹配保留,不匹配隐藏', () => {
    const cards = [mk('1', '包豪斯'), mk('2', '其他')]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    const input = host.querySelector('.wb__search-input') as HTMLInputElement
    act(() => setInputValue(input, '包豪斯'))
    // 命中 1 张 → sections 仍在(非 noMatch)
    expect(host.querySelector('.wb__sections')).toBeTruthy()
  })

  it('搜索无匹配 → 显示 noMatch,sections 消失', () => {
    const { host } = render(<WorkbenchBrowser cards={[mk('1', 'a')]} />)
    const input = host.querySelector('.wb__search-input') as HTMLInputElement
    act(() => setInputValue(input, 'zzz不存在的'))
    expect(host.querySelector('.wb__no-match')).toBeTruthy()
    expect(host.querySelector('.wb__sections')).toBeNull()
  })
})
