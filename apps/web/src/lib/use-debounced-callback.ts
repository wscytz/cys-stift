'use client'

import { useEffect, useMemo, useRef } from 'react'

/**
 * Returns a stable callback that invokes `fn` only after `delay` ms of
 * silence. Each call resets the timer. The timer is cleared on unmount.
 *
 * Use for debounced persistence (e.g. autosave drafts) so we don't write
 * to localStorage on every keystroke.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): T {
  const fnRef = useRef(fn)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the latest fn without resetting the running timer.
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  // Clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return useMemo<T>(
    () =>
      ((...args: never[]) => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current)
        }
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          fnRef.current(...args)
        }, delay)
      }) as T,
    [delay],
  )
}
