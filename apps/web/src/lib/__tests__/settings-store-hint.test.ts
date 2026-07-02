import { describe, it, expect, beforeEach, vi } from 'vitest'

// The settings store is a module singleton with a sticky `_hydrated` flag:
// once hydrated it never re-reads localStorage within the same module
// instance. To test the backward-compat path (an OLD payload back-filling
// false), we reset the module registry and re-import a fresh singleton so
// hydration runs against the pre-seeded localStorage. The mutator + default
// tests use the normally-imported singleton.
import {
  settingsStore,
  DEFAULT_SETTINGS,
} from '../settings-store'

describe('settings-store — seenCaptureHint', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('DEFAULT_SETTINGS.seenCaptureHint is false', () => {
    expect(DEFAULT_SETTINGS.seenCaptureHint).toBe(false)
  })

  it('markCaptureHintSeen sets seenCaptureHint true and persists', () => {
    settingsStore.markCaptureHintSeen()
    expect(settingsStore.get().seenCaptureHint).toBe(true)
    const raw = window.localStorage.getItem('cys-stift.settings.v2')
    expect(raw).toContain('"seenCaptureHint":true')
  })

  it('a store loaded from an OLD payload (no seenCaptureHint) back-fills false', async () => {
    // Simulate a pre-flag localStorage payload (no seenCaptureHint field).
    window.localStorage.setItem(
      'cys-stift.settings.v2',
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'system',
          locale: 'zh',
          profiles: [],
          activeProfileId: null,
        },
      }),
    )
    // A fresh module instance hydrates from the seeded localStorage.
    vi.resetModules()
    const fresh = await vi.importActual<{
      settingsStore: { get: () => { seenCaptureHint: boolean } }
    }>('../settings-store')
    expect(fresh.settingsStore.get().seenCaptureHint).toBe(false)
  })
})
