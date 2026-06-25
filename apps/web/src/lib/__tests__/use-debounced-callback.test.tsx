/**
 * H3 regression: debounced autosave must be cancellable so a queued fire
 * after submit() doesn't re-persist the just-cleared draft.
 *
 * Scenario being guarded: user types (schedules persistDraft in ~500ms),
 * then hits Cmd+Enter. submit() clears the draft immediately. Without
 * cancel(), the pending timer fires AFTER the clear and writes the
 * submitted text back to the draft store → stale draft reappears next time.
 *
 * No @testing-library/react in devDeps (codebase policy), so we mount a
 * minimal component via react-dom/client + `act` (built into React 19, no
 * new dependency) and drive the hook with fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useDebouncedCallback } from '../use-debounced-callback'

// Mark the env as an act environment so React doesn't warn about act() usage.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function renderHook<T>(hookFn: () => T): { current: T; unmount: () => void } {
  const holder: { current: T } = {} as { current: T }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  function Probe() {
    holder.current = hookFn()
    return null
  }
  act(() => {
    root.render(<Probe />)
  })
  return {
    get current() {
      return holder.current
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('useDebouncedCallback.cancel — H3 (queued fire after clear re-persists draft)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('cancel() prevents the queued invocation from firing', () => {
    const fn = vi.fn()
    const { current } = renderHook(() => useDebouncedCallback(fn, 500))

    act(() => {
      current('first')
    })
    expect(fn).not.toHaveBeenCalled()
    act(() => {
      current.cancel()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('without cancel(), the queued invocation DOES fire (guards the regression)', () => {
    const fn = vi.fn()
    const { current } = renderHook(() => useDebouncedCallback(fn, 500))

    act(() => {
      current('first')
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('first')
  })

  it('cancel() before the delay lets a subsequent call schedule fresh', () => {
    const fn = vi.fn()
    const { current } = renderHook(() => useDebouncedCallback(fn, 500))

    act(() => {
      current('dropped')
    })
    act(() => {
      current.cancel()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(fn).not.toHaveBeenCalled()

    act(() => {
      current('kept')
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('kept')
  })

  it('cancel() is safe to call when no timer is pending', () => {
    const fn = vi.fn()
    const { current, unmount } = renderHook(() =>
      useDebouncedCallback(fn, 500),
    )
    expect(() => {
      act(() => {
        current.cancel()
      })
    }).not.toThrow()
    unmount()
  })
})
