/**
 * D5 TagManagement：渲染标签行；改名/改色/删/合并 触发 onApplyChanges。
 * react-dom/client + act（policy）。i18n mock。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card, TagColor, TagRef } from '@cys-stift/domain'
import { TagManagement } from '../tag-management'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string, p?: Record<string, string>) => (p ? Object.entries(p).reduce((s, [k2, v]) => s.replace(`{${k2}}`, v), k) : k), locale: 'zh', setLocale: () => {} }),
}))

const RED = 'var(--color-red)' as TagColor
const BLUE = 'var(--color-blue)' as TagColor

function mk(id: string, tags: Array<[string, TagColor]>): Card {
  return {
    id, title: id, body: '', type: 'note',
    capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    tags: tags.map(([value, color]) => ({ value, color } as TagRef)),
    pinned: false, archived: false,
  } as unknown as Card
}

function render(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(el) })
  return { host, unmount() { act(() => { root.unmount() }); host.remove() } }
}

describe('TagManagement', () => {
  it('渲染标签行（名 + 卡数）', () => {
    const cards = [mk('1', [['a', RED]]), mk('2', [['a', RED], ['b', BLUE]])]
    const { host } = render(<TagManagement cards={cards} onApplyChanges={vi.fn()} />)
    const rows = host.querySelectorAll('.tm__row')
    expect(rows.length).toBe(2)
    // a(2) 排在 b(1) 前
    const firstName = host.querySelector('.tm__row .tm__name')!.textContent
    expect(firstName).toBe('a')
  })

  it('点标签名 → 输入新名 + Enter → onApplyChanges 收到 rename', () => {
    const onApply = vi.fn()
    const { host } = render(<TagManagement cards={[mk('1', [['a', RED]])]} onApplyChanges={onApply} />)
    act(() => { (host.querySelector('.tm__name') as HTMLButtonElement).click() })
    const input = host.querySelector('.tm__rename') as HTMLInputElement
    expect(input).toBeTruthy()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, 'A2')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onApply).toHaveBeenCalled()
    const changes = onApply.mock.calls[0]![0] as Array<{ id: string; tags: TagRef[] }>
    expect(changes[0]!.tags).toEqual([{ value: 'A2', color: RED }])
  })

  it('勾两个 + 选 target + 合并 → onApplyChanges 收到 mergeTagsInto', () => {
    const onApply = vi.fn()
    const cards = [mk('1', [['a', RED]]), mk('2', [['b', BLUE]])]
    const { host } = render(<TagManagement cards={cards} onApplyChanges={onApply} />)
    const checks = host.querySelectorAll('.tm__check')
    act(() => { (checks[0] as HTMLButtonElement).click() })
    act(() => { (checks[1] as HTMLButtonElement).click() })
    // merge bar 出现
    const select = host.querySelector('.tm__select') as HTMLSelectElement
    expect(select).toBeTruthy()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
      setter.call(select, 'a')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    act(() => { (host.querySelector('.tm__bar-btn--primary') as HTMLButtonElement).click() })
    expect(onApply).toHaveBeenCalled()
    const changes = onApply.mock.calls[0]![0] as Array<{ id: string; tags: TagRef[] }>
    // 卡 2 的 b 合到 a → tags = [{a, RED}]
    expect(changes.find((c) => c.id === '2')!.tags).toEqual([{ value: 'a', color: RED }])
  })

  it('点删按钮 → onApplyChanges 收到 deleteTag', () => {
    const onApply = vi.fn()
    const { host } = render(<TagManagement cards={[mk('1', [['a', RED], ['b', BLUE]])]} onApplyChanges={onApply} />)
    // 第一行的删按钮（.tm__act--danger）
    act(() => { (host.querySelector('.tm__act--danger') as HTMLButtonElement).click() })
    const changes = onApply.mock.calls[0]![0] as Array<{ id: string; tags: TagRef[] }>
    expect(changes[0]!.tags).toEqual([{ value: 'b', color: BLUE }])
  })
})
