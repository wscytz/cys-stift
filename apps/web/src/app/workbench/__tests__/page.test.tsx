/**
 * WorkbenchPage:左库 + 右编辑器二栏;cardId=null 空状态;顶栏›画布回路。
 * react-dom/client + act。mock db/workbench-store/router/canvas-store/markdown-editor。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card } from '@cys-stift/domain'
import WorkbenchPage from '../page'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, string>) =>
      p ? Object.entries(p).reduce((s, [kk, v]) => s.replace(`{${kk}}`, v), k) : k,
    locale: 'zh',
    setLocale: () => {},
  }),
}))

const card1 = {
  id: 'c1',
  title: '卡一',
  body: '正文',
  type: 'note',
  capturedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: [],
  pinned: false,
  archived: false,
} as unknown as Card

const { pushMock, closeMock, cardIdMock, updateMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  closeMock: vi.fn(),
  cardIdMock: { current: null as string | null },
  updateMock: vi.fn(),
}))

vi.mock('@/lib/db-client', () => ({
  useDb: () => ({
    snap: { v: 1 },
    ready: true,
    service: {
      listAll: () => [card1],
      get: (id: string) => (id === 'c1' ? card1 : undefined),
      update: updateMock,
    },
  }),
}))
vi.mock('@/lib/canvas-store', () => ({
  useCanvases: () => ({
    snapshot: { canvases: [], activeCanvasId: 'default' },
    ready: true,
  }),
}))
vi.mock('@/lib/workbench-store', () => ({
  workbenchStore: { close: closeMock },
  useWorkbench: () => ({ cardId: cardIdMock.current }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))
// 隔离:不渲染真实 MarkdownEditor(避免深层 store 依赖)
vi.mock('@/features/card/markdown-editor', () => ({
  MarkdownEditor: (props: { value: string }) =>
    React.createElement('div', { 'data-testid': 'md-mock' }, props.value),
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

describe('WorkbenchPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
    closeMock.mockClear()
    updateMock.mockClear()
    cardIdMock.current = null
  })

  it('cardId=null → 渲染库 + 空状态提示(selectHint),无编辑器', () => {
    const { host } = render(<WorkbenchPage />)
    expect(host.querySelector('.wb__search-input')).toBeTruthy() // 库在
    expect(host.querySelector('.wb-panel')).toBeNull() // 无编辑器
    expect(host.textContent).toContain('workbench.selectHint')
  })

  it('cardId 命中 → 渲染 WorkbenchPanel(右栏编辑器)', () => {
    cardIdMock.current = 'c1'
    const { host } = render(<WorkbenchPage />)
    expect(host.querySelector('.wb-panel')).toBeTruthy()
    const titleInput = host.querySelector('.wb-panel__title') as HTMLInputElement
    expect(titleInput).toBeTruthy()
    expect(titleInput.value).toBe('卡一')
  })

  it('顶栏「›画布」按钮 → push /canvas', () => {
    const { host } = render(<WorkbenchPage />)
    const btn = host.querySelector(
      'button[aria-label="workbench.backToCanvas"]',
    ) as HTMLButtonElement
    expect(btn).toBeTruthy()
    act(() => btn.click())
    expect(pushMock).toHaveBeenCalledWith('/canvas')
  })
})
