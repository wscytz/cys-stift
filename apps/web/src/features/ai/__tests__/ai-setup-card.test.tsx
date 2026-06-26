/**
 * AiSetupCard — "not configured" guide (plan Task 4).
 *
 * Codebase policy: no @testing-library/react in devDeps. We mount the card
 * via react-dom/client + `act` (built into React 19, zero new deps) and use
 * plain DOM queries that are the exact equivalents of the RTL helpers the
 * plan originally specified:
 *   getByTestId(id)        → host.querySelector(`[data-testid="${id}"]`)
 *   getByText(/免费|free/i) → textContent match across the host
 *   fireEvent.click(el)    → act(() => el.click())
 *
 * Queries are data-attribute / text based — NOT class based — so the
 * `ai-setup__` style scoping cannot affect these assertions.
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

// Provide a REAL translator bound to the actual messages table + the test
// locale, so t('ai.setup.lede') resolves to the zh string (which contains
// 免费). Avoids needing the full I18nProvider + its settingsStore
// subscriptions.
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

import { AiSetupCard } from '../ai-setup-card'

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

// ── query helpers (data-attribute / text based; never class based) ──
const byTestId = (host: HTMLElement, id: string): Element | null =>
  host.querySelector(`[data-testid="${id}"]`)

const byText = (host: HTMLElement, re: RegExp): Element | null => {
  // RTL getByText matches an element whose immediate text content matches.
  // We walk descendants and return the element whose own text matches.
  const all = host.querySelectorAll('*')
  for (const el of all) {
    if (re.test(el.textContent ?? '')) return el
  }
  return null
}

describe('AiSetupCard', () => {
  it('renders the guide and highlights the zero-cost (Ollama) path', () => {
    const { host, unmount } = mount(
      <AiSetupCard onGoToSettings={() => {}} />,
    )
    expect(byTestId(host, 'ai-setup-card')).toBeTruthy()
    // The Ollama zero-cost highlight is surfaced (zh lede contains 免费).
    expect(byText(host, /免费|free/i)).toBeTruthy()
    unmount()
  })

  it('fires onGoToSettings when the settings button is clicked', () => {
    const spy = vi.fn()
    const { host, unmount } = mount(<AiSetupCard onGoToSettings={spy} />)
    act(() => {
      ;(byTestId(host, 'ai-setup-goto') as HTMLButtonElement).click()
    })
    expect(spy).toHaveBeenCalledTimes(1)
    unmount()
  })
})
