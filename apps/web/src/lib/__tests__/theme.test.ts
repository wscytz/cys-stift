import { describe, it, expect, beforeEach, vi } from 'vitest'

// theme.ts — Bauhaus light-only(2026-07-11 删 dark)。
// resolveTheme 恒 'light'(向后兼容旧 settings.theme='dark',无视);
// applyInitialTheme 恒设 data-theme="light"。不再跟随 OS prefers-color-scheme。

let mod: typeof import('../theme')

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mod = await import('../theme')
})

describe('resolveTheme — light-only(恒 light)', () => {
  it('light → light', () => {
    expect(mod.resolveTheme('light')).toBe('light')
  })

  it('dark → light(dark 已删,旧 settings 值无视)', () => {
    expect(mod.resolveTheme('dark')).toBe('light')
  })

  it('system → light(不再跟随 OS)', () => {
    // 即便 OS 报 dark,light-only 下也恒 light。
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q === '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    expect(mod.resolveTheme('system')).toBe('light')
    vi.unstubAllGlobals()
  })
})

describe('applyInitialTheme — 恒设 data-theme="light"', () => {
  it('settings.theme=dark → data-theme 仍 light', async () => {
    const { settingsStore } = await import('../settings-store')
    settingsStore.updateTheme('dark') // legacy 字段仍可写(兼容旧 schema)
    mod.applyInitialTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('settings.theme=light → data-theme=light', async () => {
    const { settingsStore } = await import('../settings-store')
    settingsStore.updateTheme('light')
    mod.applyInitialTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

describe('theme — SSR safety', () => {
  it('resolveTheme 恒 light(window undefined 也 light)', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrMod = await import('../theme')
      expect(ssrMod.resolveTheme('system')).toBe('light')
      expect(ssrMod.resolveTheme('dark')).toBe('light')
      expect(ssrMod.resolveTheme('light')).toBe('light')
    } finally {
      globalThis.window = originalWindow
    }
  })
})
