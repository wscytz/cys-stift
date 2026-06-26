/**
 * AiActionMenu — ✨ AI action list (plan Task 4).
 *
 * Codebase policy: no @testing-library/react in devDeps. We mount the menu
 * via react-dom/client + `act` (built into React 19, zero new deps) and use
 * plain DOM queries that are the exact equivalents of the RTL helpers the
 * plan originally specified:
 *   getByTestId(id)        → host.querySelector(`[data-testid="${id}"]`)
 *   fireEvent.click(el)    → act(() => el.click())
 *
 * Queries are data-attribute based — NOT class based — so the `ai-menu__`
 * style scoping cannot affect these assertions.
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

// Provide a REAL translator bound to the actual messages table + the test
// locale so t('ai.menu.*') resolves. Avoids the full I18nProvider.
const _locale: 'zh' | 'en' = 'zh'
import { messages } from '@/lib/i18n/messages'
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: _locale,
    t: (
      key: keyof typeof messages,
      params?: Record<string, string | number | null | undefined>,
    ) => {
      const entry = messages[key]
      const msg = entry?.[_locale]
      if (!msg) return String(key)
      if (!params) return msg
      let out: string = msg
      for (const [k, v] of Object.entries(params)) {
        out = out.replace(`{${k}}`, String(v ?? ''))
      }
      return out
    },
    setLocale: () => {},
  }),
}))

import { AiActionMenu } from '../ai-action-menu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

interface Mount {
  host: HTMLDivElement
  root: Root
  unmount: () => void
}

function mount(el: React.ReactElement): Mount {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return { host, root, unmount: () => act(() => root.unmount()) }
}

// ── query helpers (data-attribute based; never class based) ──
const byTestId = (host: HTMLElement, id: string): Element | null =>
  host.querySelector(`[data-testid="${id}"]`)

describe('AiActionMenu', () => {
  it('lists summarize / rewrite / translate (en + zh)', () => {
    const { host, unmount } = mount(<AiActionMenu onPick={() => {}} />)
    expect(byTestId(host, 'ai-menu-summarize')).toBeTruthy()
    expect(byTestId(host, 'ai-menu-rewrite')).toBeTruthy()
    expect(byTestId(host, 'ai-menu-translate-en')).toBeTruthy()
    expect(byTestId(host, 'ai-menu-translate-zh')).toBeTruthy()
    unmount()
  })

  it('summarize button fires onPick("summarize")', () => {
    const spy = vi.fn()
    const { host, unmount } = mount(<AiActionMenu onPick={spy} />)
    act(() => {
      ;(byTestId(host, 'ai-menu-summarize') as HTMLButtonElement).click()
    })
    expect(spy).toHaveBeenCalledTimes(1)
    const call = spy.mock.calls[0]
    // summarize passes no targetLang → single arg (JS treats a missing 2nd
    // arg as undefined; vitest's spy records the actual arg count, so we
    // assert the one-arg form rather than toHaveBeenCalledWith('x', undefined)).
    expect(call?.[0]).toBe('summarize')
    expect(call?.length).toBe(1)
    unmount()
  })

  it('rewrite button fires onPick("improveWriting")', () => {
    const spy = vi.fn()
    const { host, unmount } = mount(<AiActionMenu onPick={spy} />)
    act(() => {
      ;(byTestId(host, 'ai-menu-rewrite') as HTMLButtonElement).click()
    })
    expect(spy).toHaveBeenCalledTimes(1)
    const call = spy.mock.calls[0]
    expect(call?.[0]).toBe('improveWriting')
    expect(call?.length).toBe(1)
    unmount()
  })

  it('translate-en fires onPick("translate", "en")', () => {
    const spy = vi.fn()
    const { host, unmount } = mount(<AiActionMenu onPick={spy} />)
    act(() => {
      ;(byTestId(host, 'ai-menu-translate-en') as HTMLButtonElement).click()
    })
    expect(spy).toHaveBeenCalledWith('translate', 'en')
    unmount()
  })

  it('translate-zh fires onPick("translate", "zh")', () => {
    const spy = vi.fn()
    const { host, unmount } = mount(<AiActionMenu onPick={spy} />)
    act(() => {
      ;(byTestId(host, 'ai-menu-translate-zh') as HTMLButtonElement).click()
    })
    expect(spy).toHaveBeenCalledWith('translate', 'zh')
    unmount()
  })
})
