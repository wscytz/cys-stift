'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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
 * 浏览器语言检测(2026-08-29 P3-16,与 layout.tsx 首帧 inline script 同规则):
 * navigator.language 以 en 开头 → 'en',否则 'zh'。无 navigator(极端环境)回 'zh'。
 * 用于无持久化用户选择时的首启语言。
 */
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh'
  const lang = (navigator.language || 'zh').toLowerCase()
  return lang.indexOf('en') === 0 ? 'en' : 'zh'
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
  // over a tick later (hydration-safe by design).
  // 2026-08-29 P3-16 复核措辞修正:head inline script 只把 <html lang>
  // 属性(字体/读屏)在首帧改对;UI **字符串**仍会闪一帧 zh 才切 en ——
  // 零文本闪需要 cookie/SSR 语言方案,复杂度不成比例,有意不做。
  const [locale, setLocale] = useState<Locale>('zh')

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
    // P3-16(2026-08-29):无持久化用户选择时按浏览器语言检测,不强制 zh ——
    // 与 layout 首帧 inline script 同规则,英文浏览器用户首启即 en。
    // 注意:检测值只用于本会话展示,**不写回 settings**(用户没选过,不替他选;
    // 一旦用户在设置页切换,持久化值从此接管)。
    if (stored === 'zh' || stored === 'en') {
      apply(stored)
    } else {
      apply(detectLocale())
    }
    const unsub = settingsStore.subscribe(() => {
      const l = settingsStore.get().locale
      if (l === 'zh' || l === 'en') apply(l)
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
