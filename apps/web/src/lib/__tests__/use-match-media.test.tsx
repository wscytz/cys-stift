/**
 * useMatchMedia tests — SSR-safe matchMedia hook(响应式断点判断)。
 *
 * codebase policy:react-dom/client + `act`(React 19 内置,非 @testing-library/react)。
 * 样板照 `use-debounced-callback.test.tsx`。matchMedia 用 MockMQL 替身。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useMatchMedia } from '../use-match-media'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

/** Minimal MediaQueryList mock:holds `matches` + change listeners. */
class MockMQL {
  matches: boolean
  private listeners: Array<() => void> = []
  constructor(matches: boolean) {
    this.matches = matches
  }
  addEventListener = (_event: string, l: () => void): void => {
    this.listeners.push(l)
  }
  removeEventListener = (_event: string, l: () => void): void => {
    this.listeners = this.listeners.filter((x) => x !== l)
  }
  emit(matches: boolean): void {
    this.matches = matches
    for (const l of this.listeners) l()
  }
}

let active: MockMQL
function mockMatchMedia(matches: boolean): void {
  active = new MockMQL(matches)
  vi.stubGlobal('matchMedia', () => active)
}

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

describe('useMatchMedia', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves to mql.matches (false) after mount', () => {
    mockMatchMedia(false)
    const { current } = renderHook(() => useMatchMedia('(max-width: 1023px)'))
    expect(current).toBe(false)
  })

  it('resolves to true when query matches', () => {
    mockMatchMedia(true)
    const { current } = renderHook(() => useMatchMedia('(max-width: 1023px)'))
    expect(current).toBe(true)
  })

  it('subscribes to change events + cleans up on unmount', () => {
    mockMatchMedia(false)
    const { unmount } = renderHook(() => useMatchMedia('(max-width: 1023px)'))
    const a = active as unknown as { listeners: Array<() => void> }
    // subscribe 注册了 handler(挂载后)
    expect(a.listeners).toHaveLength(1)
    // emit 触发 handler → useSyncExternalStore onChange 通知(不抛 = 订阅通)
    expect(() =>
      act(() => active.emit(true)),
    ).not.toThrow()
    // unmount cleanup 注销 handler
    unmount()
    expect(a.listeners).toHaveLength(0)
  })

  it('returns false (no throw) when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { current, unmount } = renderHook(() =>
      useMatchMedia('(max-width: 1023px)'),
    )
    expect(current).toBe(false)
    unmount()
  })

  it('unmount cleans up listeners without throwing', () => {
    mockMatchMedia(false)
    const { unmount } = renderHook(() => useMatchMedia('(max-width: 1023px)'))
    expect(() => unmount()).not.toThrow()
  })
})
