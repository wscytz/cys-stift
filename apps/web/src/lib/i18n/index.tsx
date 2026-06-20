'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { settingsStore, useSettings } from '@/lib/settings-store'
import type { MessageKey, Locale } from './messages'
import { messages } from './messages'

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
  const [locale, setLocale] = useState<Locale>(loadLocale)
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
      const msg = messages[key]?.[locale]
      if (!msg) return String(key)
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

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
