/**
 * Task 10 (plan §3 #3 记录栏 polish): MiniInput must surface discoverability
 * hints — a visible "Enter expands body" hint under the title when the body
 * is collapsed, and a prominent ⌘↩ submit hint in the action bar (capture-red).
 *
 * No @testing-library/react in devDeps (codebase policy), so we mount via
 * react-dom/client + `act` (built into React 19, no new dependency) and query
 * with querySelector. MiniInput mounts a debounced autosave (draft-store) and
 * auto-focuses the title on open, so all renders/updates are wrapped in act().
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MiniInput } from '../mini-input'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function renderMiniInput() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <MiniInput
        open={true}
        onClose={() => {}}
        onSubmit={() => Promise.resolve(true)}
      />,
    )
  })
  const cleanup = () => {
    act(() => {
      root.unmount()
    })
    host.remove()
  }
  return { host, cleanup }
}

describe('MiniInput — discoverability hints', () => {
  afterEach(() => {
    // Belt-and-suspenders: any leftover debounced-autosave timers from a
    // failed render are flushed so they don't leak between tests.
    vi.clearAllTimers()
  })

  it('renders the Enter-expands hint under the title when body is closed', () => {
    const { host, cleanup } = renderMiniInput()
    const enterHint = host.querySelector('[data-testid="mini-enter-hint"]')
    expect(enterHint).not.toBeNull()
    cleanup()
  })

  it('renders a prominent ⌘↩ submit hint in the action bar', () => {
    const { host, cleanup } = renderMiniInput()
    const hint = host.querySelector('[data-testid="mini-submit-hint"]')
    expect(hint).not.toBeNull()
    // contains the submit affordance glyph
    expect(hint?.textContent?.toLowerCase() ?? '').toMatch(/⌘|ctrl/)
    cleanup()
  })
})
