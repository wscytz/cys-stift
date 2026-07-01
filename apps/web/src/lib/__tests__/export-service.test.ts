import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Card, CardId, Canvas, CanvasId } from '@cys-stift/domain'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { canvasFreeformStore } from '../canvas-freeform-store'

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
const CANVASES_KEY = 'cys-stift.canvases.v1'
const CANVAS_VIEW_KEY = 'cys-stift.canvas-view.v1'

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

/** Build a Canvas fixture. Dates as ISO strings (matches the JSON-on-disk shape:
 *  canvas-store persists via JSON.stringify, so createdAt/updatedAt are strings). */
function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    id: 'canvas-1' as unknown as CanvasId,
    workspaceId: 'default' as never,
    name: 'test canvas',
    view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'snap', gridSize: 8 },
    createdAt: '2026-06-20T00:00:00.000Z' as unknown as Date,
    updatedAt: '2026-06-21T00:00:00.000Z' as unknown as Date,
    ...overrides,
  }
}

/** Seed the canvas-list store envelope directly (matches canvas-store saveSnapshot). */
function seedCanvases(canvases: Canvas[], activeCanvasId: string) {
  window.localStorage.setItem(
    CANVASES_KEY,
    JSON.stringify({ snapshot: { canvases, activeCanvasId } }),
  )
}

/**
 * Seed the per-canvas view store (matches canvas-view-store saveViewMap shape:
 * `{ views: Record<CanvasId, CanvasView> }`). zoom/pan/gridMode/gridSize per canvas.
 */
function seedCanvasView(views: Record<string, unknown>) {
  window.localStorage.setItem(CANVAS_VIEW_KEY, JSON.stringify({ views }))
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
  it('assembles cards + media + drafts + settings from localStorage', async () => {
    const card = makeCard({ title: 'exported' })
    const media = { 'ma-1': { id: 'ma-1', kind: 'image' } }
    const drafts = { 'draft-1': { title: 'wip' } }
    const settings = { theme: 'dark', locale: 'en' }
    seedStores({ cards: [card], mediaAssets: media, drafts, settings })

    const payload = await mod.buildExportPayload()

    expect(payload.cards).toEqual([asStored(card)])
    expect(payload.mediaAssets).toEqual(media)
    expect(payload.drafts).toEqual(drafts)
    expect(payload.settings).toEqual(settings)
  })

  it('stamps the versioned format version', async () => {
    const payload = await mod.buildExportPayload()
    expect(payload.version).toBe(mod.EXPORT_FORMAT_VERSION)
    expect(payload.version).toBe(1)
  })

  it('exportedAt is an ISO string at call time', async () => {
    const payload = await mod.buildExportPayload()
    expect(payload.exportedAt).toBe('2026-06-23T12:00:00.000Z')
    expect(new Date(payload.exportedAt).toISOString()).toBe(payload.exportedAt)
  })

  it('app name is "cy\'s Stift"', async () => {
    const payload = await mod.buildExportPayload()
    expect(payload.app).toBe("cy's Stift")
  })

  it('degrades to empty cards when the cards store is missing', async () => {
    // Only seed media, not cards.
    seedStores({ mediaAssets: { 'ma-1': {} } })
    const payload = await mod.buildExportPayload()
    expect(payload.cards).toEqual([])
    expect(payload.mediaAssets).toEqual({ 'ma-1': {} })
  })

  it('degrades to empty mediaAssets when media store is missing', async () => {
    seedStores({ cards: [makeCard()] })
    const payload = await mod.buildExportPayload()
    expect(payload.mediaAssets).toEqual({})
  })

  it('omits drafts/settings (undefined) when those stores are absent', async () => {
    seedStores({ cards: [makeCard()] })
    const payload = await mod.buildExportPayload()
    expect(payload.drafts).toBeUndefined()
    expect(payload.settings).toBeUndefined()
  })

  it('returns empty defaults on corrupt JSON instead of throwing', async () => {
    window.localStorage.setItem(CARDS_KEY, '{ not json')
    window.localStorage.setItem(MEDIA_KEY, '} also not json')
    const payload = await mod.buildExportPayload()
    expect(payload.cards).toEqual([])
    expect(payload.mediaAssets).toEqual({})
    expect(payload.version).toBe(mod.EXPORT_FORMAT_VERSION)
  })
})

// ── buildExportPayload — includeDeleted filter (P2, 2026-06-28) ────────────
// Default = include everything (full recoverable backup). When the user
// unchecks "include deleted/archived" in settings, buildExportPayload must
// filter out cards with archived=true or a deletedAt timestamp. The count
// math in the settings page (live vs excluded) depends on this.

describe('buildExportPayload includeDeleted', () => {
  // 3 cards: 1 live, 1 archived, 1 soft-deleted.
  const seedMixed = () => {
    const live = makeCard({ id: 'card-live' as unknown as CardId, archived: false })
    const archived = makeCard({
      id: 'card-archived' as unknown as CardId,
      archived: true,
    })
    const deleted = makeCard({
      id: 'card-deleted' as unknown as CardId,
      archived: false,
      deletedAt: '2026-01-01T00:00:00.000Z' as unknown as Date,
    })
    seedStores({ cards: [live, archived, deleted] })
    return { live, archived, deleted }
  }

  it('includes all cards by default (includeDeleted undefined)', async () => {
    seedMixed()
    const payload = await mod.buildExportPayload()
    expect(payload.cards.length).toBe(3)
  })

  it('includes all cards when includeDeleted=true', async () => {
    seedMixed()
    const payload = await mod.buildExportPayload({ includeDeleted: true })
    expect(payload.cards.length).toBe(3)
  })

  it('filters archived + deleted when includeDeleted=false', async () => {
    seedMixed()
    const payload = await mod.buildExportPayload({ includeDeleted: false })
    expect(payload.cards.length).toBe(1)
    // The lone surviving card must be the live one.
    expect(payload.cards.every((c) => !c.archived && !c.deletedAt)).toBe(true)
    expect(payload.cards[0]!.id).toBe('card-live')
  })
})

// ── buildExportPayload — canvases + freeform geometry ──────────────────────

describe('buildExportPayload — canvases + freeform', () => {
  it('includes the canvases envelope when the canvas store is seeded', async () => {
    const c1 = makeCanvas({ id: 'canvas-a' as unknown as CanvasId, name: 'A' })
    const c2 = makeCanvas({ id: 'canvas-b' as unknown as CanvasId, name: 'B' })
    seedCanvases([c1, c2], 'canvas-b')

    const payload = await mod.buildExportPayload()

    expect(payload.canvases).toBeDefined()
    expect(payload.canvases!.canvases).toHaveLength(2)
    expect(payload.canvases!.canvases[0]!.id).toBe('canvas-a')
    expect(payload.canvases!.canvases[1]!.name).toBe('B')
    expect(payload.canvases!.activeCanvasId).toBe('canvas-b')
  })

  it('includes freeform geometry per canvas (read via canvasFreeformStore)', async () => {
    const canvasId = 'canvas-free' as unknown as CanvasId
    seedCanvases([makeCanvas({ id: canvasId })], String(canvasId))

    const elements: CanvasElement[] = [
      { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
      {
        id: 'f1',
        kind: 'freedraw',
        x: 0,
        y: 0,
        w: 50,
        h: 50,
        rotation: 0,
        meta: { points: [[0, 0], [10, 10]] },
      },
      { id: 'a1', kind: 'arrow', x: 5, y: 5, w: 100, h: 0, rotation: 0, from: 'r1', to: 'f1' },
    ]
    await canvasFreeformStore.save(canvasId, elements)

    const payload = await mod.buildExportPayload()

    expect(payload.freeform).toBeDefined()
    const snap = payload.freeform![String(canvasId)]!
    expect(snap).toBeDefined()
    expect(snap.v).toBe(1)
    expect(snap.app).toBe('cys-stift')
    // All three are non-card → all preserved.
    expect(snap.elements).toHaveLength(3)
    expect(snap.elements.map((e) => e.kind).sort()).toEqual(['arrow', 'freedraw', 'rect'])
  })

  it('omits canvases and freeform when the canvas store is absent (backward compat)', async () => {
    // Seed only cards; no canvases key, no freeform.
    seedStores({ cards: [makeCard()] })

    const payload = await mod.buildExportPayload()

    expect(payload.canvases).toBeUndefined()
    expect(payload.freeform).toBeUndefined()
  })

  it('omits freeform (but keeps canvases) when a canvas has no freeform data', async () => {
    const canvasId = 'canvas-empty' as unknown as CanvasId
    // Seed canvases but never save freeform for it.
    seedCanvases([makeCanvas({ id: canvasId })], String(canvasId))

    const payload = await mod.buildExportPayload()

    expect(payload.canvases).toBeDefined()
    expect(payload.canvases!.canvases).toHaveLength(1)
    // No freeform was saved → empty entries → field omitted.
    expect(payload.freeform).toBeUndefined()
  })
})

// ── buildExportPayload — canvasView (per-canvas zoom/pan/gridMode) ────────────

// R2.1: the canvas-view store (cys-stift.canvas-view.v1) holds per-canvas
// zoom/pan/gridMode/gridSize. It was absent from export/import, so migrating
// devices silently lost every canvas's view. These tests cover export reads it,
// import writes it, and a full round-trip preserves it. Backward compat: an old
// JSON without the field still imports (skipped, no key written).
describe('buildExportPayload + import — canvasView (R2.1)', () => {
  const knownViews = {
    'canvas-a': { zoom: 1.5, panX: 10, panY: -20, gridMode: 'snap', gridSize: 8 },
    'canvas-b': { zoom: 0.5, panX: 0, panY: 100, gridMode: 'free', gridSize: 16 },
  }

  it('buildExportPayload includes canvasView when the store is seeded', async () => {
    seedCanvasView(knownViews)
    const payload = await mod.buildExportPayload()
    expect(payload.canvasView).toBeDefined()
    expect(payload.canvasView).toEqual(knownViews)
  })

  it('omits canvasView (undefined) when the store is absent', async () => {
    seedStores({ cards: [makeCard()] }) // no canvas-view key
    const payload = await mod.buildExportPayload()
    expect(payload.canvasView).toBeUndefined()
  })

  it('import writes canvasView to localStorage when the payload has it', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b', capturedAt: '2026-06-20T00:00:00.000Z' }],
      canvasView: knownViews,
    })
    expect(window.localStorage.getItem(CANVAS_VIEW_KEY)).toBeNull()
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)
    const restored = JSON.parse(window.localStorage.getItem(CANVAS_VIEW_KEY)!) as {
      views: Record<string, unknown>
    }
    expect(restored.views).toEqual(knownViews)
  })

  it('round-trips canvasView through export → wipe → import (no loss)', async () => {
    seedCanvasView(knownViews)
    const json = JSON.stringify(await mod.buildExportPayload())
    window.localStorage.clear()
    expect(window.localStorage.getItem(CANVAS_VIEW_KEY)).toBeNull()

    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)

    const restored = JSON.parse(window.localStorage.getItem(CANVAS_VIEW_KEY)!) as {
      views: Record<string, unknown>
    }
    expect(restored.views).toEqual(knownViews)
  })

  it('backward compat: legacy JSON without canvasView still imports (no key written)', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b', capturedAt: '2026-06-20T00:00:00.000Z' }],
      // no canvasView field
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(window.localStorage.getItem(CANVAS_VIEW_KEY)).toBeNull()
  })
})

// ── Export → Import round-trip (the regression guard for 数据可迁移) ─────────

describe('export → import round-trip (no data loss)', () => {
  it('a full export re-imports byte-for-byte into the four stores', async () => {
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
    const payload = await mod.buildExportPayload()
    const json = JSON.stringify(payload, null, 2)

    // Wipe storage to simulate a fresh device, then import.
    window.localStorage.clear()

    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.cards).toBe(2)
    expect(result.mediaAssets).toBe(1)

    // Each store now holds exactly the exported envelope.
    expect(JSON.parse(window.localStorage.getItem(CARDS_KEY)!)).toEqual({ cards: [asStored(cardA), asStored(cardB)] })
    expect(JSON.parse(window.localStorage.getItem(MEDIA_KEY)!)).toEqual({ assets: media })
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY)!)).toEqual({ drafts })
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toEqual({ settings })

    // And re-exporting reproduces the same payload (version + data).
    const rePayload = await mod.buildExportPayload()
    expect(rePayload.version).toBe(payload.version)
    expect(rePayload.cards).toEqual([asStored(cardA), asStored(cardB)])
    expect(rePayload.mediaAssets).toEqual(media)
    expect(rePayload.drafts).toEqual(drafts)
    expect(rePayload.settings).toEqual(settings)
  })

  it('round-trips cards with nested media/links/code/quotes/tags intact', async () => {
    const card = makeCard({
      id: 'card-rich' as unknown as CardId,
      media: [{ assetId: 'ma-1' as never, order: 0, caption: 'pic' }],
      links: [{ url: 'https://e.com', title: 'E', fetchedAt: new Date('2026-06-01T00:00:00.000Z') }],
      codeSnippets: [{ language: 'ts', code: 'const x = 1', caption: 'c' }],
      quotes: [{ text: 'hi\nbye', attribution: 'a', sourceUrl: 'https://e.com/q' }],
      tags: [{ value: 't', color: 'var(--color-blue)' }],
      color: 'red',
    })
    seedStores({ cards: [card] })

    const json = JSON.stringify(await mod.buildExportPayload())
    window.localStorage.clear()
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)

    const restored = (JSON.parse(window.localStorage.getItem(CARDS_KEY)!) as { cards: Card[] }).cards[0]
    if (!restored) throw new Error('test setup: restored card missing')
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

  it('round-trips a payload missing optional drafts/settings (skips those writes)', async () => {
    const card = makeCard()
    // Seed cards only — drafts/settings stay absent from storage.
    seedStores({ cards: [card] })
    const json = JSON.stringify(await mod.buildExportPayload())

    window.localStorage.clear()
    const result = await mod.importFromJson(json)
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
  it('rejects invalid JSON with an error message (no throw)', async () => {
    const result = await mod.importFromJson('{ this is not json')
    expect(result.ok).toBe(false)
    expect(result.cards).toBe(0)
    expect(result.error).toMatch(/invalid JSON/i)
  })

  it('rejects an unsupported version', async () => {
    const json = JSON.stringify({ version: 999, exportedAt: 'x', app: 'a', cards: [] })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unsupported version/i)
  })

  it('rejects a payload where cards is not an array', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: 'nope',
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/cards is not an array/i)
  })

  it('rejects a card with a missing/empty id', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: '', title: 't', body: 'b' }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/id missing/i)
  })

  it('rejects a card with a non-string title', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 42, body: 'b' }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/title must be a string/i)
  })

  it('rejects a card with a non-string body', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: null }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/body must be a string/i)
  })

  it('rejects a card with a non-string createdAt (when present)', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b', createdAt: 123 }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/createdAt/i)
  })

  // ── capturedAt validation (quota-silence / import-validation fix) ──────────
  // capturedAt is the inbox sort key (listInbox: `b.capturedAt.getTime() - a...`).
  // A missing or unparseable capturedAt → `new Date(undefined|garbage)` = Invalid
  // Date → getTime() = NaN → Array.sort with a NaN comparator scrambles inbox
  // order. Unlike createdAt/updatedAt (optional), capturedAt MUST be present and
  // parse to a real date.
  it('rejects a card with a missing capturedAt (required, unlike createdAt/updatedAt)', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b' }], // no capturedAt
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/capturedAt missing/i)
  })

  it('rejects a card with a null capturedAt', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b', capturedAt: null }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/capturedAt missing/i)
  })

  it('rejects a card with a non-date capturedAt type (number)', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b', capturedAt: 12345 }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/capturedAt missing/i)
  })

  it('rejects a card with an unparseable capturedAt string (Invalid Date → NaN sort)', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      // 'garbage' is a string (passes the type check) but new Date('garbage')
      // = Invalid Date → getTime() = NaN. This is the exact bug that scrambled
      // inbox sort before the fix.
      cards: [{ id: 'c1', title: 't', body: 'b', capturedAt: 'not-a-real-date' }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/capturedAt is not a valid date/i)
  })

  it('accepts a card with a valid ISO capturedAt string', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      cards: [{ id: 'c1', title: 't', body: 'b', capturedAt: '2026-06-20T00:00:00.000Z' }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.cards).toBe(1)
  })

  it('accepts a card that omits createdAt/updatedAt (optional) but requires capturedAt', async () => {
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: 'x',
      app: 'a',
      // createdAt/updatedAt optional; capturedAt is the required inbox sort key.
      cards: [{ id: 'c1', title: 't', body: 'b', capturedAt: '2026-06-20T00:00:00.000Z' }],
    })
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.cards).toBe(1)
  })

  it('does not write any store when validation fails (atomic: nothing touched)', async () => {
    seedStores({ cards: [makeCard()] }) // pre-existing data
    const originalCardsRaw = window.localStorage.getItem(CARDS_KEY)
    const bad = await mod.importFromJson('{ broken')
    expect(bad.ok).toBe(false)
    // Existing store untouched.
    expect(window.localStorage.getItem(CARDS_KEY)).toBe(originalCardsRaw)
  })
})

// ── importFromJson — quota rollback ────────────────────────────────────────

describe('importFromJson — write failure rollback', () => {
  it('rolls back all touched keys to pre-import values when a write throws', async () => {
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
      cards: [{ id: 'c-new', title: 'new', body: 'b', capturedAt: '2026-06-20T00:00:00.000Z' }],
      mediaAssets: { 'ma-new': {} },
    })

    const result = await mod.importFromJson(json)
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
      const payload = await ssrMod.buildExportPayload()
      expect(payload.cards).toEqual([])
      expect(payload.mediaAssets).toEqual({})
      expect(payload.version).toBe(ssrMod.EXPORT_FORMAT_VERSION)

      // downloadExport is a no-op returning 0.
      expect(await ssrMod.downloadExport()).toBe(0)

      // importFromJson short-circuits with an error result.
      const result = await ssrMod.importFromJson('{"version":1,"cards":[]}')
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/not in browser/i)
    } finally {
      globalThis.window = originalWindow
    }
  })
})

// ── importFromJson — canvases + freeform geometry round-trip ───────────────

describe('importFromJson — canvases + freeform round-trip', () => {
  it('restores canvases + freeform + cards on a full export→import (no data loss)', async () => {
    // Seed all three geometry sources: a card, the canvas list, and freeform
    // elements for that canvas. buildExportPayload reads them all back.
    const canvasId = 'canvas-rt' as unknown as CanvasId
    const canvas = makeCanvas({ id: canvasId, name: 'RT canvas' })
    seedStores({
      cards: [makeCard({ id: 'card-rt' as unknown as CardId, title: 'on canvas' })],
    })
    seedCanvases([canvas], String(canvasId))
    const elements: CanvasElement[] = [
      { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
      {
        id: 'f1',
        kind: 'freedraw',
        x: 0,
        y: 0,
        w: 50,
        h: 50,
        rotation: 0,
        meta: { points: [[0, 0], [10, 10]] },
      },
    ]
    await canvasFreeformStore.save(canvasId, elements)

    // Export the full payload, wipe storage, re-import.
    const json = JSON.stringify(await mod.buildExportPayload())
    window.localStorage.clear()

    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.cards).toBe(1)
    expect(result.canvases).toBe(1)
    expect(result.freeformCanvases).toBe(1)

    // canvases list restored (read localStorage directly — the canvasStore
    // singleton's hydrate-once flag would not re-read after a write).
    const restoredCanvases = JSON.parse(window.localStorage.getItem(CANVASES_KEY)!) as {
      snapshot: { canvases: Canvas[]; activeCanvasId: string }
    }
    expect(restoredCanvases.snapshot.canvases).toHaveLength(1)
    expect(restoredCanvases.snapshot.canvases[0]!.id).toBe(String(canvasId))
    expect(restoredCanvases.snapshot.activeCanvasId).toBe(String(canvasId))

    // freeform restored (jsdom has no OPFS → save/load round-trips via the
    // localStorage fallback, which clear()+import re-populated).
    const restoredFreeform = await canvasFreeformStore.load(canvasId)
    expect(restoredFreeform).not.toBeNull()
    expect(restoredFreeform!.elements).toHaveLength(2)
    expect(restoredFreeform!.elements.map((e) => e.kind).sort()).toEqual(['freedraw', 'rect'])

    // cards restored.
    const restoredCards = (
      JSON.parse(window.localStorage.getItem(CARDS_KEY)!) as { cards: Card[] }
    ).cards
    expect(restoredCards).toHaveLength(1)
    expect(restoredCards[0]!.title).toBe('on canvas')
  })

  it('keeps a card bound to its non-default canvas after round-trip (no orphan)', async () => {
    // A card placed on canvas-X (via canvasPosition) must not become an
    // orphan (drop to the inbox) after export→import: the canvas list is
    // restored alongside the card, so the binding stays consistent.
    const canvasX = 'canvas-x' as unknown as CanvasId
    const defaultCanvas = makeCanvas({
      id: 'canvas-default' as unknown as CanvasId,
      name: 'Default',
    })
    const xCanvas = makeCanvas({ id: canvasX, name: 'X' })
    const cardOnX = makeCard({
      id: 'card-on-x' as unknown as CardId,
      title: 'lives on X',
      canvasPosition: { canvasId: canvasX, x: 5, y: 5, w: 120, h: 90, z: 2 },
    })
    seedStores({ cards: [cardOnX] })
    seedCanvases([defaultCanvas, xCanvas], String(canvasX))

    const json = JSON.stringify(await mod.buildExportPayload())
    window.localStorage.clear()
    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.canvases).toBe(2)

    // canvas-X is present in the restored list → the card's binding resolves.
    const restoredCanvases = JSON.parse(window.localStorage.getItem(CANVASES_KEY)!) as {
      snapshot: { canvases: Canvas[]; activeCanvasId: string }
    }
    const ids = restoredCanvases.snapshot.canvases.map((c) => String(c.id))
    expect(ids).toContain(String(canvasX))

    // The card kept its canvasPosition → not orphaned to the inbox.
    const restoredCard = (
      JSON.parse(window.localStorage.getItem(CARDS_KEY)!) as { cards: Card[] }
    ).cards[0]!
    expect(restoredCard.canvasPosition?.canvasId).toBe(String(canvasX))
  })

  it('backward compat: imports a payload with no canvases/freeform fields (legacy JSON)', async () => {
    // A pre-geometry JSON (version 1, cards + media only) must still import
    // without error and must NOT write the canvases key or any freeform.
    const json = JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      app: "cy's Stift",
      cards: [{ id: 'legacy-1', title: 'old', body: 'b', capturedAt: '2026-06-20T00:00:00.000Z' }],
      mediaAssets: { 'ma-1': { id: 'ma-1', kind: 'image' } },
    })

    const result = await mod.importFromJson(json)
    expect(result.ok).toBe(true)
    expect(result.cards).toBe(1)
    expect(result.mediaAssets).toBe(1)
    // No canvases/freeform in the payload → none written, none reported.
    expect(result.canvases).toBeUndefined()
    expect(result.freeformCanvases).toBeUndefined()
    expect(window.localStorage.getItem(CANVASES_KEY)).toBeNull()

    // cards still imported.
    const restoredCards = (
      JSON.parse(window.localStorage.getItem(CARDS_KEY)!) as { cards: Card[] }
    ).cards
    expect(restoredCards).toHaveLength(1)
    expect(restoredCards[0]!.id).toBe('legacy-1')
  })
})

// ── importFromJson — freeform save 失败诚实回报 (import-freeform-atomicity) ──
//
// canvasFreeformStore.save 返回 Promise<boolean>(true=OPFS/localStorage 持久化成功,
// false=双失败)。此前 importFromJson 忽略该返回值,无条件 freeformCanvases++ ——
// 部分画布几何静默丢失却返回 ok:true 不报错。这里覆盖 save 失败路径:检查返回值,
// 累计 freeformSkipped,不整体失败(卡片/canvas 列表已落地有 rollback)。
describe('importFromJson — freeform save 失败诚实回报', () => {
  /** Build a payload with 2 freeform canvases (cv1 + cv2) carrying rect elements. */
  function buildTwoFreeformPayload() {
    const cv1 = 'cv1' as unknown as CanvasId
    const cv2 = 'cv2' as unknown as CanvasId
    const rect = (id: string): CanvasElement => ({
      id,
      kind: 'rect',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      rotation: 0,
      color: 'red',
    })
    return JSON.stringify({
      version: mod.EXPORT_FORMAT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      app: "cy's Stift",
      cards: [{ id: 'c1', title: 't', body: 'b', capturedAt: '2026-06-20T00:00:00.000Z' }],
      canvases: {
        canvases: [makeCanvas({ id: cv1 }), makeCanvas({ id: cv2 })],
        activeCanvasId: 'cv1',
      },
      freeform: {
        cv1: { v: 1, app: 'cys-stift', elements: [rect('r1')] },
        cv2: { v: 1, app: 'cys-stift', elements: [rect('r2')] },
      },
    })
  }

  it('canvasFreeformStore.save 返回 false → freeformSkipped 计数,不整体失败', async () => {
    const json = buildTwoFreeformPayload()
    // 必须用 mod 同一模块实例的 canvasFreeformStore(beforeEach 的
    // vi.resetModules 会让 mod 拿到新实例,与顶部静态 import 不是同一个)。
    const { canvasFreeformStore: store } = await import('../canvas-freeform-store')
    // cv1 save 成功(true),cv2 save 失败(false —— OPFS+localStorage 双失败模拟)。
    const spy = vi
      .spyOn(store, 'save')
      .mockImplementation(async (id) => id === 'cv1')

    const result = await mod.importFromJson(json)

    expect(result.ok).toBe(true) // 核心数据成功,不整体失败
    expect(result.freeformCanvases).toBe(1) // 只计成功的
    expect(result.freeformSkipped).toBe(1) // 失败的诚实计
    spy.mockRestore()
  })

  it('全部 freeform save 成功 → freeformSkipped 不出现(向后兼容)', async () => {
    const json = buildTwoFreeformPayload()
    const { canvasFreeformStore: store } = await import('../canvas-freeform-store')
    const spy = vi.spyOn(store, 'save').mockResolvedValue(true)

    const result = await mod.importFromJson(json)

    expect(result.ok).toBe(true)
    expect(result.freeformCanvases).toBe(2)
    // 全成功 → freeformSkipped 不出现(向后兼容:全成功不报 skipped)
    expect(result.freeformSkipped).toBeUndefined()
    spy.mockRestore()
  })
})
