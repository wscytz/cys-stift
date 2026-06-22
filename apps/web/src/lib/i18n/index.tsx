'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { settingsStore, useSettings } from '@/lib/settings-store'
import type { MessageKey, Locale } from './messages'
import { messages } from './messages'

// L4 (v0.23.3): dedupe dev-mode missing-key warnings. Without this, a
// single typo'd t() call warns on every re-render (a page with the bug
// re-renders dozens of times in dev). We record each `${locale}:${key}`
// pair once and stay silent after.
const _warnedKeys = new Set<string>()

interface I18nCtx {
  locale: Locale
  t: (key: MessageKey, params?: Record<string, string | number | null | undefined>) => string
  setLocale: (l: Locale) => void
}

const I18nContext = createContext<I18nCtx>({
  locale: 'zh',
  t: () => '',
  setLocale: () => {},
})

export function useI18n(): I18nCtx {
  return useContext(I18nContext)
}

/**
 * Load initial locale from:
 *   1. settingsStore (persisted user preference)
 *   2. document.documentElement.lang (inline script set this)
 *   3. Fallback: 'zh'
 */
function loadLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  const stored = settingsStore.get().locale
  if (stored === 'zh' || stored === 'en') return stored
  const lang = document.documentElement.lang
  if (lang === 'en') return 'en'
  return 'zh'
}

/**
 * I18nProvider — wraps the app root so useI18n works in every page.
 * Uses settingsStore locale as source of truth; updates are persisted
 * to localStorage and change <html lang> for browser-level LTR/RTL.
 * Renders children immediately (no loading flash).
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  // SSR always renders 'zh'. On client mount, useEffect syncs the real
  // persisted locale. This avoids every hydration mismatch because SSR
  // HTML and client first-render both say 'zh'; the real locale takes
  // over a tick later. No user-visible flash: the inline <script> in
  // <head> already set <html lang> correctly for the first paint, and
  // React suppresses the re-render warning for the RTL attribute.
  const [locale, setLocale] = useState<Locale>('zh')
  const ref = useRef(locale)
  ref.current = locale

  const doSetLocale = useCallback((l: Locale) => {
    setLocale(l)
    settingsStore.updateLocale(l)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
    }
  }, [])

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number | null | undefined>) => {
      const entry = messages[key]
      const msg = entry?.[locale]
      if (!entry || !msg) {
        // v0.23.1 dev-mode warning: silent fallback (returning the raw
        // key) hid typos from review. Warn once per missing key so the
        // dev console highlights the issue without spamming prod.
        if (process.env.NODE_ENV !== 'production') {
          const dedupeKey = `${locale}:${String(key)}`
          if (!_warnedKeys.has(dedupeKey)) {
            _warnedKeys.add(dedupeKey)
            // eslint-disable-next-line no-console
            console.warn(`[i18n] missing key: ${String(key)} (locale: ${locale})`)
          }
        }
        return String(key)
      }
      if (!params) return msg
      let result: string = msg
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, String(v ?? ''))
      }
      return result
    },
    [locale],
  )

  const value = useMemo<I18nCtx>(() => ({ locale, t, setLocale: doSetLocale }), [locale, t, doSetLocale])

  // Hydrate from settingsStore on first mount + subscribe to external
  // locale changes. The settings page (and any future caller) may write via
  // settingsStore.updateLocale directly; without this subscription the
  // provider's React state wouldn't follow and t() would keep the old locale
  // (the v0.37.0 dev-feedback bug: settings language switch had no effect).
  useEffect(() => {
    const apply = (l: Locale) => {
      setLocale(l)
      if (typeof document !== 'undefined') {
        document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
      }
    }
    const stored = settingsStore.get().locale
    if (stored === 'zh' || stored === 'en') apply(stored)
    const unsub = settingsStore.subscribe(() => {
      const l = settingsStore.get().locale
      if (l === 'zh' || l === 'en') apply(l)
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
