'use client'

import { useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import {
  isSafeProviderId,
  isSafeModelId,
  isSafeBaseUrl,
} from './safe-href'

// ── Settings store (spec §5.5 "可在设置改") ───────────────────────────────
// Web-local keymap + future settings. Backed by localStorage, same
// singleton pattern as draft-store / canvas-view-store. Tauri (Phase 8)
// will read the same shape from its settings file.

const STORAGE_KEY = 'cys-stift.settings.v1'

export interface CaptureShortcut {
  /** 'meta' = Cmd (mac) / 'ctrl' = Ctrl (win). We store one; CaptureHost
   * accepts either at match time for cross-platform forgiveness. */
  modKey: 'meta' | 'ctrl'
  shift: boolean
  /** KeyboardEvent.code value, e.g. 'Space', 'KeyC', 'Comma'. */
  code: string
}

/**
 * Theme preference (spec §5.6, 2026-06-20). 'system' follows the OS
 * `prefers-color-scheme` media query; 'light' / 'dark' are explicit
 * user overrides. Root layout reads this and sets `data-theme` on
 * <html> so the CSS variable variant in tokens.css kicks in.
 */
export type ThemePreference = 'light' | 'dark' | 'system'

/**
 * M3 — AI configuration. Stored as `ai: AIConfig | null` on Settings:
 *   - `null`  → user has never configured AI (no buttons render)
 *   - object  → user filled in the /settings panel, but the buttons still
 *     gate on `enabled` so a saved-but-disabled state is honoured.
 *
 * The apiKey is plaintext — explicit decision (M3 ADR). A UI warning banner
 * in /settings spells out the risk. M4 may add OS keychain.
 */
export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'ollama'
  apiKey: string
  baseUrl: string
  model: string
  enabled: boolean
}

export interface Settings {
  captureShortcut: CaptureShortcut
  theme: ThemePreference
  locale: 'zh' | 'en'
  ai: AIConfig | null
}

export const DEFAULT_SETTINGS: Settings = {
  captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
  theme: 'system',
  locale: 'zh',
  ai: null,
}

/** Validate a parsed AI config. null is valid (no AI configured).
 *  Object must satisfy all 5 validators. */
function isValidAIConfig(v: unknown): v is AIConfig | null {
  if (v === null) return true
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    isSafeProviderId(o.provider) &&
    typeof o.apiKey === 'string' &&
    isSafeBaseUrl(o.baseUrl) &&
    isSafeModelId(o.model) &&
    typeof o.enabled === 'boolean'
  )
}

function isValid(v: unknown): v is Settings {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  const sc = o.captureShortcut
  if (!sc || typeof sc !== 'object') return false
  const s = sc as Record<string, unknown>
  if (
    !(
      (s.modKey === 'meta' || s.modKey === 'ctrl') &&
      typeof s.shift === 'boolean' &&
      typeof s.code === 'string' &&
      s.code.length > 0
    )
  ) {
    return false
  }
  if (o.theme !== 'light' && o.theme !== 'dark' && o.theme !== 'system') {
    return false
  }
  if (o.locale !== 'zh' && o.locale !== 'en') {
    return false
  }
  // ai field is optional (backwards compat) — accept missing or null or valid
  if (!('ai' in o) || o.ai === null) return true
  return isValidAIConfig(o.ai)
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as { settings?: unknown }
    return isValid(parsed.settings) ? (parsed.settings as Settings) : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: Settings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: s }))
  } catch {
    // best-effort
  }
}

let _settings: Settings = DEFAULT_SETTINGS
let _hydrated = false
const _subscribers = new Set<() => void>()

function notify() {
  for (const sub of _subscribers) sub()
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _settings = loadSettings()
  notify()
}

let _cached: Settings = _settings
function getSnapshot(): Settings {
  if (_cached !== _settings) _cached = _settings
  return _cached
}
function getServerSnapshot(): Settings {
  return _cached
}
function subscribe(cb: () => void) {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

export const settingsStore = {
  get(): Settings {
    hydrateOnce()
    return _settings
  },
  /** Subscribe to settings changes. Returns an unsubscribe function.
   * Exposed for consumers (e.g. theme.ts) that need to react to
   * user settings updates outside the React tree. */
  subscribe(cb: () => void): () => void {
    return subscribe(cb)
  },
  update(patch: Partial<Settings>): void {
    hydrateOnce()
    _settings = { ..._settings, ...patch }
    saveSettings(_settings)
    notify()
  },
  updateCaptureShortcut(patch: Partial<CaptureShortcut>): void {
    hydrateOnce()
    _settings = {
      ..._settings,
      captureShortcut: { ..._settings.captureShortcut, ...patch },
    }
    saveSettings(_settings)
    notify()
  },
  updateLocale(l: 'zh' | 'en'): void {
    hydrateOnce()
    if (_settings.locale === l) return
    _settings = { ..._settings, locale: l }
    saveSettings(_settings)
    notify()
  },
  updateTheme(theme: ThemePreference): void {
    hydrateOnce()
    if (_settings.theme === theme) return
    _settings = { ..._settings, theme }
    saveSettings(_settings)
    notify()
  },
  /**
   * M3 — AI settings updater. Accepts a partial patch and merges onto the
   * current config (or seeds a default-config-from-scratch if the user
   * has never configured AI). The defaults are the OpenAI defaults —
   * matches the dropdown's default selection so the panel works out of
   * the box for first-time users.
   */
  updateAISettings(patch: Partial<AIConfig>): void {
    hydrateOnce()
    const defaults: AIConfig = {
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: false,
    }
    const merged: AIConfig = _settings.ai
      ? { ..._settings.ai, ...patch }
      : { ...defaults, ...patch }
    _settings = { ..._settings, ai: merged }
    saveSettings(_settings)
    notify()
  },
}

export function useSettings(): { settings: Settings; ready: boolean } {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateOnce()
    setReady(true)
  }, [])
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => ({ settings, ready }), [settings, ready])
}
