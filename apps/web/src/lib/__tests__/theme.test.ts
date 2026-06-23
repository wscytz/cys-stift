import { describe, it, expect, beforeEach, vi } from 'vitest'

// theme.ts's pure unit is resolveTheme(pref). The DOM-mutating helpers
// (applyInitialTheme, useThemeApplication) are thin glue over settingsStore +
// document.documentElement.setAttribute; we exercise resolveTheme directly and
// confirm applyInitialTheme wires settingsStore → data-theme via the DOM.

let mod: typeof import('../theme')

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mod = await import('../theme')
})

describe('resolveTheme — explicit preferences', () => {
  it('returns "light" for "light"', () => {
    expect(mod.resolveTheme('light')).toBe('light')
  })

  it('returns "dark" for "dark"', () => {
    expect(mod.resolveTheme('dark')).toBe('dark')
  })
})

describe('resolveTheme — system preference', () => {
  it('follows prefers-color-scheme: dark when pref is "system"', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q === '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    expect(mod.resolveTheme('system')).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('falls back to light when the OS prefers light, pref "system"', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q !== '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    expect(mod.resolveTheme('system')).toBe('light')
    vi.unstubAllGlobals()
  })

  it('defaults to light when window.matchMedia is unavailable', () => {
    // jsdom has matchMedia normally; remove it to exercise the guard.
    vi.stubGlobal('matchMedia', undefined)
    expect(mod.resolveTheme('system')).toBe('light')
    vi.unstubAllGlobals()
  })
})

describe('applyInitialTheme — settingsStore → DOM', () => {
  it('sets data-theme="dark" when settings.theme is "dark"', async () => {
    const { settingsStore } = await import('../settings-store')
    settingsStore.updateTheme('dark')
    mod.applyInitialTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('sets data-theme="light" when settings.theme is "light"', async () => {
    const { settingsStore } = await import('../settings-store')
    settingsStore.updateTheme('light')
    mod.applyInitialTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('respects an explicit persisted theme over system preference', async () => {
    // OS says dark, but user override is light → light wins.
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q === '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const { settingsStore } = await import('../settings-store')
    settingsStore.updateTheme('light')
    mod.applyInitialTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    vi.unstubAllGlobals()
  })
})

describe('theme — persists through settingsStore', () => {
  it('a theme flip survives a fresh module load (hydrated from localStorage)', async () => {
    const { settingsStore } = await import('../settings-store')
    settingsStore.updateTheme('dark')
    // Confirm it landed in localStorage under the settings envelope.
    const raw = window.localStorage.getItem('cys-stift.settings.v1')
    expect(JSON.parse(raw!).settings.theme).toBe('dark')

    vi.resetModules()
    const freshSettings = (await import('../settings-store')).settingsStore
    expect(freshSettings.get().theme).toBe('dark')
  })
})

describe('theme — bad / corrupt data', () => {
  it('falls back to "system" (→ resolved light/dark) on corrupt settings JSON', async () => {
    window.localStorage.setItem('cys-stift.settings.v1', '{ totally not json')
    // settingsStore falls back to defaults (theme: 'system'); with no
    // matchMedia override in jsdom, resolveTheme('system') → light here.
    const { settingsStore } = await import('../settings-store')
    expect(settingsStore.get().theme).toBe('system')
    // resolveTheme must not throw on the default; it resolves system → light.
    expect(mod.resolveTheme('system')).toBe('light')
  })

  it('falls back to defaults on an invalid theme value', async () => {
    window.localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'neon', // invalid
          locale: 'zh',
          ai: null,
        },
      }),
    )
    const { settingsStore } = await import('../settings-store')
    expect(settingsStore.get().theme).toBe('system')
  })
})

describe('theme — SSR safety', () => {
  it('resolveTheme falls back to light when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrMod = await import('../theme')
      expect(ssrMod.resolveTheme('system')).toBe('light')
      // Explicit prefs still resolve without window.
      expect(ssrMod.resolveTheme('dark')).toBe('dark')
      expect(ssrMod.resolveTheme('light')).toBe('light')
    } finally {
      globalThis.window = originalWindow
    }
  })
})
