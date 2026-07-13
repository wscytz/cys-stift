/** 验证 MarkdownBody 渲染 ATX 标题(### -> h3, ## -> h2)。sanitize 不能剥 h1-h6。 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownBody, sanitizeSchema } from '../markdown'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh' as const, setLocale: () => {} }),
}))

function renderMd(source: string): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(React.createElement(MarkdownBody, { source }))
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

describe('MarkdownBody 标题渲染', () => {
  it('### 渲染为 <h3>', () => {
    const { host, unmount } = renderMd('### 标题')
    expect(host.querySelector('h3')?.textContent, host.innerHTML).toBe('标题')
    unmount()
  })

  it('## 渲染为 <h2>', () => {
    const { host, unmount } = renderMd('## 二级标题')
    expect(host.querySelector('h2')?.textContent, host.innerHTML).toBe('二级标题')
    unmount()
  })

  it('# 渲染为 <h1>', () => {
    const { host, unmount } = renderMd('# 一级')
    expect(host.querySelector('h1')?.textContent, host.innerHTML).toBe('一级')
    unmount()
  })

  it('sanitizeSchema 放行 h1-h6(防被删致标题不渲染 —— bug 1 守卫)', () => {
    const tags = sanitizeSchema.tagNames as string[]
    expect(tags, 'h1-h6 必须在 tagNames,否则 rehype-sanitize 剥标题').toContain('h1')
    for (const h of ['h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(tags).toContain(h)
    }
  })
})
