'use client'

/**
 * Global ⌘K / ⌘/ (Cmd/Ctrl+K or Cmd/Ctrl+/) opens the command palette.
 * Mount once in layout (alongside ThemeBoot / CaptureHost). The palette
 * itself (CommandPalette) is rendered here and owns the navigation +
 * card-search surface — so this replaces the old router.push('/search').
 *
 * Shortcut rules:
 *  - ⌘K / Ctrl+K: opens the palette in any state (and preventDefault so it
 *    does not trigger the browser's address-bar search on macOS). This is
 *    the standard "command palette" binding (Notion, Linear, GitHub).
 *  - ⌘/ / Ctrl+/: opens the palette, but NOT when the user is already
 *    typing inside an input/textarea/contenteditable (let them type '/').
 *  - Either combo toggles: pressing it again while open closes.
 */
import { useCallback, useEffect, useState } from 'react'
import { CommandPalette } from '@/features/command-palette/command-palette'

export function SearchShortcut() {
  const [open, setOpen] = useState(false)

  const onKey = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    const key = e.key
    const isK = key === 'k' || key === 'K'
    const isSlash = key === '/'
    if (!isK && !isSlash) return

    // ⌘/: don't hijack when typing inside a field — let '/' be typed.
    if (isSlash) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return
      }
    }
    // ⌘K: always intercept (prevent browser address-bar search).
    e.preventDefault()
    setOpen((v) => !v)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  return <CommandPalette open={open} onClose={() => setOpen(false)} />
}
