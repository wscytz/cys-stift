/**
 * CaptureHint component test (plan Task 9).
 *
 * No @testing-library/react in devDeps (codebase policy), so we mount the
 * component via react-dom/client + `act` (built into React 19, no new
 * dependency), mirroring use-debounced-callback.test.tsx. We drive the
 * settings-store-backed visibility by mocking @/lib/settings-store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

// Mark the env as an act environment so React doesn't warn about act() usage.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

// i18n is required by CaptureHint; stub it to a passthrough so the rendered
// text is deterministic and locale-independent.
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh' as const }),
}))

// The settings store drives seenCaptureHint. We mock it so we can flip the
// flag true/false without touching localStorage, and assert markCaptureHintSeen
// is called on dismiss. `vi.mock` factories are hoisted above top-level
// `const`s (TDZ), so the mutable state + spy must be created via
// `vi.hoisted` — those bindings exist at the factory's hoist time.
const { mockState, mockMobile, markCaptureHintSeen } = vi.hoisted(() => {
  const mockState: { seenCaptureHint: boolean } = { seenCaptureHint: false }
  const mockMobile = { value: false }
  const markCaptureHintSeen = vi.fn()
  return { mockState, mockMobile, markCaptureHintSeen }
})

vi.mock('@/lib/settings-store', () => ({
  useSettings: () => ({ settings: mockState, ready: true }),
  settingsStore: { markCaptureHintSeen },
}))

vi.mock('@/lib/use-platform', () => ({
  useIsMobile: () => mockMobile.value,
}))

import { CaptureHint } from '../capture-hint'

function renderToDOM(): { host: HTMLDivElement; unmount: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      React.createElement(CaptureHint),
    )
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

describe('CaptureHint', () => {
  beforeEach(() => {
    mockState.seenCaptureHint = false
    mockMobile.value = false
    markCaptureHintSeen.mockReset()
    document.body.innerHTML = ''
  })

  it('renders when seenCaptureHint is false', () => {
    const { host, unmount } = renderToDOM()
    expect(host.querySelector('[data-testid="capture-hint"]')).not.toBeNull()
    expect(host.textContent).toContain('capture.hintFlow')
    expect(host.textContent).toContain('capture.hint')
    unmount()
  })

  it('is hidden when seenCaptureHint is true', () => {
    mockState.seenCaptureHint = true
    const { host, unmount } = renderToDOM()
    expect(host.querySelector('[data-testid="capture-hint"]')).toBeNull()
    unmount()
  })

  it('dismiss calls settingsStore.markCaptureHintSeen', () => {
    const { host, unmount } = renderToDOM()
    const btn = host.querySelector(
      '[data-testid="capture-hint-dismiss"]',
    ) as HTMLButtonElement
    expect(btn).not.toBeNull()
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(markCaptureHintSeen).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('keeps the workflow hint on mobile but hides the desktop shortcut', () => {
    mockMobile.value = true
    const { host, unmount } = renderToDOM()
    expect(host.querySelector('[data-testid="capture-hint"]')).not.toBeNull()
    expect(host.textContent).toContain('capture.hintFlow')
    expect(host.querySelector('.capture-hint__text > span')).toBeNull()
    unmount()
  })
})
