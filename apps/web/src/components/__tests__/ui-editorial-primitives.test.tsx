/**
 * ui 包新编辑原语冒烟:Tabs / DataTable / TopBar(2026-08-25 组件补齐)。
 * 钉住三件的行为契约:Tabs 的 tablist 语义 + 点击/箭头切换;DataTable 的
 * 真表格结构 + 空态占位;TopBar 的 crumb/title/actions 槽位。
 */
import { describe, it, expect, afterEach } from 'vitest'
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Tabs } from '@cys-stift/ui/tabs'
import { DataTable, type DataTableColumn } from '@cys-stift/ui/data-table'
import { TopBar } from '@cys-stift/ui/top-bar'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  container?.remove()
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
}

describe('Tabs', () => {
  function Harness() {
    const [v, setV] = useState<'all' | 'unread' | 'pinned'>('all')
    return (
      <Tabs
        ariaLabel="视图"
        tabs={[
          { id: 'all', label: '全部' },
          { id: 'unread', label: '未读' },
          { id: 'pinned', label: '置顶' },
        ]}
        active={v}
        onChange={setV}
      />
    )
  }

  it('tablist/tab 语义 + aria-selected 初始态', () => {
    mount(<Harness />)
    const list = container!.querySelector('[role="tablist"]')
    expect(list).toBeTruthy()
    expect(list!.getAttribute('aria-label')).toBe('视图')
    const tabs = [...container!.querySelectorAll('[role="tab"]')]
    expect(tabs.map((t) => t.textContent)).toEqual(['全部', '未读', '置顶'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  })

  it('点击切换激活;ArrowRight 环绕到首项', () => {
    mount(<Harness />)
    const tabs = () => [...container!.querySelectorAll('[role="tab"]')] as HTMLButtonElement[]
    act(() => tabs()[1].click())
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true')
    // 箭头:从「未读」右移到「置顶」,再右移环绕回「全部」
    act(() => tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true')
    act(() => tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
  })
})

describe('DataTable', () => {
  const cols: Array<DataTableColumn<{ id: string; name: string; n: number }>> = [
    { key: 'name', header: 'Title', render: (r) => r.name },
    { key: 'n', header: 'Count', render: (r) => String(r.n), align: 'right' },
  ]
  const rows = [
    { id: 'a', name: 'Alpha', n: 3 },
    { id: 'b', name: 'Beta', n: 7 },
  ]

  it('真表格结构:thead scope=col 表头 + tbody 行,列渲染与对齐类', () => {
    mount(<DataTable ariaLabel="示例表" columns={cols} rows={rows} rowKey={(r) => r.id} />)
    const table = container!.querySelector('table')
    expect(table!.getAttribute('aria-label')).toBe('示例表')
    const ths = [...container!.querySelectorAll('th')]
    expect(ths.map((t) => t.textContent)).toEqual(['Title', 'Count'])
    expect(ths.every((t) => t.getAttribute('scope') === 'col')).toBe(true)
    const trs = [...container!.querySelectorAll('tbody tr')]
    expect(trs).toHaveLength(2)
    expect(trs[0].textContent).toBe('Alpha3')
    // 右对齐列带修饰类(CSS module 哈希前缀断言)
    expect(trs[0].lastElementChild!.className).toMatch(/align-right/)
  })

  it('空态:一整行占位,colSpan 覆盖全部列', () => {
    mount(<DataTable ariaLabel="空表" columns={cols} rows={[]} rowKey={(r) => r.id} empty="没有条目" />)
    const td = container!.querySelector('tbody td')
    expect(td).toBeTruthy()
    expect(td!.getAttribute('colspan')).toBe('2')
    expect(td!.textContent).toBe('没有条目')
  })
})

describe('TopBar', () => {
  it('crumb + 标题 + actions 槽位;crumb 省略时只有标题', () => {
    mount(<TopBar crumb="cy's stift" title="Inbox" actions={<button type="button">导出</button>} />)
    const header = container!.querySelector('header')
    expect(header).toBeTruthy()
    expect(header!.textContent).toContain("cy's stift")
    expect(header!.textContent).toContain('Inbox')
    expect(header!.querySelector('button')!.textContent).toBe('导出')
    // 分隔符是装饰,aria-hidden
    expect(header!.querySelector('[aria-hidden="true"]')!.textContent).toBe('/')
    mount(<TopBar title="Archive" />)
    expect(container!.textContent).toBe('Archive')
  })
})
