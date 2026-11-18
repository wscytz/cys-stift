import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { SaveStatusBadge } from '../save-status-badge'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (k: string) => (k === 'canvas.saved' ? '默认本机存储' : k),
    locale: 'zh',
    setLocale: () => {},
  }),
}))

describe('SaveStatusBadge (Task 4)', () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    document.body.removeChild(container)
  })

  it('挂载后显示「默认本机存储」(useEffect 置 show)', () => {
    act(() => {
      createRoot(container).render(<SaveStatusBadge />)
    })
    expect(container.textContent).toContain('默认本机存储')
  })

  it('不含勾选标记(不冒充最近一次保存成功) + role=status', () => {
    act(() => {
      createRoot(container).render(<SaveStatusBadge />)
    })
    expect(container.textContent).not.toContain('✓')
    const badge = container.querySelector('.save-badge')
    expect(badge?.getAttribute('role')).toBe('status')
  })
})
