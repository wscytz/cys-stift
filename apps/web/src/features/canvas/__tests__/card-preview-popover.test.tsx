/**
 * CardPreviewPopover:只读速览浮层。渲染标题+正文+按钮;点按钮 → onEdit。
 * react-dom/client + act。mock i18n + MarkdownBody。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card } from '@cys-stift/domain'
import { CardPreviewPopover } from '../card-preview-popover'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh', setLocale: () => {} }),
}))
vi.mock('@/app/inbox/markdown', () => ({
  MarkdownBody: ({ source }: { source: string }) =>
    React.createElement('div', { 'data-testid': 'md' }, source),
}))

const card = {
  id: 'c1',
  title: '包豪斯',
  body: '正文内容',
  type: 'note',
  capturedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: [{ value: '想法', color: 'red' }],
  pinned: false,
  archived: false,
} as unknown as Card

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

describe('CardPreviewPopover', () => {
  it('渲染标题 + 正文 markdown +「在工作台编辑」按钮 + tags', () => {
    const { host } = render(<CardPreviewPopover card={card} onEdit={vi.fn()} />)
    expect(host.querySelector('.cv-preview__title')?.textContent).toBe('包豪斯')
    expect(host.querySelector('[data-testid="md"]')?.textContent).toBe('正文内容')
    expect(host.querySelector('.cv-preview__edit')?.textContent).toBe('canvas.preview.editInWorkbench')
    expect(host.querySelectorAll('.cv-preview__tags > *').length).toBe(1)
  })

  it('点「在工作台编辑」→ onEdit 被调一次', () => {
    const onEdit = vi.fn()
    const { host } = render(<CardPreviewPopover card={card} onEdit={onEdit} />)
    const btn = host.querySelector('.cv-preview__edit') as HTMLButtonElement
    act(() => btn.click())
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('空 body 不渲染正文区', () => {
    const noBody = { ...card, body: '' } as unknown as Card
    const { host } = render(<CardPreviewPopover card={noBody} onEdit={vi.fn()} />)
    expect(host.querySelector('[data-testid="md"]')).toBeNull()
  })
})
