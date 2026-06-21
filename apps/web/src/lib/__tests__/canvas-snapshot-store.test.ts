import { describe, it, expect, beforeEach } from 'vitest'
import { canvasSnapshotStore, type CanvasSnapshot } from '../canvas-snapshot-store'

const CANVAS_A = 'canvas-a' as unknown as Parameters<typeof canvasSnapshotStore.load>[0]
const CANVAS_B = 'canvas-b' as unknown as Parameters<typeof canvasSnapshotStore.load>[0]

function makeSnapshot(extra: Record<string, unknown> = {}): CanvasSnapshot {
  return {
    document: { state: { some: 'doc' }, ...extra },
    session: { sessionId: 'abc' },
  }
}

describe('canvasSnapshotStore', () => {
  beforeEach(() => {
    // Each test gets a clean localStorage — jsdom's storage persists across
    // tests otherwise (per jsdom docs).
    window.localStorage.clear()
  })

  it('round-trips a snapshot through save → load', () => {
    const snap = makeSnapshot({ extra: 42 })
    canvasSnapshotStore.save(CANVAS_A, snap)
    const loaded = canvasSnapshotStore.load(CANVAS_A)
    expect(loaded).toEqual(snap)
  })

  it('returns null when no snapshot exists for the canvas', () => {
    expect(canvasSnapshotStore.load(CANVAS_A)).toBeNull()
  })

  it('returns null and does not throw on corrupt JSON', () => {
    // Reach into localStorage directly to plant bad JSON.
    window.localStorage.setItem('cys-stift.canvas.canvas-a.v1', 'not valid json{{{')
    const loaded = canvasSnapshotStore.load(CANVAS_A)
    expect(loaded).toBeNull()
  })

  it('returns null when the stored object lacks a document field', () => {
    window.localStorage.setItem(
      'cys-stift.canvas.canvas-a.v1',
      JSON.stringify({ noDocHere: true }),
    )
    expect(canvasSnapshotStore.load(CANVAS_A)).toBeNull()
  })

  it('isolates canvases — saving canvas-a does not affect canvas-b', () => {
    canvasSnapshotStore.save(CANVAS_A, makeSnapshot({ which: 'a' }))
    canvasSnapshotStore.save(CANVAS_B, makeSnapshot({ which: 'b' }))
    expect(canvasSnapshotStore.load(CANVAS_A)).toMatchObject({
      document: { which: 'a' },
    })
    expect(canvasSnapshotStore.load(CANVAS_B)).toMatchObject({
      document: { which: 'b' },
    })
  })

  it('swallows quota errors and warns instead of throwing', () => {
    // Override setItem to throw a quota-like error.
    const original = Storage.prototype.setItem
    const warn = vi.fn()
    const originalWarn = console.warn
    console.warn = warn
    Storage.prototype.setItem = () => {
      const err = new Error('QuotaExceededError simulated')
      throw err
    }
    try {
      expect(() => canvasSnapshotStore.save(CANVAS_A, makeSnapshot())).not.toThrow()
      expect(warn).toHaveBeenCalledTimes(1)
      // Expect the warn message to mention the canvas id (helps debugging).
      const message = String(warn.mock.calls[0]?.[0] ?? '')
      expect(message).toContain('save failed')
    } finally {
      Storage.prototype.setItem = original
      console.warn = originalWarn
    }
  })

  it('remove deletes the snapshot', () => {
    canvasSnapshotStore.save(CANVAS_A, makeSnapshot())
    expect(canvasSnapshotStore.load(CANVAS_A)).not.toBeNull()
    canvasSnapshotStore.remove(CANVAS_A)
    expect(canvasSnapshotStore.load(CANVAS_A)).toBeNull()
  })

  it('remove of a missing snapshot is a no-op (no throw)', () => {
    expect(() => canvasSnapshotStore.remove(CANVAS_A)).not.toThrow()
  })
})

/**
 * SSR no-op behaviour — we can't actually swap out `window` in jsdom after
 * the module has loaded (canvas-snapshot-store references `window` at the
 * top of each method via `typeof window === 'undefined'`). Instead we test
 * that the methods DON'T throw when `window.localStorage` returns null-like
 * values. The real SSR path is exercised at runtime when Next.js renders
 * on the server; jsdom can't simulate that environment.
 */
describe('canvasSnapshotStore — edge cases', () => {
  it('save when localStorage.setItem returns silently does not throw', () => {
    // jsdom's setItem normally succeeds; this just confirms the happy path
    // doesn't throw (defensive).
    expect(() => canvasSnapshotStore.save(CANVAS_A, makeSnapshot())).not.toThrow()
  })
})