/**
 * WorkbenchBrowser:搜索框 + 模式切换器 + 分区 + 行点击就地编辑 + 当前卡高亮。
 * react-dom/client + act(policy)。i18n mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

// WorkbenchSections 调 useCanvases();mock 成空画布列表(canvas 模式下卡全进收件箱/未知画布)。
vi.mock('@/lib/canvas-store', () => ({
  useCanvases: () => ({
    snapshot: { canvases: [], activeCanvasId: 'default' },
    ready: true,
  }),
}))

// 行点击链路 + 当前卡高亮:mock router + workbenchStore/useWorkbench + toast。
// cardIdMock.current 可变(高亮测动态设)。vi.hoisted 让 mock 函数与 vi.mock 同步提升。
const { pushMock, openMock, toastMock, cardIdMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  openMock: vi.fn(),
  toastMock: vi.fn(),
  cardIdMock: { current: null as string | null },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('@/lib/workbench-store', () => ({
  workbenchStore: { open: openMock },
  useWorkbench: () => ({ cardId: cardIdMock.current }),
}))
vi.mock('@/lib/toast-store', () => ({
  pushToast: (t: { kind: string; message: string }) => toastMock(t),
}))

function mk(
  id: string,
  opts: {
    title?: string
    body?: string
    type?: Card['type']
    tags?: Array<[string, TagColor]>
    canvasId?: string
  } = {},
): Card {
  const { title = id, body = '', type = 'note', tags = [], canvasId } = opts
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
    canvasPosition: canvasId
      ? ({ canvasId, x: 0, y: 0, w: 100, h: 100, z: 0 } as Card['canvasPosition'])
      : undefined,
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

describe('WorkbenchBrowser', () => {
  beforeEach(() => {
    pushMock.mockClear()
    openMock.mockClear()
    toastMock.mockClear()
    cardIdMock.current = null
  })

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

  // ── 行点击:就地编辑(不跳画布)──
  it('行点击(有 canvasPosition)→ workbenchStore.open,不 push 不 toast', () => {
    const cards = [mk('1', { canvasId: 'c1' })]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    // canvas 模式:有 canvasPosition 但画布列表空 → 未知画布分区(非收件箱),默认展开
    const row = host.querySelector('.wb__row') as HTMLLIElement
    expect(row).toBeTruthy()
    act(() => row.click())
    expect(openMock).toHaveBeenCalledWith('1')
    expect(pushMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('行点击(无 canvasPosition,收件箱卡)→ 也就地 open,不跳 inbox 不 toast', () => {
    const cards = [mk('1')] // 无 canvasId → 收件箱
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    const row = host.querySelector('.wb__row') as HTMLLIElement
    expect(row).toBeTruthy()
    act(() => row.click())
    expect(openMock).toHaveBeenCalledWith('1')
    expect(pushMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('行键盘 Enter 触发等同点击(无障碍)', () => {
    const cards = [mk('1', { canvasId: 'c1' })]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    const row = host.querySelector('.wb__row') as HTMLLIElement
    act(() => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(openMock).toHaveBeenCalledWith('1')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('当前编辑卡行高亮(activeCardId 命中 → wb__row--active)', () => {
    cardIdMock.current = '1'
    const cards = [mk('1', { canvasId: 'c1' }), mk('2', { canvasId: 'c1' })]
    const { host } = render(<WorkbenchBrowser cards={cards} />)
    const activeRow = host.querySelector('.wb__row--active')
    expect(activeRow).toBeTruthy()
  })
})
