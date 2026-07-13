import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { SaveStatusBadge } from '../save-status-badge'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (k: string) => (k === 'canvas.saved' ? '已保存' : k),
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

  it('挂载后显示「已保存」(useEffect 置 show)', () => {
    act(() => {
      createRoot(container).render(<SaveStatusBadge />)
    })
    expect(container.textContent).toContain('已保存')
  })

  it('含 ✓ 标记 + role=status', () => {
    act(() => {
      createRoot(container).render(<SaveStatusBadge />)
    })
    expect(container.textContent).toContain('✓')
    const badge = container.querySelector('.save-badge')
    expect(badge?.getAttribute('role')).toBe('status')
  })
})
