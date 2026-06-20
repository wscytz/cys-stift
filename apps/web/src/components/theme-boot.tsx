'use client'

import { useThemeApplication } from '@/lib/theme'

/**
 * ThemeBoot — client-only mount that wires live theme changes
 * (user toggles, OS dark-mode flips) to the DOM. The inline script
 * in <head> already set data-theme for the first paint; this
 * subscribes to subsequent changes.
 *
 * Lives in /components (not /lib) because it's a React component
 * hook consumer; pure JS theme helpers live in /lib/theme.ts.
 */
export function ThemeBoot(): null {
  useThemeApplication()
  return null
}