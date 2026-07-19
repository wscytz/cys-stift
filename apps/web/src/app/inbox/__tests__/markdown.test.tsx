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

  // ── 代码高亮(rehype-highlight + Bauhaus 语法主题,D1 收尾)──
  it('代码块高亮生效:JS 关键字被 hljs span 包裹', () => {
    // highlight 在 sanitize 后注入 hljs-* class;sanitizeSchema 已放行 span 的
    // hljs- 前缀(defaultSchema.attributes.span=null 否则会全剥)。
    const md = '```js\nconst x = 1\n```'
    const html = renderHtml(md)
    // code 元素拿到 hljs class(language-js 检测成功)
    expect(html).toMatch(/<code[^>]*class="hljs[^"]*"/)
    // 内部 span 有 hljs-keyword(const 是关键字)—— 证明高亮真注入了 span 且未被 sanitize 剥
    expect(html).toContain('hljs-keyword')
  })

  it('代码高亮不破坏 sanitize:script 在含代码块的文档里仍被剥', () => {
    // 回归:接入 rehype-highlight 后 sanitize 顺序未变,安全门仍守。
    const html = renderHtml('<script>alert(1)</script>\n```js\nconst x = 1\n```')
    expect(html).not.toContain('<script>')
    expect(html).toContain('hljs-keyword')
  })

  it('空 source 不渲染', () => {
    expect(renderHtml('   ')).toBe('')
  })

  it('块引用 embed 仍走 splitEmbeds(向后兼容)', () => {
    // 无 resolveEmbed → ((标题)) 当文本渲染
    const html = renderHtml('见 ((包豪斯背景)) 详述')
    expect(html).toContain('((包豪斯背景))')
  })

  it('保留正文中的单换行，避免阅读预览把两行合并', () => {
    const html = renderHtml('第一行\n第二行')
    expect(html).toContain('第一行\n第二行')
    expect(html).toContain('white-space: pre-line')
  })
})

describe('MarkdownBody — katex + 脚注', () => {
  // ── katex 数学公式(remark-math + rehype-katex)──
  it('渲染 inline 数学 $...$', () => {
    const html = renderHtml('勾股 $a^2+b^2=c^2$ 定理')
    // rehype-katex 注入 .katex 容器(class 含 katex)
    expect(html).toContain('katex')
  })

  it('渲染 display 数学 $$...$$', () => {
    const html = renderHtml('$$\\sum_{i=1}^n i$$')
    // display 块带 katex-display class
    expect(html).toMatch(/katex-display/)
  })

  // ── 脚注(remark-footnotes)──
  it('渲染脚注 [^1] + 定义', () => {
    const md = '参见[^1]。\n\n[^1]: 这是脚注内容'
    const html = renderHtml(md)
    expect(html).toContain('<sup') // 脚注引用号 sup
    expect(html).toMatch(/footnote/i) // footnotes 区(class/id 含 footnote)
  })

  // ── sanitize 安全门:加 math/footnote 后仍剥 script(关键回归)──
  it('sanitize 在 katex/脚注启用后仍剥 script', () => {
    const html = renderHtml('<script>alert(1)</script>$x^2$')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert(1)')
    expect(html).toContain('katex') // math 仍渲染(确认没因安全收缩误伤 math)
  })
})
