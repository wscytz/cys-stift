/**
 * T4 WorkbenchPanel：渲染标题/类型；收起按钮 onClose；编辑后收起 flush onSave。
 * react-dom/client + act（policy）。i18n mock（useI18n）。
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
  it('渲染卡标题（input 值）', () => {
    const { host } = render(
      <WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    const input = host.querySelector('.wb-panel__title') as HTMLInputElement
    expect(input.value).toBe('包豪斯')
  })

  it('收起按钮 → onClose（无编辑不 onSave）', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const { host } = render(<WorkbenchPanel card={card} onSave={onSave} onClose={onClose} />)
    const btn = host.querySelector('button[aria-label="common.close"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('编辑 body 后收起 → flush onSave（含新 body）+ onClose', () => {
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
    const btn = host.querySelector('button[aria-label="common.close"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ body: '改过的正文' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('切卡（card.id 变）重置草稿标题', () => {
    const other = { ...card, id: 'c2', title: '另一张' } as unknown as Card
    const { host, rerender } = render(
      <WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />,
    ) as ReturnType<typeof render> & { rerender?: (el: React.ReactElement) => void }
    // createRoot 没有 rerender；改用 unmount + 再 render
    host.remove()
    const host2 = document.createElement('div')
    document.body.appendChild(host2)
    const root2 = createRoot(host2)
    act(() => {
      root2.render(<WorkbenchPanel card={other} onSave={vi.fn()} onClose={vi.fn()} />)
    })
    const input = host2.querySelector('.wb-panel__title') as HTMLInputElement
    expect(input.value).toBe('另一张')
    act(() => {
      root2.unmount()
    })
    host2.remove()
    void rerender
  })
})
