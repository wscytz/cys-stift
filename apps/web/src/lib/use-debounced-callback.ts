'use client'

import { useEffect, useMemo, useRef } from 'react'

/**
 * Returns a stable callback that invokes `fn` only after `delay` ms of
 * silence. Each call resets the timer. The timer is cleared on unmount.
 *
 * Use for debounced persistence (e.g. autosave drafts) so we don't write
 * to localStorage on every keystroke.
 *
 * The returned function has a `.cancel()` method that clears the pending
 * timer imperatively — use it when an external event (e.g. a submit) wants
 * to prevent a queued fire from running after the state it would read has
 * been cleared (H3 fix: debounced autosave re-persisting a cleared draft).
 */
export interface Debounced<T extends (...args: never[]) => void> {
  (...args: Parameters<T>): void
  /** Cancel any pending delayed invocation. Safe to call when none is queued. */
  cancel(): void
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): Debounced<T> {
  const fnRef = useRef(fn)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the latest fn without resetting the running timer.
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const cancel = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // Clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return useMemo<Debounced<T>>(
    () => {
      const debounced = (...args: Parameters<T>) => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current)
        }
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          fnRef.current(...args)
        }, delay)
      }
      return Object.assign(debounced, { cancel }) as Debounced<T>
    },
    // `cancel` is stable (closes over timerRef); `delay` re-binds the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delay],
  )
}
