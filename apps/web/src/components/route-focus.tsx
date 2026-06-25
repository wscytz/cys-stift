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
    // Coexist with modals: a focus-trapped dialog (role=dialog aria-modal=true)
    // may have opened as part of this navigation, and its focus-trap effect can
    // run before this one (layout is higher in the tree). If focus is already
    // inside an open modal — or an open modal exists — leave it alone so we
    // don't yank focus back to #main and break the trap / defocus its first
    // input. Only move focus to #main in the normal skip-to-content case.
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
    const active = document.activeElement
    if (active && active.closest('[role="dialog"][aria-modal="true"]')) return
    const main = document.getElementById('main')
    if (main) {
      main.focus()
    }
  }, [pathname])

  return null
}
