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
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MiniInput } from '../mini-input'
import { draftStore } from '@/lib/draft-store'

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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function ContinuousCaptureHarness({ onSubmit }: { onSubmit: (title: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" data-testid="reopen-capture" onClick={() => setOpen(true)}>
        reopen
      </button>
      <MiniInput
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={async ({ title }) => {
          const ok = await onSubmit(title)
          if (ok) setOpen(false)
          return ok
        }}
      />
    </>
  )
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

  it('allows a second successful capture after close and reopen', async () => {
    draftStore.clear('capture')
    const submitted: string[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <ContinuousCaptureHarness
          onSubmit={async (title) => {
            submitted.push(title)
            return true
          }}
        />,
      )
    })

    const firstInput = host.querySelector<HTMLInputElement>('.mi-title')!
    setInputValue(firstInput, 'first capture')
    const firstSave = host.querySelector<HTMLButtonElement>('[data-testid="mini-save"]')!
    expect(firstSave.disabled).toBe(false)
    await act(async () => {
      firstSave.click()
    })
    expect(submitted).toEqual(['first capture'])
    expect(host.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="reopen-capture"]')!.click()
    })
    const secondInput = host.querySelector<HTMLInputElement>('.mi-title')!
    setInputValue(secondInput, 'second capture')
    const secondSave = host.querySelector<HTMLButtonElement>('[data-testid="mini-save"]')!
    expect(secondSave.disabled).toBe(false)
    await act(async () => {
      secondSave.click()
    })
    expect(submitted).toEqual(['first capture', 'second capture'])

    act(() => {
      root.unmount()
    })
    host.remove()
  })
})
