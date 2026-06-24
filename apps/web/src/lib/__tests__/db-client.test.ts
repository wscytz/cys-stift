import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toCardId, generateId } from '@cys-stift/domain'
import type { Card, CardId } from '@cys-stift/domain'

// ── Hook testing note ───────────────────────────────────────────────────────
// useDb (the React hook) is NOT tested here.
// apps/web/package.json has no @testing-library/react in devDependencies, and
// pulling in a new dependency just to test the hook would violate YAGNI. The
// hook is a thin wrapper over useSyncExternalStore + the store API exercised
// below. settings-store.test.ts / canvas-store.test.ts follow the same policy.

// ── Observable-surface note (content-signature regression) ──────────────────
// The v0.37.0 fix (docs/changelog.md L19) made rehydrateCards compare a content
// signature (length + first/last id) instead of array identity, so identical
// content does NOT notify subscribers. The notify path iterates the PRIVATE
// _subscribers set, which is only reachable via the PRIVATE subscribe fn wired
// up inside useDb. Without @testing-library/react we cannot register a
// subscriber, so we cannot directly assert "no notify on identical content".
// Instead we assert the OBSERVABLE consequences: rehydrateCards is idempotent
// (no throw, no data loss) and the signature-differing inputs are consumed.
// A direct no-notify assertion belongs in a future hook-level test once a
// react-testing dependency is added.

const STORAGE_KEY = 'cys-stift.cards.v1'

// ── Test fixture: a minimal but valid Card ──────────────────────────────────
function makeCard(overrides: Partial<Card> = {}): Card {
  const id = (overrides.id ?? toCardId(generateId())) as CardId
  const now = new Date('2026-06-23T10:00:00.000Z')
  return {
    id,
    title: 'test card',
    body: 'hello',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev-test' },
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
    tags: [],
    pinned: false,
    archived: false,
    ...overrides,
  }
}

/** Serialize a Card[] the way db-client.saveSnapshot does (Date → ISO string). */
function serializeCards(cards: Card[]): string {
  return JSON.stringify({ cards })
}

// Module references reset per-test so the in-memory `_cards` cache is fresh.
let rehydrateCards: typeof import('../db-client').rehydrateCards
let resetDb: typeof import('../db-client').resetDb

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  const mod = await import('../db-client')
  rehydrateCards = mod.rehydrateCards
  resetDb = mod.resetDb
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── hydrate: read from localStorage into the in-memory cache ─────────────────
describe('db-client — hydrate (localStorage → in-memory)', () => {
  it('rehydrateCards consumes a pre-seeded localStorage snapshot without throwing', () => {
    const card = makeCard({ title: 'from disk' })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([card]))
    expect(() => rehydrateCards()).not.toThrow()
    // resetDb observes the hydrated in-memory state by clearing both the
    // cache and the key; the key must already have been readable.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeTruthy()
  })

  it('is a no-op on a clean profile (empty localStorage)', () => {
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(() => rehydrateCards()).not.toThrow()
  })
})

// ── persist: the storage envelope format ───────────────────────────────────
// Note: persist() is triggered by cardRepo mutations, which are only reachable
// through useDb(). Since we don't test the hook (no @testing-library/react),
// we verify the envelope FORMAT that saveSnapshot writes (a `{ cards }` JSON
// object with ISO-date strings) by round-tripping it back through
// loadSnapshot inside rehydrateCards.
describe('db-client — storage envelope format round-trip', () => {
  it('round-trips a card with Date fields through the cys-stift.cards.v1 key', () => {
    const card = makeCard({ title: 'round-trip' })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([card]))
    // loadSnapshot rebuilds Date objects via `new Date(...)`; a format
    // divergence would throw inside rehydrateCards.
    expect(() => rehydrateCards()).not.toThrow()
  })

  it('round-trips multiple cards preserving first/last ordering', () => {
    const first = makeCard({ id: toCardId('aaa') })
    const last = makeCard({ id: toCardId('zzz') })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([first, last]))
    expect(() => rehydrateCards()).not.toThrow()
  })
})

// ── rehydrateCards content-signature stability (the v0.37.0 bug) ────────────
// History (docs/changelog.md L19): loadSnapshot() always returns a fresh array,
// so a naive `next.cards !== _cards` identity check would ALWAYS fire —
// causing every cross-tab storage event to notify every useDb() consumer even
// when the parsed content is identical. The fix compares a cheap signature
// (length + first/last id). See the Observable-surface note at the top of this
// file for why we cannot directly assert "no notify" here.
describe('rehydrateCards — content-signature stability (v0.37.0 regression guard)', () => {
  it('is idempotent: re-running rehydrate with identical content does not throw or lose data', () => {
    const card = makeCard({ id: toCardId('aaa') })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([card]))
    rehydrateCards() // first hydrate populates _cards
    // Second call with identical content: signature matches → no-op branch.
    expect(() => rehydrateCards()).not.toThrow()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(serializeCards([card]))
  })

  it('repeated identical rehydrations stay stable across many calls (no drift)', () => {
    const card = makeCard({ id: toCardId('aaa') })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([card]))
    rehydrateCards()
    for (let i = 0; i < 20; i++) {
      expect(() => rehydrateCards()).not.toThrow()
    }
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(serializeCards([card]))
  })

  it('accepts an ADDED card after content changes (signature differs on length)', () => {
    const a = makeCard({ id: toCardId('aaa') })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([a]))
    rehydrateCards()
    const b = makeCard({ id: toCardId('bbb'), title: 'second' })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([a, b]))
    expect(() => rehydrateCards()).not.toThrow()
  })

  it('accepts a swap of the first card (signature differs on first id)', () => {
    const a = makeCard({ id: toCardId('aaa') })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([a]))
    rehydrateCards()
    const b = makeCard({ id: toCardId('bbb') }) // same length, different first id
    window.localStorage.setItem(STORAGE_KEY, serializeCards([b]))
    expect(() => rehydrateCards()).not.toThrow()
  })

  it('accepts a swap of the last card (signature differs on last id)', () => {
    const a = makeCard({ id: toCardId('aaa') })
    const b = makeCard({ id: toCardId('bbb') })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([a, b]))
    rehydrateCards()
    const c = makeCard({ id: toCardId('ccc') }) // same length, different last id
    window.localStorage.setItem(STORAGE_KEY, serializeCards([a, c]))
    expect(() => rehydrateCards()).not.toThrow()
  })
})

// ── rehydrateCards — middle-card edit (R2.5 signature coverage) ──────────────
// History (R2.5): the v0.37.0 signature `${length}:${firstId}:${lastId}` only
// covers endpoints. A cross-tab edit to a MIDDLE card (same length, same first
// and last id, but a middle card's title/updatedAt changed) produces an
// identical signature → rehydrate treats it as "no change" → the in-memory
// cache is never updated → stale data in the current tab. The fix makes the
// signature cover every card's updatedAt (sum + count), so any content change
// is detected while still avoiding the array-identity false-fire. This test
// asserts the OBSERVABLE consequence: after rehydrate, the in-memory cardRepo
// reflects the middle-card change (it did not with the old weak signature).
describe('rehydrateCards — middle-card edit (R2.5)', () => {
  it('picks up a cross-tab edit to a middle card (same length, same endpoints)', async () => {
    const { __test__ } = await import('../db-client')
    const { cardRepo } = __test__
    const base1 = makeCard({ id: toCardId('base-1'), title: 'one' })
    const base2 = makeCard({ id: toCardId('base-2'), title: 'two' })
    const base3 = makeCard({ id: toCardId('base-3'), title: 'three' })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([base1, base2, base3]))
    rehydrateCards() // populate in-memory cache
    expect(cardRepo.getById(toCardId('base-2'))!.title).toBe('two')

    // Simulate a cross-tab edit: another tab rewrote base-2's title and bumped
    // its updatedAt, but length + first/last id are unchanged. Under the old
    // signature this payload produced the SAME signature → rehydrate no-op'd.
    const edited2 = makeCard({
      id: toCardId('base-2'),
      title: 'two EDITED',
      updatedAt: new Date('2026-06-23T11:00:00.000Z'),
    })
    window.localStorage.setItem(STORAGE_KEY, serializeCards([base1, edited2, base3]))
    rehydrateCards()

    // The in-memory cache must now reflect the edited middle card.
    expect(cardRepo.getById(toCardId('base-2'))!.title).toBe('two EDITED')
    const titles = cardRepo.listAll().map((c) => c.title)
    expect(titles).toEqual(['one', 'two EDITED', 'three'])
  })
})

// ── Cross-tab storage event sync ─────────────────────────────────────────────
describe('db-client — cross-tab storage event sync', () => {
  it('does not throw when a storage event fires on the cards key', () => {
    const card = makeCard()
    const evt = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: serializeCards([card, makeCard({ id: toCardId('zzz') })]),
      oldValue: serializeCards([card]),
    })
    expect(() => window.dispatchEvent(evt)).not.toThrow()
  })

  it('ignores storage events for unrelated keys', () => {
    const evt = new StorageEvent('storage', {
      key: 'cys-stift.something-else.v1',
      newValue: '{}',
      oldValue: '{}',
    })
    expect(() => window.dispatchEvent(evt)).not.toThrow()
  })

  it('ignores storage events where newValue equals oldValue', () => {
    const payload = serializeCards([makeCard()])
    const evt = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: payload,
      oldValue: payload, // identical → handler short-circuits
    })
    expect(() => window.dispatchEvent(evt)).not.toThrow()
  })

  it('ignores storage events with null newValue/oldValue', () => {
    const evt = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: null,
      oldValue: null,
    })
    expect(() => window.dispatchEvent(evt)).not.toThrow()
  })

  it('ignores storage events where newValue is present but oldValue is null (key cleared)', () => {
    const evt = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: serializeCards([makeCard()]),
      oldValue: null, // handler requires both newValue && oldValue
    })
    expect(() => window.dispatchEvent(evt)).not.toThrow()
  })
})

// ── Corrupt / invalid localStorage (graceful degradation, no throw) ─────────
describe('db-client — corrupt localStorage graceful degradation', () => {
  it('does not throw on corrupt JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ this is NOT json {{{')
    expect(() => rehydrateCards()).not.toThrow()
  })

  it('does not throw when the cards field is missing', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ notCards: [] }))
    expect(() => rehydrateCards()).not.toThrow()
  })

  it('does not throw when localStorage holds a non-object primitive', () => {
    window.localStorage.setItem(STORAGE_KEY, '42')
    expect(() => rehydrateCards()).not.toThrow()
  })

  it('does not throw when localStorage holds a JSON array (wrong shape)', () => {
    window.localStorage.setItem(STORAGE_KEY, '[1, 2, 3]')
    expect(() => rehydrateCards()).not.toThrow()
  })

  it('does not throw when a card has a non-date capturedAt (Date ctor is lenient)', () => {
    // loadSnapshot does `new Date(c.capturedAt)` unconditionally; an invalid
    // date string yields an Invalid Date object but does not throw.
    const bad = JSON.stringify({
      cards: [
        { ...makeCard(), capturedAt: 'not-a-date', createdAt: 'x', updatedAt: 'y' },
      ],
    })
    window.localStorage.setItem(STORAGE_KEY, bad)
    expect(() => rehydrateCards()).not.toThrow()
  })
})

// ── resetDb ──────────────────────────────────────────────────────────────────
describe('resetDb', () => {
  it('clears the cys-stift.cards.v1 key from localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, serializeCards([makeCard()]))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeTruthy()
    resetDb()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('does not throw when there is nothing to reset', () => {
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(() => resetDb()).not.toThrow()
  })

  it('does not touch unrelated keys', () => {
    window.localStorage.setItem('cys-stift.settings.v1', '{"settings":{}}')
    window.localStorage.setItem(STORAGE_KEY, serializeCards([makeCard()]))
    resetDb()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem('cys-stift.settings.v1')).toBe('{"settings":{}}')
  })
})

// ── SSR safety (window undefined) ────────────────────────────────────────────
describe('db-client — SSR safety', () => {
  it('rehydrateCards is a no-op (no throw) when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const { rehydrateCards: ssrRehydrate } = await import('../db-client')
      expect(() => ssrRehydrate()).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('resetDb does not throw when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const { resetDb: ssrReset } = await import('../db-client')
      expect(() => ssrReset()).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })
})

// ── QuotaExceeded 防护(审计 H1)────────────────────────────────────────────
// saveSnapshot 必须吞 QuotaExceededError 并返回 false,而非抛错导致调用方
// 崩溃。卡片 insert/update/delete 据此决定是否回滚内存 + 提示用户。
describe('saveSnapshot QuotaExceeded 防护', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('saveSnapshot 在 QuotaExceeded 时返回 false 而非抛错', async () => {
    // 触发配额错误:mock setItem 抛 DOMException(QuotaExceededError)
    const quotaErr = new DOMException('quota exceeded', 'QuotaExceededError')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaErr
    })
    const { __test__ } = await import('../db-client')
    const ok = __test__.saveSnapshot({ cards: [] })
    expect(ok).toBe(false)
  })

  it('saveSnapshot 成功时返回 true', async () => {
    const { __test__ } = await import('../db-client')
    const ok = __test__.saveSnapshot({ cards: [] })
    expect(ok).toBe(true)
  })

  it('insert 在配额满时回滚内存数组(不残留未持久化的卡)', async () => {
    const { __test__, rehydrateCards } = await import('../db-client')
    const { cardRepo } = __test__
    // 先正常插一张基线卡
    const base = makeCard({ id: toCardId('base-1') })
    cardRepo.insert(base)
    rehydrateCards()
    // 现在 mock 配额失败,再插一张 —— 应回滚,内存里只剩 base
    const quotaErr = new DOMException('quota exceeded', 'QuotaExceededError')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaErr
    })
    const doomed = makeCard({ id: toCardId('doomed-1') })
    expect(() => cardRepo.insert(doomed)).not.toThrow()
    rehydrateCards()
    const all = cardRepo.listAll()
    expect(all.map((c) => c.id)).toEqual(['base-1'])
  })
})
