/**
 * D4 WorkbenchSections(子任务 2):canvas 模式分区 + 收件箱 + 手风琴折叠/展开。
 * react-dom/client + act(policy)。i18n + canvas-store mock。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card, CanvasId } from '@cys-stift/domain'
import { WorkbenchSections } from '../workbench-sections'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, string>) =>
      p ? Object.entries(p).reduce((s, [kk, v]) => s.replace(`{${kk}}`, v), k) : k,
    locale: 'zh',
    setLocale: () => {},
  }),
}))

function mk(id: string, opts: { canvasId?: string; title?: string; pinned?: boolean } = {}): Card {
  const { canvasId, title = id, pinned = false } = opts
  return {
    id,
    title,
    body: '',
    type: 'note',
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    pinned,
    archived: false,
    canvasPosition: canvasId
      ? { canvasId: canvasId as CanvasId, x: 0, y: 0, w: 100, h: 100, z: 0 }
      : undefined,
  } as unknown as Card
}

// 顶层 mock canvas-store:空画布列表 → canvas 模式下卡全进收件箱分区。
vi.mock('@/lib/canvas-store', () => ({
  useCanvases: () => ({
    snapshot: { canvases: [], activeCanvasId: 'default' },
    ready: true,
  }),
}))

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

describe('WorkbenchSections — canvas 模式 + 手风琴', () => {
  it('无 canvasPosition 的卡 → 收件箱分区(isInbox 样式)', () => {
    const { host } = render(<WorkbenchSections cards={[mk('1')]} mode="canvas" />)
    expect(host.querySelector('.wb__sec--inbox')).toBeTruthy()
    expect(host.querySelector('.wb__seclbl')!.textContent).toContain('workbench.inbox')
  })

  it('默认展开第一个分区(aria-expanded=true)', () => {
    const { host } = render(<WorkbenchSections cards={[mk('1'), mk('2')]} mode="canvas" />)
    const headers = host.querySelectorAll('.wb__sechd')
    expect(headers.length).toBe(1)
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true')
  })

  it('点击表头 → 折叠(aria-expanded 变 false),再点展开', () => {
    const { host } = render(<WorkbenchSections cards={[mk('1')]} mode="canvas" />)
    const hd = host.querySelector('.wb__sechd') as HTMLButtonElement
    expect(hd.getAttribute('aria-expanded')).toBe('true')
    act(() => hd.click())
    expect(hd.getAttribute('aria-expanded')).toBe('false')
    act(() => hd.click())
    expect(hd.getAttribute('aria-expanded')).toBe('true')
  })

  it('展开态显示行列表(.wb__rows),折叠态显示卡组堆叠(.wb__deck)', () => {
    const { host } = render(<WorkbenchSections cards={[mk('1'), mk('2')]} mode="canvas" />)
    // 默认展开 → rows 在,deck 不在
    expect(host.querySelector('.wb__rows')).toBeTruthy()
    expect(host.querySelector('.wb__deck')).toBeNull()
    // 折叠后 → deck 在,rows 不在
    const hd = host.querySelector('.wb__sechd') as HTMLButtonElement
    act(() => hd.click())
    expect(host.querySelector('.wb__rows')).toBeNull()
    expect(host.querySelector('.wb__deck')).toBeTruthy()
  })

  it('折叠态卡组堆叠最多 3 张(A 视觉)', () => {
    const cards = [mk('1'), mk('2'), mk('3'), mk('4'), mk('5')]
    const { host } = render(<WorkbenchSections cards={cards} mode="canvas" />)
    // 先折叠
    const hd = host.querySelector('.wb__sechd') as HTMLButtonElement
    act(() => hd.click())
    const minicards = host.querySelectorAll('.wb__minicard')
    expect(minicards.length).toBe(3) // 只显示前 3 张
  })

  it('展开态行列表显示全部卡(色条 + 标题)', () => {
    const cards = [mk('a-卡'), mk('b-卡')]
    const { host } = render(<WorkbenchSections cards={cards} mode="canvas" />)
    const rows = host.querySelectorAll('.wb__row')
    expect(rows.length).toBe(2)
    expect(rows[0]!.querySelector('.wb__rowtitle')!.textContent).toContain('a-卡')
    expect(rows[0]!.querySelector('.wb__rb')).toBeTruthy() // 色条
  })

  it('多个分区:点击第二个,第一个折叠(手风琴 = 同时只一区展开)', () => {
    // 2 张卡:1 有 canvasPosition(但画布列表空 → 未知画布分区)+ 1 无(收件箱)
    const cards = [mk('1', { canvasId: 'ghost' }), mk('2')]
    const { host } = render(<WorkbenchSections cards={cards} mode="canvas" />)
    const headers = host.querySelectorAll('.wb__sechd')
    expect(headers.length).toBe(2)
    // 默认第一个(未知画布)展开
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('false')
    // 点第二个 → 第一个折叠,第二个展开
    act(() => (headers[1]! as HTMLButtonElement).click())
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('WorkbenchSections — 已固定置顶区(子任务3)', () => {
  it('pinned 卡提到置顶区,不进收件箱分组', () => {
    const cards = [mk('1', { pinned: true }), mk('2', { pinned: false })]
    const { host } = render(<WorkbenchSections cards={cards} mode="canvas" />)
    // 置顶区在,且在收件箱分区之前
    const pinnedSec = host.querySelector('.wb__sec--pinned')
    expect(pinnedSec).toBeTruthy()
    expect(pinnedSec!.querySelector('.wb__rowtitle')!.textContent).toContain('1')
    // 置顶区是第一个 section
    const allSecs = host.querySelectorAll(':scope > .wb__sections > .wb__sec, .wb__sec')
    expect(allSecs[0]).toBe(pinnedSec)
    // 收件箱分区只含卡 2
    const inboxSec = host.querySelector('.wb__sec--inbox')
    expect(inboxSec!.querySelector('.wb__rowtitle')!.textContent).toContain('2')
  })

  it('无 pinned 卡 → 不渲染置顶区', () => {
    const { host } = render(<WorkbenchSections cards={[mk('1')]} mode="canvas" />)
    expect(host.querySelector('.wb__sec--pinned')).toBeNull()
  })

  it('置顶区常驻展开(不进手风琴,无 aria-expanded)', () => {
    const { host } = render(<WorkbenchSections cards={[mk('1', { pinned: true })]} mode="canvas" />)
    const pinnedSec = host.querySelector('.wb__sec--pinned')!
    // 置顶区表头是 div 不是 button(不可折叠)
    expect(pinnedSec.querySelector('button.wb__sechd')).toBeNull()
    expect(pinnedSec.querySelector('.wb__rows--pinned')).toBeTruthy()
  })

  it('置顶区计数 = pinned 卡数', () => {
    const cards = [mk('1', { pinned: true }), mk('2', { pinned: true }), mk('3', { pinned: false })]
    const { host } = render(<WorkbenchSections cards={cards} mode="canvas" />)
    const cnt = host.querySelector('.wb__sec--pinned .wb__seccnt')!
    expect(cnt.textContent).toBe('2')
  })
})
