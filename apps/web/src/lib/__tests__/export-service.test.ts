import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Card, CardId } from '@cys-stift/domain'

// `buildExportPayload` reads localStorage keys directly and stamps
// `exportedAt: new Date().toISOString()` at call time. We freeze the clock
// so the assertions on exportedAt are deterministic.
const FIXED_NOW = new Date('2026-06-23T12:00:00.000Z')

// Re-import the module fresh per test so SSR-vs-browser isolation is clean
// and any mocked globals take effect on the module closure.
let mod: typeof import('../export-service')

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  mod = await import('../export-service')
})

// ── Fixtures ───────────────────────────────────────────────────────────────

const CARDS_KEY = 'cys-stift.cards.v1'
const MEDIA_KEY = 'cys-stift.media.v1'
const DRAFTS_KEY = 'cys-stift.drafts.v1'
const SETTINGS_KEY = 'cys-stift.settings.v1'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1' as unknown as CardId,
    title: 'hello',
    body: 'world',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev-1' },
    capturedAt: new Date('2026-06-20T00:00:00.000Z'),
    createdAt: new Date('2026-06-20T00:00:00.000Z'),
    updatedAt: new Date('2026-06-21T00:00:00.000Z'),
    tags: [],
    pinned: false,
    archived: false,
    ...overrides,
  }
}

function seedStores(opts: {
  cards?: Card[]
  mediaAssets?: Record<string, unknown>
  drafts?: Record<string, unknown>
  settings?: Record<string, unknown>
}) {
  if (opts.cards !== undefined) {
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: opts.cards }))
  }
  if (opts.mediaAssets !== undefined) {
    window.localStorage.setItem(MEDIA_KEY, JSON.stringify({ assets: opts.mediaAssets }))
  }
  if (opts.drafts !== undefined) {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ drafts: opts.drafts }))
  }
  if (opts.settings !== undefined) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ settings: opts.settings }))
  }
}

// ── buildExportPayload ────────────────────────────────────────────────────

// buildExportPayload reads cards back through JSON.parse(localStorage), so
// Date fields on Card (capturedAt/createdAt/updatedAt) come out as ISO
// strings, not Date instances. Normalise both sides through JSON so the
// comparison reflects the real on-disk shape rather than the in-memory Date
// type. This is itself a documented behaviour: the export format stores dates
// as ISO strings (spec §1.2 信念4 — plain, portable JSON).
function asStored<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

describe('buildExportPayload', () => {
  it('assembles cards + media + drafts + settings from localStorage', () => {
    const card = makeCard({ title: 'exported' })
    const media = { 'ma-1': { id: 'ma-1', kind: 'image' } }
    const drafts = { 'draft-1': { title: 'wip' } }
    const settings = { theme: 'dark', locale: 'en' }
    seedStores({ cards: [card], mediaAssets: media, drafts, settings })

    const payload = mod.buildExportPayload()

    expect(payload.cards).toEqual([asStored(card)])
    expect(payload.mediaAssets).toEqual(media)
    expect(payload.drafts).toEqual(drafts)
    expect(payload.settings).toEqual(settings)
  })

  it('stamps the versioned format version', () => {
    const payload = mod.buildExportPayload()
    expect(payload.version).toBe(mod.EXPORT_FORMAT_VERSION)
    expect(payload.version).toBe(1)
  })

  it('exportedAt is an ISO string at call time', () => {
    const payload = mod.buildExportPayload()
    expect(payload.exportedAt).toBe('2026-06-23T12:00:00.000Z')
    expect(new Date(payload.exportedAt).toISOString()).toBe(payload.exportedAt)
  })

  it('app name is "cy\'s Stift"', () => {
    expect(mod.buildExportPayload().app).toBe("cy's Stift")
  })

  it('degrades to empty cards when the cards store is missing', () => {
    // Only seed media, not cards.
    seedStores({ mediaAssets: { 'ma-1': {} } })
    const payload = mod.buildExportPayload()
    expect(payload.cards).toEqual([])
    expect(payload.mediaAssets).toEqual({ 'ma-1': {} })
  })

  it('degrades to empty mediaAssets when media store is missing', () => {
    seedStores({ cards: [makeCard()] })
    expect(mod.buildExportPayload().mediaAssets).toEqual({})
  })

  it('omits drafts/settings (undefined) when those stores are absent', () => {
    seedStores({ cards: [makeCard()] })
    const payload = mod.buildExportPayload()
    expect(payload.drafts).toBeUndefined()
    expect(payload.settings).toBeUndefined()
  })

  it('returns empty defaults on corrupt JSON instead of throwing', () => {
    window.localStorage.setItem(CARDS_KEY, '{ not json')
    window.localStorage.setItem(MEDIA_KEY, '} also not json')
    const payload = mod.buildExportPayload()
    expect(payload.cards).toEqual([])
    expect(payload.mediaAssets).toEqual({})
    expect(payload.version).toBe(mod.EXPORT_FORMAT_VERSION)
  })
})

// ── Export → Import round-trip (the regression guard for 数据可迁移) ─────────

describe('export → import round-trip (no data loss)', () => {
  it('a full export re-imports byte-for-byte into the four stores', () => {
    const cardA = makeCard({ id: 'card-a' as unknown as CardId, title: 'A' })
    const cardB = makeCard({
      id: 'card-b' as unknown as CardId,
      title: 'B',
      type: 'quote',
      pinned: true,
      quotes: [{ text: 'q', attribution: 'me' }],
    })
    const media = {
      'ma-1': { id: 'ma-1', kind: 'image', mimeType: 'image/png', dataUrl: 'x', byteSize: 10 },
    }
    const drafts = { 'draft-1': { title: 'wip' } }
    const settings = { theme: 'dark', locale: 'en' }
    seedStores({ cards: [cardA, cardB], mediaAssets: media, drafts, settings })

    // Export
    const payload = mod.buildExportPayload()
    const json = JSON.stringify(payload, null, 2)

    // Wipe storage to simulate a fresh device, then import.
    window.localStorage.clear()

    const result = mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.cards).toBe(2)
    expect(result.mediaAssets).toBe(1)

    // Each store now holds exactly the exported envelope.
    expect(JSON.parse(window.localStorage.getItem(CARDS_KEY)!)).toEqual({ cards: [asStored(cardA), asStored(cardB)] })
    expect(JSON.parse(window.localStorage.getItem(MEDIA_KEY)!)).toEqual({ assets: media })
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY)!)).toEqual({ drafts })
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toEqual({ settings })

    // And re-exporting reproduces the same payload (version + data).
    const rePayload = mod.buildExportPayload()
    expect(rePayload.version).toBe(payload.version)
    expect(rePayload.cards).toEqual([asStored(cardA), asStored(cardB)])
    expect(rePayload.mediaAssets).toEqual(media)
    expect(rePayload.drafts).toEqual(drafts)
    expect(rePayload.settings).toEqual(settings)
  })

  it('round-trips cards with nested media/links/code/quotes/tags intact', () => {
    const card = makeCard({
      id: 'card-rich' as unknown as CardId,
      media: [{ assetId: 'ma-1' as never, order: 0, caption: 'pic' }],
      links: [{ url: 'https://e.com', title: 'E', fetchedAt: new Date('2026-06-01T00:00:00.000Z') }],
      codeSnippets: [{ language: 'ts', code: 'const x = 1', caption: 'c' }],
      quotes: [{ text: 'hi\nbye', attribution: 'a', sourceUrl: 'https://e.com/q' }],
      tags: [{ value: 't', color: 'var(--color-blue)' }],
      color: 'var(--color-red)',
    })
    seedStores({ cards: [card] })

    const json = JSON.stringify(mod.buildExportPayload())
    window.localStorage.clear()
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(true)

    const restored = (JSON.parse(window.localStorage.getItem(CARDS_KEY)!) as { cards: Card[] }).cards[0]
    // Date fields (capturedAt/createdAt/updatedAt, links[].fetchedAt) survive
    // as ISO strings through the JSON round-trip — compare the stored shape.
    const stored = asStored(card)
    expect(restored.id).toBe(stored.id)
    expect(restored.media).toEqual(stored.media)
    expect(restored.links).toEqual(stored.links)
    expect(restored.codeSnippets).toEqual(stored.codeSnippets)
    expect(restored.quotes).toEqual(stored.quotes)
    expect(restored.tags).toEqual(stored.tags)
    expect(restored.color).toBe(stored.color)
  })

  it('round-trips a payload missing optional drafts/settings (skips those writes)', () => {
    const card = makeCard()
    // Seed cards only — drafts/settings stay absent from storage.
    seedStores({ cards: [card] })
    const json = JSON.stringify(mod.buildExportPayload())

    window.localStorage.clear()
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.cards).toBe(1)
    // mediaAssets is {} (present), so the media key is written; drafts/settings are absent.
    expect(window.localStorage.getItem(MEDIA_KEY)).not.toBeNull()
    expect(window.localStorage.getItem(DRAFTS_KEY)).toBeNull()
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull()
  })
})

// ── importFromJson — validation / error paths ──────────────────────────────

describe('importFromJson — validation', () => {
  it('rejects invalid JSON with an error message (no throw)', () => {
    const result = mod.importFromJson('{ this is not json')
    expect(result.ok).toBe(false)
    expect(result.cards).toBe(0)
    expect(result.error).toMatch(/invalid JSON/i)
  })

  it('rejects an unsupported version', () => {
    const json = JSON.stringify({ version: 999, exportedAt: 'x', app: 'a', cards: [] })
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unsupported version/i)
  })

  it('rejects a payload where cards is not an array', () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: 'nope',
    })
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/cards is not an array/i)
  })

  it('rejects a card with a missing/empty id', () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: '', title: 't', body: 'b' }],
    })
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/id missing/i)
  })

  it('rejects a card with a non-string title', () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 42, body: 'b' }],
    })
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/title must be a string/i)
  })

  it('rejects a card with a non-string body', () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: null }],
    })
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/body must be a string/i)
  })

  it('rejects a card with a non-string createdAt (when present)', () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b', createdAt: 123 }],
    })
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/createdAt/i)
  })

  it('accepts a card that omits createdAt/updatedAt (optional in validation)', () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b' }],
    })
    const result = mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.cards).toBe(1)
  })

  it('does not write any store when validation fails (atomic: nothing touched)', () => {
    seedStores({ cards: [makeCard()] }) // pre-existing data
    const originalCardsRaw = window.localStorage.getItem(CARDS_KEY)
    const bad = mod.importFromJson('{ broken')
    expect(bad.ok).toBe(false)
    // Existing store untouched.
    expect(window.localStorage.getItem(CARDS_KEY)).toBe(originalCardsRaw)
  })
})

// ── importFromJson — quota rollback ────────────────────────────────────────

describe('importFromJson — write failure rollback', () => {
  it('rolls back all touched keys to pre-import values when a write throws', () => {
    // Pre-existing state we expect to be restored after rollback.
    const prevCards = JSON.stringify({ cards: [makeCard({ title: 'old' })] })
    const prevMedia = JSON.stringify({ assets: { 'ma-old': {} } })

    // Swap in a fake localStorage whose second setItem throws (simulating a
    // quota error on the media-store key) but recovers afterwards so the
    // rollback writes succeed. We spy on a plain object rather than the real
    // window.localStorage so the throw is guaranteed to fire regardless of
    // prototype-binding quirks in jsdom.
    const store = new Map<string, string>()
    store.set(CARDS_KEY, prevCards)
    store.set(MEDIA_KEY, prevMedia)
    let writeCount = 0
    let quenchAfter = false
    const fakeLocalStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writeCount++
        // Only the payload's media-write (the 2nd setItem) throws; subsequent
        // rollback writes must succeed for the recovery to complete.
        if (writeCount === 2 && !quenchAfter) {
          quenchAfter = true
          throw new Error('QuotaExceeded')
        }
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    }
    vi.stubGlobal('localStorage', fakeLocalStorage)

    // A valid payload to import (writes cards + media → second write throws).
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c-new', title: 'new', body: 'b' }],
      mediaAssets: { 'ma-new': {} },
    })

    const result = mod.importFromJson(json)
    vi.unstubAllGlobals()

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/write failed/i)
    expect(writeCount).toBeGreaterThanOrEqual(2) // the failing write was attempted
    // Rollback restored the pre-import snapshots (removeItem on keys whose
    // prev was overwritten, setItem(prev) otherwise). After rollback the
    // stores hold the original envelopes again.
    expect(store.get(CARDS_KEY)).toBe(prevCards)
    expect(store.get(MEDIA_KEY)).toBe(prevMedia)
  })
})

// ── SSR safety ─────────────────────────────────────────────────────────────

describe('SSR safety (window undefined)', () => {
  it('buildExportPayload / downloadExport / importFromJson do not throw when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrMod = await import('../export-service')

      // buildExportPayload returns a payload with empty cards/media even with
      // no window (readJson returns null → ?? [] / ?? {}).
      const payload = ssrMod.buildExportPayload()
      expect(payload.cards).toEqual([])
      expect(payload.mediaAssets).toEqual({})
      expect(payload.version).toBe(ssrMod.EXPORT_FORMAT_VERSION)

      // downloadExport is a no-op returning 0.
      expect(ssrMod.downloadExport()).toBe(0)

      // importFromJson short-circuits with an error result.
      const result = ssrMod.importFromJson('{"version":1,"cards":[]}')
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/not in browser/i)
    } finally {
      globalThis.window = originalWindow
    }
  })
})
