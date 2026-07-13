/**
 * WorkbenchPanel：渲染标题/类型;收起按钮 onClose;编辑后收起 flush onSave;
 * 无专注按钮(已砍 focusEdit);tag 编辑落 onSave。
 * react-dom/client + act(policy)。i18n mock(useI18n)。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card } from '@cys-stift/domain'
import { WorkbenchPanel } from '../workbench-panel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh', setLocale: () => {} }),
}))

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

describe('WorkbenchPanel', () => {
  it('渲染卡标题(input 值)', () => {
    const { host } = render(
      <WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    const input = host.querySelector('.wb-panel__title') as HTMLInputElement
    expect(input.value).toBe('包豪斯')
  })

  it('不渲染专注切换按钮(已砍 focusEdit)', () => {
    const { host } = render(
      <WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(host.querySelector('[data-testid="wb-focus-toggle"]')).toBeNull()
  })

  it('收起按钮 → onClose(无编辑不 onSave)', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const { host } = render(<WorkbenchPanel card={card} onSave={onSave} onClose={onClose} />)
    const btn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('编辑 body 后收起 → flush onSave(含新 body)+ onClose', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const { host } = render(<WorkbenchPanel card={card} onSave={onSave} onClose={onClose} />)
    // MarkdownEditor 的 textarea
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(ta, '改过的正文')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const btn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onSave).toHaveBeenCalledWith(card.id, expect.objectContaining({ body: '改过的正文' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('加 tag 后收起 → flush onSave 含新 tag', () => {
    const onSave = vi.fn()
    const { host } = render(<WorkbenchPanel card={card} onSave={onSave} onClose={vi.fn()} />)
    const tagInput = host.querySelector('.wb-panel__tag-input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(tagInput, '新标签')
      tagInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const btn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onSave).toHaveBeenCalledWith(
      card.id,
      expect.objectContaining({
        tags: expect.arrayContaining([expect.objectContaining({ value: '新标签' })]),
      }),
    )
  })

  it('保存状态:初始空;编辑后显「保存中…」(autosave 可见化)', () => {
    const { host } = render(<WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />)
    const status = host.querySelector('[data-testid="wb-status"]') as HTMLElement
    expect(status.textContent).toBe('') // 初始无编辑 -> 空
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(ta, '新内容')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(status.textContent).toBe('workbench.saving') // dirty -> 保存中
    host.remove()
  })

  it('切卡(card.id 变)重置草稿标题', () => {
    const other = { ...card, id: 'c2', title: '另一张' } as unknown as Card
    const host2 = document.createElement('div')
    document.body.appendChild(host2)
    const root2 = createRoot(host2)
    act(() => {
      root2.render(<WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />)
    })
    act(() => {
      root2.render(<WorkbenchPanel card={other} onSave={vi.fn()} onClose={vi.fn()} />)
    })
    const input = host2.querySelector('.wb-panel__title') as HTMLInputElement
    expect(input.value).toBe('另一张')
    act(() => {
      root2.unmount()
    })
    host2.remove()
  })

  it('切卡前若有脏编辑 → flush 上一张(bug 1 防丢:autosave 500ms 未到也保)', () => {
    const onSave = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(<WorkbenchPanel card={card} onSave={onSave} onClose={vi.fn()} />)
    })
    // 编辑 c1 body(不等 autosave 500ms)
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setter.call(ta, 'c1 的编辑')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // 直接切卡 c2(模拟用户编辑后 <500ms 点另一张)
    const other = { ...card, id: 'c2', title: '另一张' } as unknown as Card
    act(() => {
      root.render(<WorkbenchPanel card={other} onSave={onSave} onClose={vi.fn()} />)
    })
    // bug 1 修:切卡 cleanup flush c1 的脏编辑,不丢
    expect(onSave).toHaveBeenCalledWith('c1', expect.objectContaining({ body: 'c1 的编辑' }))
    act(() => {
      root.unmount()
    })
    host.remove()
  })
})
