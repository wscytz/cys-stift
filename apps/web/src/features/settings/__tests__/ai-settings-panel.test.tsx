/**
 * AISettingsPanel — Bauhaus provider cards (plan Task 3).
 *
 * Codebase policy: no @testing-library/react in devDeps. We mount the panel
 * via react-dom/client + `act` (built into React 19, zero new deps) and use
 * plain DOM queries that are the exact equivalents of the RTL helpers the
 * plan originally specified:
 *   getByTestId(id)           → host.querySelector(`[data-testid="${id}"]`)
 *   getByRole('note')         → host.querySelector('[role="note"]')
 *   getByLabelText(/AI/i)     → find a <label>/<input> pair whose accessible
 *                                name matches; here we match on the
 *                                checkbox whose aria-label contains "AI".
 *   queryByLabelText(/API key/i) → host.querySelector('label') text match.
 *
 * Queries are deliberately data-attribute / role / label based — NOT class
 * based — so the `aip__` style scoping (engineering correction to the plan)
 * cannot affect these assertions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

// settings-store is a module singleton backed by localStorage. Stub its
// store so the panel renders deterministically without touching storage.
const _settings: { ai: unknown; locale: 'zh' | 'en' } = { ai: null, locale: 'zh' }
vi.mock('@/lib/settings-store', () => ({
  settingsStore: {
    get: () => _settings,
    subscribe: () => () => {},
    updateAISettings: vi.fn(() => true),
  },
  useSettings: () => ({ settings: _settings, ready: true }),
}))

// Provide a REAL translator bound to the actual messages table + the test
// locale, so t('settings.aiPlaintextWarning') resolves to the zh string
// (which contains 明文). Avoids needing the full I18nProvider + its
// settingsStore subscriptions.
import { messages } from '@/lib/i18n/messages'
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: _settings.locale,
    t: (
      key: keyof typeof messages,
      params?: Record<string, string | number | null | undefined>,
    ) => {
      const entry = messages[key]
      const msg = entry?.[_settings.locale]
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

// test-connection stubbed so the Test button path is unit-isolated.
vi.mock('@/features/ai/test-connection', () => ({
  testConnection: vi.fn(async () => ({ ok: true, latencyMs: 12 })),
}))

import { AISettingsPanel } from '../ai-settings-panel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

interface Mount {
  host: HTMLDivElement
  root: Root
  unmount: () => void
}

function mount(): Mount {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(React.createElement(AISettingsPanel))
  })
  return { host, root, unmount: () => act(() => root.unmount()) }
}

// ── query helpers (data-attribute / role / label based; never class based) ──
const byTestId = (host: HTMLElement, id: string): Element | null =>
  host.querySelector(`[data-testid="${id}"]`)

const byRole = (host: HTMLElement, role: string): Element | null =>
  host.querySelector(`[role="${role}"]`)

/** The enable checkbox is labelled by aria-label "启用 AI" / "Enable AI".
 *  getByLabelText(/AI/i) in RTL matches on the accessible name; we replicate
 *  that by looking at aria-label + associated <label> text. */
function byLabelText(host: HTMLElement, re: RegExp): Element | null {
  // (1) inputs whose aria-label matches
  const ariaHit = Array.from(host.querySelectorAll('[aria-label]')).find((el) =>
    re.test(el.getAttribute('aria-label') ?? ''),
  )
  if (ariaHit) return ariaHit
  // (2) <label for=id> → input[id]
  const labels = Array.from(host.querySelectorAll('label'))
  for (const lab of labels) {
    if (re.test(lab.textContent ?? '')) {
      const htmlFor = lab.getAttribute('for')
      if (htmlFor) {
        // ids in this panel are static and CSS-safe; no need for CSS.escape
        // (and `CSS` isn't reliably defined in jsdom).
        const input = host.querySelector(`#${htmlFor}`)
        if (input) return input
      }
    }
  }
  return null
}

beforeEach(() => {
  _settings.ai = null
  _settings.locale = 'zh'
  window.localStorage.clear()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('AISettingsPanel — Bauhaus provider cards', () => {
  it('renders all 3 provider cards', () => {
    const { host, unmount } = mount()
    expect(byTestId(host, 'provider-card-openai')).toBeTruthy()
    expect(byTestId(host, 'provider-card-anthropic')).toBeTruthy()
    expect(byTestId(host, 'provider-card-ollama')).toBeTruthy()
    unmount()
  })

  it('hides the API-key row for Ollama (needsKey=false)', () => {
    const { host, unmount } = mount()
    // enable first so fields/cards are interactive
    act(() => {
      ;(byLabelText(host, /AI/i) as HTMLInputElement).click()
    })
    // select ollama card
    act(() => {
      ;(byTestId(host, 'provider-card-ollama') as HTMLButtonElement).click()
    })
    expect(byLabelText(host, /API key/i)).toBeNull()
    unmount()
  })

  it('shows the API-key row for OpenAI (needsKey=true)', () => {
    const { host, unmount } = mount()
    act(() => {
      ;(byLabelText(host, /AI/i) as HTMLInputElement).click()
    })
    expect(byLabelText(host, /API key/i)).toBeTruthy()
    unmount()
  })

  it('advanced reveal starts hidden and toggles', () => {
    const { host, unmount } = mount()
    act(() => {
      ;(byLabelText(host, /AI/i) as HTMLInputElement).click()
    })
    expect(byTestId(host, 'ai-advanced')).toBeNull()
    act(() => {
      ;(byTestId(host, 'ai-advanced-toggle') as HTMLButtonElement).click()
    })
    expect(byTestId(host, 'ai-advanced')).toBeTruthy()
    unmount()
  })

  it('plaintext warning is a bordered callout (role=note)', () => {
    const { host, unmount } = mount()
    const note = byRole(host, 'note')
    expect(note).toBeTruthy()
    expect(note?.textContent ?? '').toContain('明文')
    unmount()
  })
})
