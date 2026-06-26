import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  pushToast,
  dismissToast,
  getToasts,
  type Toast,
} from '../toast-store'

describe('toast-store — actions field', () => {
  beforeEach(() => {
    // clear the singleton queue so tests don't leak state into each other
    getToasts().forEach((tst) => dismissToast(tst.id))
    vi.useFakeTimers()
  })
  afterEach(() => {
    // restore real timers + clear any leftover toasts so the renderer test
    // (separate file) starts from a clean queue
    vi.useRealTimers()
    vi.restoreAllMocks()
    getToasts().forEach((tst) => dismissToast(tst.id))
  })

  it('actions field is persisted on the toast', () => {
    const spy = vi.fn()
    pushToast({ kind: 'success', message: 'saved', actions: [{ label: 'go', onClick: spy }] })
    const list = getToasts()
    expect(list.length).toBe(1)
    expect((list[0] as Toast).actions?.[0]?.label).toBe('go')
  })

  it('a toast WITH actions lives longer than a plain toast (6000ms vs 4000ms)', () => {
    pushToast({ kind: 'success', message: 'plain' })
    pushToast({ kind: 'success', message: 'acted', actions: [{ label: 'x', onClick: () => {} }] })
    // advance just past the plain 4000ms window
    vi.advanceTimersByTime(4005)
    const remaining = getToasts().map((t) => t.message)
    expect(remaining).toContain('acted')
    expect(remaining).not.toContain('plain')
  })

  it('a toast WITH actions still auto-dismisses at 6000ms', () => {
    pushToast({ kind: 'success', message: 'acted', actions: [{ label: 'x', onClick: () => {} }] })
    vi.advanceTimersByTime(6005)
    expect(getToasts().find((t) => t.message === 'acted')).toBeUndefined()
  })

  it('error toasts still persist (no auto-dismiss) even with actions', () => {
    pushToast({ kind: 'error', message: 'boom', actions: [{ label: 'retry', onClick: () => {} }] })
    vi.advanceTimersByTime(10000)
    expect(getToasts().find((t) => t.message === 'boom')).toBeTruthy()
  })
})

describe('toast-store — action onClick dispatches from renderer contract', () => {
  // The store itself doesn't fire onClick; the renderer does, then dismisses.
  // Here we assert the renderer-side contract: an action object is callable
  // and dismissToast removes the toast afterwards.
  beforeEach(() => {
    getToasts().forEach((tst) => dismissToast(tst.id))
  })
  afterEach(() => {
    getToasts().forEach((tst) => dismissToast(tst.id))
  })

  it('action onClick is a callable function on the stored toast', () => {
    const spy = vi.fn()
    pushToast({ kind: 'success', message: 'm', actions: [{ label: 'do', onClick: spy }] })
    const stored = getToasts().find((t) => t.message === 'm') as Toast
    const action = stored.actions?.[0]
    expect(action).toBeDefined()
    action!.onClick()
    dismissToast(stored.id)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(getToasts().find((t) => t.id === stored.id)).toBeUndefined()
  })
})
