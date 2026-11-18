import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, type AnchorHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ShowcaseContent } from '../showcase-content'
import { RouteFocus } from '@/components/route-focus'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const state = vi.hoisted(() => ({ locale: 'zh' as 'zh' | 'en', pathname: '/showcase/' }))

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: state.locale, t: (key: string) => key }) }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))
vi.mock('@/features/capture/capture-host', () => ({ CAPTURE_OPEN_EVENT: 'capture:open' }))
vi.mock('@/lib/version', () => ({ VERSION: 'test-version' }))

let root: Root | undefined
let container: HTMLDivElement
let previousUrl: string

beforeEach(() => {
  state.locale = 'zh'
  state.pathname = '/showcase/'
  previousUrl = window.location.href
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  window.history.replaceState(null, '', previousUrl)
  vi.restoreAllMocks()
  root = undefined
})

describe('Showcase navigation contracts', () => {
  it.each(['zh', 'en'] as const)('opens capture without navigating away in %s', (locale) => {
    state.locale = locale
    const opened = vi.fn()
    window.addEventListener('capture:open', opened)
    try {
      act(() => root!.render(<ShowcaseContent />))
      expect(container.querySelector('main')?.lang).toBe(locale === 'zh' ? 'zh-CN' : 'en')
      const beforeClick = window.location.href
      act(() => container.querySelector<HTMLButtonElement>('.showcase__primary')!.click())
      expect(opened).toHaveBeenCalledTimes(1)
      expect(window.location.href).toBe(beforeClick)
    } finally {
      window.removeEventListener('capture:open', opened)
    }
  })

  it('preserves the footer privacy hash and scrolls to its target on route entry', () => {
    act(() => root!.render(<ShowcaseContent />))
    const privacy = container.querySelector<HTMLAnchorElement>('.showcase__footer a')!
    expect(privacy.getAttribute('href')).toBe('/settings/#settings-data')
    window.history.replaceState(null, '', privacy.getAttribute('href')!)
    state.pathname = '/settings/'
    const scrollTarget = vi.fn()
    const scrollTop = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => root!.render(
      <>
        <main id="main" tabIndex={-1} />
        <section id="settings-data" ref={(target) => { if (target) target.scrollIntoView = scrollTarget }} />
        <RouteFocus />
      </>,
    ))

    expect(scrollTarget).toHaveBeenCalledTimes(1)
    expect(scrollTop).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#settings-data')
  })

  it('focuses the main landmark and resets scroll when the hash target is missing', () => {
    window.history.replaceState(null, '', '/settings/#missing-section')
    state.pathname = '/settings/'
    const scrollTop = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => root!.render(<><main id="main" tabIndex={-1} /><RouteFocus /></>))

    expect(document.activeElement).toBe(container.querySelector('main'))
    expect(scrollTop).toHaveBeenCalledTimes(1)
    expect(scrollTop).toHaveBeenCalledWith(0, 0)
    expect(window.location.hash).toBe('#missing-section')
  })

  it('does not scroll a deep link or steal focus while a modal is open', () => {
    window.history.replaceState(null, '', '/settings/#settings-data')
    state.pathname = '/settings/'
    const scrollTarget = vi.fn()
    const scrollTop = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => root!.render(
      <>
        <main id="main" tabIndex={-1} />
        <section id="settings-data" ref={(target) => { if (target) target.scrollIntoView = scrollTarget }} />
        <div role="dialog" aria-modal="true"><input autoFocus /></div>
        <RouteFocus />
      </>,
    ))

    expect(document.activeElement).toBe(container.querySelector('input'))
    expect(scrollTarget).not.toHaveBeenCalled()
    expect(scrollTop).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#settings-data')
  })
})
