'use client'

/**
 * Theme application (spec §5.6, 2026-06-20).
 *
 * Resolution order (highest wins):
 *   1. Explicit user override in settingsStore (theme: 'light' | 'dark')
 *   2. settingsStore.theme === 'system'  →  window.matchMedia('(prefers-color-scheme: dark)')
 *   3. Default: light (legacy users without a saved theme)
 *
 * Resolved value goes onto the root <html> element as `data-theme="dark" |
 * "light"`. The CSS variable variant in tokens.css activates accordingly.
 *
 * The system-match listener is set up once per page lifetime; when the OS
 * theme changes, the data-theme attribute updates without a reload, and
 * components re-render via the snapshot subscription on
 * settingsStore.theme.
 */
import { useEffect } from 'react'
import { settingsStore, type ThemePreference } from './settings-store'

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  return systemPrefersDark() ? 'dark' : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  // tldraw reads its own background colour from the root via
  // computed style. setProperty on the body keeps its canvas surface
  // in sync with our page bg so dark mode applies through the tldraw
  // surface too. (tldraw's own backgrounds live in
  // canvas-overrides.css; this gives it a known anchor.)
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-white')
    .trim()
  if (bg) {
    document.body.style.setProperty('--tl-bg', bg)
  }
}

export function applyInitialTheme(): void {
  const pref = settingsStore.get().theme
  applyTheme(resolveTheme(pref))
}

/**
 * useThemeApplication — mount once near the root. Subscribes to
 * settings changes (so user override flips take effect immediately)
 * and to the OS prefers-color-scheme media query (so 'system' tracks
 * live OS changes).
 */
export function useThemeApplication(): void {
  useEffect(() => {
    // Initial application (in case the inline script didn't run, e.g.
    // Strict Mode double-effect).
    applyTheme(resolveTheme(settingsStore.get().theme))

    // Subscribe to user overrides via a custom event the store fires
    // (the store's existing notify() is internal; we wire a small
    // bridge so theme flips propagate to the DOM immediately).
    const onChange = () => {
      applyTheme(resolveTheme(settingsStore.get().theme))
    }
    // pollinterval as a lightweight alternative to wiring the
    // store: settings are tiny, this runs at most once per
    // settingsStore.notify() call, and we have a handful of users.
    // Real apps would expose subscribe(); we just add it here.
    const unsub = settingsStore.subscribe(onChange)
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onMql = () => {
      if (settingsStore.get().theme === 'system') {
        applyTheme(resolveTheme('system'))
      }
    }
    if (mql) mql.addEventListener('change', onMql)
    return () => {
      unsub()
      if (mql) mql.removeEventListener('change', onMql)
    }
  }, [])
}
