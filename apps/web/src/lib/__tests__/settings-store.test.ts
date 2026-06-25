import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Hook testing note ───────────────────────────────────────────────────────
// useSettings (the React hook) is NOT tested here.
// apps/web/package.json has no @testing-library/react in devDependencies, and
// pulling in a new dependency just to test the hook would violate YAGNI. The
// hook is a thin wrapper over useSyncExternalStore + the store API exercised
// below.

const STORAGE_KEY = 'cys-stift.settings.v1'

let store: typeof import('../settings-store').settingsStore

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  store = (await import('../settings-store')).settingsStore
})

describe('settingsStore.get — defaults', () => {
  it('returns DEFAULT_SETTINGS on a clean profile', () => {
    const s = store.get()
    expect(s.captureShortcut).toEqual({ modKey: 'meta', shift: true, code: 'Space' })
    expect(s.theme).toBe('system')
    expect(s.locale).toBe('zh')
    expect(s.ai).toBeNull()
  })
})

describe('settingsStore.update — merge + persist', () => {
  it('merges a partial patch onto the current settings', () => {
    store.update({ theme: 'dark' })
    const s = store.get()
    expect(s.theme).toBe('dark')
    // Untouched fields preserved.
    expect(s.locale).toBe('zh')
    expect(s.captureShortcut.code).toBe('Space')
  })

  it('persists to localStorage in a { settings } envelope', () => {
    store.update({ theme: 'dark' })
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { settings: { theme: string } }
    expect(parsed.settings.theme).toBe('dark')
  })
})

describe('settingsStore.updateCaptureShortcut', () => {
  it('patches only the captureShortcut object', () => {
    store.updateCaptureShortcut({ modKey: 'ctrl', code: 'KeyC' })
    const sc = store.get().captureShortcut
    expect(sc).toEqual({ modKey: 'ctrl', shift: true, code: 'KeyC' })
  })
})

describe('settingsStore.updateLocale', () => {
  it('switches locale to en', () => {
    store.updateLocale('en')
    expect(store.get().locale).toBe('en')
  })

  it('is a no-op when the locale is unchanged (no persist, no notify leak)', () => {
    store.updateLocale('zh') // already zh by default
    expect(store.get().locale).toBe('zh')
    // localStorage was never written (no-op branch returns before saveSettings).
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('settingsStore.updateTheme', () => {
  it('switches theme', () => {
    store.updateTheme('dark')
    expect(store.get().theme).toBe('dark')
  })

  it('is a no-op when the theme is unchanged', () => {
    store.updateTheme('system') // already system
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('settingsStore.updateAISettings (M3)', () => {
  it('seeds defaults from scratch when ai is null', () => {
    store.updateAISettings({ apiKey: 'sk-test' })
    const ai = store.get().ai
    expect(ai).not.toBeNull()
    expect(ai!.provider).toBe('openai') // default
    expect(ai!.apiKey).toBe('sk-test') // patched
    expect(ai!.baseUrl).toBe('https://api.openai.com/v1') // default
    expect(ai!.enabled).toBe(false) // default
  })

  it('merges a partial patch onto an existing config', () => {
    store.updateAISettings({ apiKey: 'sk-one' })
    store.updateAISettings({ enabled: true })
    const ai = store.get().ai
    expect(ai!.apiKey).toBe('sk-one') // preserved
    expect(ai!.enabled).toBe(true) // patched
  })

  it('persists ai config to localStorage', () => {
    store.updateAISettings({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet', baseUrl: 'https://api.anthropic.com' })
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY)!,
    ) as { settings: { ai: { provider: string } } }
    expect(parsed.settings.ai.provider).toBe('anthropic')
  })
})

describe('settingsStore.subscribe', () => {
  it('notifies subscribers on a change and returns an unsubscribe', () => {
    const cb = vi.fn()
    const unsub = store.subscribe(cb)
    store.update({ theme: 'dark' })
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    unsub()
    store.update({ theme: 'light' })
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('settingsStore — hydrate (reads persisted state on load)', () => {
  it('rehydrates a previously-saved settings object across a fresh module load', async () => {
    store.update({ theme: 'dark', locale: 'en' })
    vi.resetModules()
    const fresh = (await import('../settings-store')).settingsStore
    const s = fresh.get()
    expect(s.theme).toBe('dark')
    expect(s.locale).toBe('en')
  })
})

describe('settingsStore — corrupt / invalid localStorage', () => {
  it('falls back to defaults on corrupt JSON (no throw)', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ this is NOT json {{{')
    expect(() => store.get()).not.toThrow()
    expect(store.get().theme).toBe('system') // default
  })

  it('falls back to defaults when settings fails validation (bad theme)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'neon', // invalid
          locale: 'zh',
          ai: null,
        },
      }),
    )
    expect(store.get().theme).toBe('system') // rejected → default
  })

  it('falls back to defaults when captureShortcut is malformed', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'banana', shift: true, code: 'Space' },
          theme: 'light',
          locale: 'en',
          ai: null,
        },
      }),
    )
    const s = store.get()
    expect(s.theme).toBe('system') // whole object rejected → defaults
    expect(s.captureShortcut.modKey).toBe('meta')
  })

  it('falls back to defaults when ai config fails validation', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'light',
          locale: 'en',
          ai: { provider: 'evilcorp', apiKey: 'x', baseUrl: 'not-a-url', model: 'm', enabled: true },
        },
      }),
    )
    // Bad ai → whole settings rejected.
    expect(store.get().locale).toBe('zh') // default locale, not 'en'
  })

  it('accepts a settings object missing the ai field (back-compat)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'dark',
          locale: 'en',
          // no ai field — treated as ai: null
        },
      }),
    )
    const s = store.get()
    expect(s.theme).toBe('dark')
    expect(s.locale).toBe('en')
    // isValid accepts a missing-ai object (`if (!('ai' in o)) return true`),
    // but it does NOT normalise the field to null — so the rehydrated object
    // simply omits `ai`. Callers treat both null and undefined as "no AI".
    expect(s.ai).toBeFalsy()
  })
})

describe('settingsStore — SSR safety', () => {
  it('returns defaults and does not throw when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrStore = (await import('../settings-store')).settingsStore
      const s = ssrStore.get()
      expect(s.theme).toBe('system')
      expect(s.locale).toBe('zh')
      expect(() => ssrStore.update({ theme: 'dark' })).not.toThrow()
      expect(() => ssrStore.updateLocale('en')).not.toThrow()
      expect(() => ssrStore.updateTheme('dark')).not.toThrow()
      expect(() => ssrStore.updateAISettings({ apiKey: 'x' })).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })
})

// 镜像 db-client 的配额回滚测试。quota-silence fix:配额满时必须回滚内存
// _settings(让 UI 不撒谎:改了主题/快捷键/AI 配置,reload 后消失)+ notifyQuota
// (让 AppMenu toast 提示)。此前 saveSettings 裸 catch {} → 静默丢设置。
describe('settingsStore — quota exceeded (rollback + notify)', () => {
  let store: typeof import('../settings-store').settingsStore
  let onQuotaExceeded: typeof import('../settings-store').onQuotaExceeded

  beforeEach(async () => {
    vi.resetModules()
    window.localStorage.clear()
    store = (await import('../settings-store')).settingsStore
    onQuotaExceeded = (await import('../settings-store')).onQuotaExceeded
  })

  /** Force localStorage.setItem to throw. jsdom puts setItem on Storage.prototype
   *  (non-writable on the instance), so a direct `window.localStorage.setItem = fn`
   *  silently no-ops. Override the prototype method and restore it after. */
  function simulateQuota() {
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    })
    return () => {
      if (orig) Object.defineProperty(Storage.prototype, 'setItem', orig)
    }
  }

  it('rolls back update + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.update({ theme: 'dark' })
      unsub()
      // Rollback: theme did not stick in memory.
      expect(store.get().theme).toBe('system')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back updateTheme + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.updateTheme('dark')
      unsub()
      expect(store.get().theme).toBe('system')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back updateLocale + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.updateLocale('en')
      unsub()
      expect(store.get().locale).toBe('zh')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back updateCaptureShortcut + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.updateCaptureShortcut({ code: 'KeyC' })
      unsub()
      expect(store.get().captureShortcut.code).toBe('Space')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back updateAISettings + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.updateAISettings({ apiKey: 'sk-test' })
      unsub()
      expect(store.get().ai).toBeNull()
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('normal write still works + does not fire quota', () => {
    let quotaFired = false
    const unsub = onQuotaExceeded(() => {
      quotaFired = true
    })
    store.update({ theme: 'dark' })
    unsub()
    expect(store.get().theme).toBe('dark')
    expect(quotaFired).toBe(false)
  })
})
