/**
 * T3 MarkdownEditor：工具栏点击 → onChange 收到对应 markdown；视图切换；textarea 输入。
 * 组件测试 policy：react-dom/client + act（React 19 内置）。i18n mock 因 MarkdownBody 用 useI18n。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownEditor } from '../markdown-editor'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh', setLocale: () => {} }),
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

describe('MarkdownEditor — 工具栏', () => {
  it('点 bold → onChange 收到 **占位符**', () => {
    const onChange = vi.fn()
    const { host } = render(<MarkdownEditor value="x" onChange={onChange} />)
    const btn = host.querySelector('button[aria-label="粗体"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    act(() => {
      btn.click()
    })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[0]![0]).toContain('**粗体**')
  })

  it('点 table → onChange 含表格模板', () => {
    const onChange = vi.fn()
    const { host } = render(<MarkdownEditor value="" onChange={onChange} />)
    const btn = host.querySelector('button[aria-label="表格"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onChange.mock.calls[0]![0]).toContain('| 列1 | 列2 | 列3 |')
  })

  it('点 task → onChange 含 - [ ] ', () => {
    const onChange = vi.fn()
    const { host } = render(<MarkdownEditor value="todo" onChange={onChange} />)
    const btn = host.querySelector('button[aria-label="任务列表"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onChange.mock.calls[0]![0]).toContain('- [ ]')
  })
})

describe('MarkdownEditor — 输入与视图', () => {
  it('textarea 输入 → onChange 收到输入值', () => {
    const onChange = vi.fn()
    const { host } = render(<MarkdownEditor value="" onChange={onChange} />)
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(ta, 'hello')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('hello')
  })

  it('默认 split 同时有 textarea 和预览；切预览后无 textarea', () => {
    const { host } = render(<MarkdownEditor value="# 标题" onChange={() => {}} />)
    expect(host.querySelector('textarea')).toBeTruthy()
    expect(host.querySelector('.md-editor__preview')).toBeTruthy()

    const pvBtn = host.querySelector('button[aria-label="预览"]') as HTMLButtonElement
    act(() => {
      pvBtn.click()
    })
    expect(host.querySelector('textarea')).toBeFalsy()
    expect(host.querySelector('.md-editor__preview')).toBeTruthy()
  })

  it('切源码后无预览区', () => {
    const { host } = render(<MarkdownEditor value="# 标题" onChange={() => {}} />)
    const srcBtn = host.querySelector('button[aria-label="源码"]') as HTMLButtonElement
    act(() => {
      srcBtn.click()
    })
    expect(host.querySelector('.md-editor__preview')).toBeFalsy()
    expect(host.querySelector('textarea')).toBeTruthy()
  })
})
