'use client'

/**
 * M3 — module-level AI config + sync component. We need a fast, synchronous
 * read of the current AI config from the AIPopover's useEffect — reading
 * through a hook would re-render on every settings change, churning the
 * in-flight stream. A module-level singleton + a small sync component
 * that pushes updates from settings-store is the simplest pattern.
 *
 * The `undefined` sentinel distinguishes "never synced" (returns null)
 * from "explicitly null" (returns null too — user has no AI). This matters
 * for SSR + first paint: we don't want to render AI popover before the
 * sync component mounts, so `undefined` → null also (effectively the same
 * result; the difference matters if we ever add a "loading" state).
 */

import { useEffect } from 'react'
import { useSettings } from '@/lib/settings-store'
import type { AIConfig } from './types'

let _cachedAI: AIConfig | null | undefined = undefined

export function getCurrentAI(): AIConfig | null {
  return _cachedAI === undefined ? null : _cachedAI
}

/** Sync component — mounts once at the layout root, subscribes to
 *  settings-store, pushes the current ai config into the module-level
 *  singleton. The popover reads it on demand. */
export function AIProviderSync() {
  const { settings } = useSettings()
  useEffect(() => {
    _cachedAI = settings.ai
    return () => {
      _cachedAI = undefined
    }
  }, [settings.ai])
  return null
}

/** Hook for the AI Settings panel + any conditional rendering (the
 *  card-detail footer uses it to gate the AI buttons on/off). */
export function useAIEnabled(): boolean {
  const { settings } = useSettings()
  return Boolean(settings.ai?.enabled)
}