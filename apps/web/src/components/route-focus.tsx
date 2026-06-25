'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Route-change focus management (a11y).
 *
 * Next.js App Router does NOT move focus on client-side navigation.
 * Without this, keyboard users Tab through the whole AppMenu again on
 * every page change, and screen-reader users get no audible page-change
 * cue. On pathname change we focus the `#main` landmark (which carries
 * `tabIndex={-1}`), moving the reading position to the new page content.
 *
 * This is a client component because it needs `usePathname()`; it is
 * rendered by the server-component root layout.
 */
export function RouteFocus() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof document === 'undefined') return
    const main = document.getElementById('main')
    if (main) {
      main.focus()
    }
  }, [pathname])

  return null
}
