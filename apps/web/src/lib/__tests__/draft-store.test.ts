import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Hook testing note ───────────────────────────────────────────────────────
// useDraft (the React hook) is NOT tested here.
// apps/web/package.json has no @testing-library/react in devDependencies, and
// pulling in a new dependency just to test the hook would violate YAGNI. The
// hook is a thin wrapper over useSyncExternalStore + the store API exercised
// below.
//
// Hydration behaviour: every public store method (get / upsert / clear) calls
// hydrateOnce() before touching _drafts, so a pre-existing localStorage draft
// IS visible via draftStore.get() on a cold module load — no need to run the
// hook first. This matches the canvas-view-store / settings-store pattern
// (each public method hydrates). See the "cold-start hydration" suite.

const STORAGE_KEY = 'cys-stift.drafts.v1'

let store: typeof import('../draft-store').draftStore

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  store = (await import('../draft-store')).draftStore
})

describe('draftStore.get — empty state', () => {
  it('returns null for a kind that was never written', () => {
    expect(store.get('capture')).toBeNull()
    expect(store.get('manual')).toBeNull()
  })
})

describe('draftStore.upsert — write + persist', () => {
  it('stores a draft under its kind and returns it from get', () => {
    store.upsert('capture', { text: 'hello' })
    const d = store.get<{ text: string }>('capture')
    expect(d).not.toBeNull()
    expect(d!.kind).toBe('capture')
    expect(d!.payload).toEqual({ text: 'hello' })
    expect(typeof d!.updatedAt).toBe('string')
  })

  it('overwrites a previous draft of the same kind', () => {
    store.upsert('capture', { text: 'first' })
    store.upsert('capture', { text: 'second' })
    expect(store.get<{ text: string }>('capture')!.payload).toEqual({ text: 'second' })
  })

  it('keeps drafts of different kinds independent', () => {
    store.upsert('capture', { text: 'cap' })
    store.upsert('manual', { text: 'man' })
    expect(store.get<{ text: string }>('capture')!.payload).toEqual({ text: 'cap' })
    expect(store.get<{ text: string }>('manual')!.payload).toEqual({ text: 'man' })
  })

  it('writes a valid draft envelope to localStorage', () => {
    store.upsert('capture', { text: 'persisted' })
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { drafts: { capture?: { kind: string; payload: unknown; updatedAt: string } } }
    expect(parsed.drafts.capture).toBeDefined()
    expect(parsed.drafts.capture!.kind).toBe('capture')
    expect(parsed.drafts.capture!.payload).toEqual({ text: 'persisted' })
  })
})

describe('draftStore.clear — drop a draft', () => {
  it('removes the draft for the given kind', () => {
    store.upsert('capture', { text: 'x' })
    store.clear('capture')
    expect(store.get('capture')).toBeNull()
  })

  it('leaves other kinds untouched', () => {
    store.upsert('capture', { text: 'cap' })
    store.upsert('manual', { text: 'man' })
    store.clear('capture')
    expect(store.get('capture')).toBeNull()
    expect(store.get<{ text: string }>('manual')!.payload).toEqual({ text: 'man' })
  })

  it('is a no-op when the kind was never written (no throw)', () => {
    expect(() => store.clear('capture')).not.toThrow()
    expect(store.get('capture')).toBeNull()
  })

  it('reflects the removal in localStorage', () => {
    store.upsert('capture', { text: 'x' })
    store.clear('capture')
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY)!,
    ) as { drafts: Record<string, unknown> }
    expect(parsed.drafts.capture).toBeUndefined()
  })
})

describe('draftStore — corruption resilience', () => {
  it('does not throw when localStorage contains corrupt JSON', () => {
    // loadDrafts() catches JSON.parse failures and returns {} (no throw),
    // so a corrupt payload just looks like empty storage. hydrateOnce()
    // (now called by every public method) runs loadDrafts under that guard.
    // We assert the store stays usable (no throw on subsequent writes/reads)
    // when the raw value is garbage.
    window.localStorage.setItem(STORAGE_KEY, '{ this is NOT json {{{')
    store.upsert('capture', { text: 'after-corruption' })
    expect(store.get<{ text: string }>('capture')!.payload).toEqual({
      text: 'after-corruption',
    })
    // And the new write overwrote the corrupt payload with valid JSON.
    expect(() =>
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)!),
    ).not.toThrow()
  })
})

describe('draftStore — cold-start hydration', () => {
  it('get() reads a pre-existing localStorage draft without the hook running first', async () => {
    // Bug fix: previously hydrateOnce() only fired from the useDraft hook's
    // useEffect, so a cold module load + bare draftStore.get(key) could NOT
    // see a pre-existing localStorage draft. Now every public method
    // (get/upsert/clear) calls hydrateOnce() first, matching the
    // canvas-view-store / settings-store pattern.
    vi.resetModules()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        drafts: {
          capture: {
            kind: 'capture',
            payload: { text: 'pre-existing' },
            updatedAt: '2026-06-22T00:00:00.000Z',
          },
        },
      }),
    )
    const coldStore = (await import('../draft-store')).draftStore
    // No hook, no upsert — straight read on a freshly loaded module.
    const d = coldStore.get<{ text: string }>('capture')
    expect(d).not.toBeNull()
    expect(d!.payload).toEqual({ text: 'pre-existing' })
  })
})

describe('draftStore — SSR safety', () => {
  it('upsert / clear / get do not throw when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrStore = (await import('../draft-store')).draftStore
      expect(ssrStore.get('capture')).toBeNull()
      expect(() => ssrStore.upsert('capture', { x: 1 })).not.toThrow()
      expect(() => ssrStore.clear('capture')).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })
})
