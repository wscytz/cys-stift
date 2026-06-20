'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Global ⌘K / Ctrl+K keyboard shortcut to navigate to /search.
 * Mount once in layout (alongside ThemeBoot / CaptureHost).
 * Device check: metaKey on mac, ctrlKey on other platforms.
 */
export function SearchShortcut() {
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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
