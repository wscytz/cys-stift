/**
 * D1 富 Markdown(remark-gfm)回归:表格 / 任务列表 / 删除线渲染 + sanitize 仍剥 script。
 * 组件测试 policy:react-dom/client + act(React 19 内置),不用 @testing-library/react。
 * 样板见 lib/__tests__/use-debounced-callback.test.tsx。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownBody } from '../markdown'

// Mark the env as an act environment so React doesn't warn about act() usage.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

// EmbedRenderer 调 useI18n();mock 掉避免 i18n provider 包裹。
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (k: string) => k,
    locale: 'zh',
    setLocale: () => {},
  }),
}))

function renderHtml(source: string): string {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(<MarkdownBody source={source} />)
  })
  const html = host.innerHTML
  act(() => {
    root.unmount()
  })
  host.remove()
  return html
}

describe('MarkdownBody — 富 Markdown (remark-gfm)', () => {
  it('渲染 GFM 表格', () => {
    const md = '| 年份 | 事件 |\n| --- | --- |\n| 1919 | 建校 |\n'
    const html = renderHtml(md)
    expect(html).toContain('<table>')
    expect(html).toContain('<th>年份</th>')
    expect(html).toContain('<td>1919</td>')
  })

  it('渲染任务列表 checkbox', () => {
    const md = '- [ ] 待办\n- [x] 已完成\n'
    const html = renderHtml(md)
    expect(html).toContain('type="checkbox"')
    // 已完成项的 input 带 checked
    expect(html).toMatch(/checked/)
  })

  it('渲染删除线 del', () => {
    const html = renderHtml('~~废弃~~')
    expect(html).toContain('<del>废弃</del>')
  })

  it('sanitize 仍剥 script(安全门)', () => {
    const html = renderHtml('<script>alert(1)</script>正文')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert(1)')
  })

  it('空 source 不渲染', () => {
    expect(renderHtml('   ')).toBe('')
  })

  it('块引用 embed 仍走 splitEmbeds(向后兼容)', () => {
    // 无 resolveEmbed → ((标题)) 当文本渲染
    const html = renderHtml('见 ((包豪斯背景)) 详述')
    expect(html).toContain('((包豪斯背景))')
  })
})
