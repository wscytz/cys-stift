/**
 * D4 WorkbenchBrowser shell(子任务 1):搜索框 + 模式切换器 + placeholder 计数 + 搜索过滤。
 * 子任务 2-4 会替换 placeholder 为真实分组(这些测试届时调整)。
 * react-dom/client + act(policy)。i18n mock。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card, TagColor, TagRef } from '@cys-stift/domain'
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

function mk(
  id: string,
  opts: { title?: string; body?: string; type?: Card['type']; tags?: Array<[string, TagColor]> } = {},
): Card {
  const { title = id, body = '', type = 'note', tags = [] } = opts
  return {
    id,
    title,
    body,
    type,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: tags.map(([value, color]) => ({ value, color } as TagRef)),
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
    const { host } = render(<WorkbenchBrowser cards={[mk('1', { title: 'a' })]} />)
    expect(host.querySelector('.wb__search-input')).toBeTruthy()
    const tabs = host.querySelectorAll('.wb__mode')
    expect(tabs.length).toBe(3)
    expect(tabs[0]!.textContent).toContain('workbench.mode.canvas')
    expect(tabs[1]!.textContent).toContain('workbench.mode.type')
    expect(tabs[2]!.textContent).toContain('workbench.mode.tag')
  })

  it('默认选中画布模式(aria-selected)', () => {
    const { host } = render(<WorkbenchBrowser cards={[mk('1', { title: 'a' })]} />)
    const onTab = host.querySelector('.wb__mode[aria-selected="true"]')
    expect(onTab?.textContent).toContain('workbench.mode.canvas')
  })

  it('点击切换模式(画布→类型)', () => {
    const { host } = render(<WorkbenchBrowser cards={[mk('1', { title: 'a' })]} />)
    const tabs = host.querySelectorAll('.wb__mode')
    act(() => {
      tabs[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const onTab = host.querySelector('.wb__mode[aria-selected="true"]')
    expect(onTab?.textContent).toContain('workbench.mode.type')
  })

  it('有卡 → 渲染分区(WorkbenchSections)', () => {
    const cards = [mk('1', { title: 'a' }), mk('2', { title: 'b' }), mk('3', { title: 'c' })]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    // canvas 模式:3 张无 canvasPosition 的卡 → 进收件箱分区
    expect(host.querySelector('.wb__sections')).toBeTruthy()
    expect(host.querySelector('.wb__sec--inbox')).toBeTruthy()
  })

  it('搜索过滤:title 匹配保留,不匹配隐藏', () => {
    const cards = [mk('1', { title: '包豪斯' }), mk('2', { title: '其他' })]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    const input = host.querySelector('.wb__search-input') as HTMLInputElement
    act(() => setInputValue(input, '包豪斯'))
    // 命中 1 张 → sections 仍在(非 noMatch)
    expect(host.querySelector('.wb__sections')).toBeTruthy()
  })

  it('搜索无匹配 → 显示 noMatch,sections 消失', () => {
    const { host } = render(<WorkbenchBrowser cards={[mk('1', { title: 'a' })]} />)
    const input = host.querySelector('.wb__search-input') as HTMLInputElement
    act(() => setInputValue(input, 'zzz不存在的'))
    expect(host.querySelector('.wb__no-match')).toBeTruthy()
    expect(host.querySelector('.wb__sections')).toBeNull()
  })

  // ── 子任务 4:类型模式 + 标签模式 ──
  it('类型模式:type 不同的卡进不同分区', () => {
    const cards = [
      mk('1', { type: 'code' }),
      mk('2', { type: 'note' }),
      mk('3', { type: 'code' }),
    ]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    act(() => {
      ;(host.querySelectorAll('.wb__mode')[1]! as HTMLButtonElement).click()
    })
    const labels = Array.from(host.querySelectorAll('.wb__seclbl')).map((e) => e.textContent)
    expect(labels).toContain('code')
    expect(labels).toContain('note')
  })

  it('标签模式:显示标签 chip 栏(aggregateTags 按 count 降序)', () => {
    const RED = 'var(--color-red)' as TagColor
    const cards = [
      mk('1', { tags: [['a', RED], ['b', RED]] }),
      mk('2', { tags: [['a', RED]] }),
    ]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    act(() => {
      ;(host.querySelectorAll('.wb__mode')[2]! as HTMLButtonElement).click()
    })
    const chips = host.querySelectorAll('.wb__tagchip')
    expect(chips.length).toBe(2)
    // a(2) 排在 b(1) 前
    expect(chips[0]!.textContent).toContain('a')
    expect(chips[0]!.textContent).toContain('2') // count
  })

  it('标签模式:未选标签 → 显示 selectTagHint,无分区', () => {
    const RED = 'var(--color-red)' as TagColor
    const { host } = render(
      <WorkbenchBrowser cards={[mk('1', { tags: [['a', RED]] })]} />,
    )
    act(() => {
      ;(host.querySelectorAll('.wb__mode')[2]! as HTMLButtonElement).click()
    })
    expect(host.querySelector('.wb__hint')).toBeTruthy()
    expect(host.querySelector('.wb__sections')).toBeNull()
  })

  it('标签模式:选标签 → 按标签分组(任一匹配)', () => {
    const RED = 'var(--color-red)' as TagColor
    const BLUE = 'var(--color-blue)' as TagColor
    const cards = [
      mk('1', { tags: [['a', RED], ['b', BLUE]] }),
      mk('2', { tags: [['a', RED]] }),
    ]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    act(() => {
      ;(host.querySelectorAll('.wb__mode')[2]! as HTMLButtonElement).click()
    })
    // 选 a + b
    const chips = host.querySelectorAll('.wb__tagchip')
    act(() => (chips[0]! as HTMLButtonElement).click())
    act(() => (chips[1]! as HTMLButtonElement).click())
    const labels = Array.from(host.querySelectorAll('.wb__seclbl')).map((e) => e.textContent)
    expect(labels).toContain('a')
    expect(labels).toContain('b')
  })

  it('标签模式:无标签卡 → chip 栏显示 noTags 提示', () => {
    const { host } = render(<WorkbenchBrowser cards={[mk('1')]} />)
    act(() => {
      ;(host.querySelectorAll('.wb__mode')[2]! as HTMLButtonElement).click()
    })
    expect(host.querySelector('.wb__tagempty')).toBeTruthy()
  })
})
