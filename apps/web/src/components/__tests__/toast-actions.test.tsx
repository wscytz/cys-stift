/**
 * Renderer test for ToastHost action buttons (plan Task 7).
 *
 * Codebase policy: @testing-library/react is NOT a dependency (not in
 * apps/web/package.json devDeps) and must not be added. We mount
 * <ToastHost/> via react-dom/client + `act` (built into React 19, no new
 * dependency) — the same pattern used by use-debounced-callback.test.tsx.
 *
 * Contract under test:
 *  - pushToast with `actions[]` renders one button per action, tagged
 *    `data-testid="toast-action-<index>"`, BEFORE the × close button.
 *  - clicking an action button fires the action's onClick, then dismisses
 *    the toast (the button is removed from the DOM).
 *  - a plain toast (no actions) renders no action buttons.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { pushToast, dismissToast, getToasts } from '@/lib/toast-store'
import { ToastHost } from '../toast'

// Mark the env as an act environment so React doesn't warn about act() usage.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function renderToastHost(): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(<ToastHost />)
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

describe('ToastHost — action buttons', () => {
  beforeEach(() => {
    // The store is a module singleton; clear the queue so prior tests
    // (including the store test's fake-timer toasts) don't leak in.
    getToasts().forEach((tst) => dismissToast(tst.id))
  })
  afterEach(() => {
    getToasts().forEach((tst) => dismissToast(tst.id))
  })

  it('renders action buttons and fires onClick + dismisses', () => {
    const spy = vi.fn()
    pushToast({
      kind: 'success',
      message: 'saved',
      actions: [{ label: 'open', onClick: spy }],
    })
    const { host, unmount } = renderToastHost()

    const btn = host.querySelector('[data-testid="toast-action-0"]')
    expect(btn).not.toBeNull()

    act(() => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(spy).toHaveBeenCalledTimes(1)
    // toast was dismissed by the click → the button is no longer present
    expect(host.querySelector('[data-testid="toast-action-0"]')).toBeNull()

    unmount()
  })

  it('renders no action buttons for a plain toast', () => {
    pushToast({ kind: 'info', message: 'hi' })
    const { host, unmount } = renderToastHost()
    expect(host.querySelector('[data-testid="toast-action-0"]')).toBeNull()
    unmount()
  })
})
