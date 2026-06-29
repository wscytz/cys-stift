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
import { getDefaultProviderDefaults } from './providers'

let _cachedAI: AIConfig | null | undefined = undefined

export function getCurrentAI(): AIConfig | null {
  return _cachedAI === undefined ? null : _cachedAI
}

/** True iff AI is usable right now: configured + enabled + has a baseUrl
 *  + (if the provider needs a key) a non-empty apiKey. null = not ready.
 *  This is the single gate for "show AiActionMenu vs AiSetupCard". */
export function isAIReady(cfg: AIConfig | null): boolean {
  if (!cfg || !cfg.enabled) return false
  if (cfg.baseUrl.length === 0) return false
  const def = getDefaultProviderDefaults(cfg.provider)
  if (def.needsKey && cfg.apiKey.length === 0) return false
  return true
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

/** 实验室 vision 开关(代码层守卫入口)。false 时 vision 路径完全不可达——
 *  所有 vision 能力(看图/画布视觉/图转 DSL)的 UI + 逻辑都用它做 if 守卫,
 *  不只是 UI 隐藏。默认关,用户在 /settings 实验室区显式开启才 true。
 *  开启 ≠ 自动发图:还需 provider 支持 vision + 用户触发具体 action。 */
export function useVisionLabEnabled(): boolean {
  const { settings } = useSettings()
  return Boolean(settings.labs?.visionLab)
}