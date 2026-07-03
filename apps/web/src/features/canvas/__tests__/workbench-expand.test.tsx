/**
 * T5 CardDetailModal「展开工作台」按钮:onExpand 存在时渲染,点击 → onExpand。
 * react-dom/client + act(policy)。i18n / db / global-edges / markdown 全 mock。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card } from '@cys-stift/domain'

// --- Mocks (must be before component import; vitest hoists vi.mock) ---

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh' as const, setLocale: () => {} }),
}))

vi.mock('@/lib/db-client', () => ({
  useDb: () => ({
    snap: { cards: [] },
    service: { listAll: () => [], get: () => null },
    ready: true,
  }),
}))

vi.mock('@/features/graph/use-global-edges', () => ({
  useGlobalEdges: () => ({ edges: [], loaded: true }),
}))

vi.mock('@/app/inbox/markdown', () => ({
  MarkdownBody: ({ source }: { source: string }) => <div data-testid="md">{source}</div>,
}))

import { CardDetailModal } from '../card-detail-modal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const card = {
  id: 'c1',
  title: '包豪斯',
  body: '正文',
  type: 'note',
  capturedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: [],
  pinned: false,
  archived: false,
} as unknown as Card

function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return host
}

function findButtonByText(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined
}

describe('CardDetailModal — T5 展开工作台按钮', () => {
  it('传 onExpand → 渲染按钮(文案 = canvas.workbench.expand);点击 → onExpand 被调', () => {
    const onExpand = vi.fn()
    const host = render(
      <CardDetailModal
        card={card}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
        onExpand={onExpand}
      />,
    )
    const btn = findButtonByText(host, 'canvas.workbench.expand')
    expect(btn, '展开工作台按钮应渲染').toBeTruthy()
    act(() => {
      btn!.click()
    })
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('不传 onExpand → 不渲染展开按钮(其它调用方如 features/card 不破)', () => {
    const host = render(
      <CardDetailModal
        card={card}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const btn = findButtonByText(host, 'canvas.workbench.expand')
    expect(btn).toBeUndefined()
  })
})
