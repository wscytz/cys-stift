'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Global ⌘/ / Ctrl+/ keyboard shortcut to navigate to /search.
 * Mount once in layout (alongside ThemeBoot / CaptureHost).
 *
 * v0.23.2-hardening: was Cmd/Ctrl+K, which conflicts with the browser's
 * built-in search bar shortcut in Windows Edge (and "Find" in some IE
 * modes). Cmd/Ctrl+/ is the conventional "open search" binding (used by
 * Linear, Notion, GitHub) and is unbound in every major browser.
 */
export function SearchShortcut() {
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        router.push('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  return null
}
