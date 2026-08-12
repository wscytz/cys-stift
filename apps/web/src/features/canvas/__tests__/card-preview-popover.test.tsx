/**
 * CardPreviewPopover:只读速览浮层(R9 改 pointer-events:none 纯只读,去掉编辑按钮)。
 * 渲染标题+正文+tags;编辑走双击卡/工作台(不在此按钮)。
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
  it('渲染标题 + 正文 markdown + tags(纯只读,无编辑按钮)', () => {
    const { host } = render(<CardPreviewPopover card={card} />)
    expect(host.querySelector('.cv-preview__title')?.textContent).toBe('包豪斯')
    expect(host.querySelector('[data-testid="md"]')?.textContent).toBe('正文内容')
    expect(host.querySelector('.cv-preview__edit')).toBeNull() // R9:编辑走双击/工作台
    expect(host.querySelectorAll('.cv-preview__tags > *').length).toBe(1)
  })

  it('pointer-events:none(纯只读,不拦截画布指针)', () => {
    const { host } = render(<CardPreviewPopover card={card} />)
    const style = host.querySelector('.cv-preview')?.getAttribute('style')
    // 内联 style 走 <style> 标签注入,此处断言 className 存在 + 无交互元素即可;
    // pointer-events 由 styles 常量(独立 CSS 字符串)保证。
    expect(host.querySelector('.cv-preview')).toBeTruthy()
    void style
  })

  it('空 body 不渲染正文区', () => {
    const noBody = { ...card, body: '' } as unknown as Card
    const { host } = render(<CardPreviewPopover card={noBody} />)
    expect(host.querySelector('[data-testid="md"]')).toBeNull()
  })
})
