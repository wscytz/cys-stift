import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { CanvasSnapshot } from '../canvas-snapshot-store'

// ── Helpers ─────────────────────────────────────────────────────────────────

const CANVAS_A = 'canvas-a' as unknown as Parameters<
  typeof import('../canvas-snapshot-store').canvasSnapshotStore.load
>[0]
const CANVAS_B = 'canvas-b' as unknown as Parameters<
  typeof import('../canvas-snapshot-store').canvasSnapshotStore.load
>[0]

function makeSnapshot(extra: Record<string, unknown> = {}): CanvasSnapshot {
  return {
    document: { state: { some: 'doc' }, ...extra },
    session: { sessionId: 'abc' },
  }
}

// ── Fake OPFS utilities ─────────────────────────────────────────────────────

/** In-memory OPFS shim. Mirrors the subset of the API the store uses. */
function createMockOpfs() {
  const files = new Map<string, string>()

  function getFH(name: string): any {
    return {
      kind: 'file',
      name,
      async createWritable() {
        let buf = ''
        return {
          async write(data: string) {
            buf = data
          },
          async close() {
            files.set(name, buf)
          },
        }
      },
      async getFile() {
        const content = files.get(name)
        return new File(content !== undefined ? [content] : [], name)
      },
    }
  }

  function getDH(_name?: string): any {
    return { getDirectoryHandle: getDH, getFileHandle: getFH, removeEntry }
  }

  async function removeEntry(name: string) {
    files.delete(name)
  }

  return {
    files,
    async getDirectory(): Promise<any> {
      return {
        async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
          // Both returns are symmetric since we create the dir on first save.
          return { getFileHandle: getFH, getDirectoryHandle: getDH, removeEntry }
        },
      }
    },
  }
}

function installOpfsMock() {
  const mock = createMockOpfs()
  vi.stubGlobal(
    'navigator',
    { ...navigator, storage: mock },
  )
  return mock
}

// ── Tests ───────────────────────────────────────────────────────────────────

let canvasSnapshotStore: typeof import('../canvas-snapshot-store').canvasSnapshotStore

beforeEach(async () => {
  vi.resetModules()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  canvasSnapshotStore = (await import('../canvas-snapshot-store')).canvasSnapshotStore
})

describe('canvasSnapshotStore — OPFS primary path', () => {
  let opfs: ReturnType<typeof createMockOpfs>

  beforeEach(() => {
    opfs = installOpfsMock()
  })

  it('round-trips a snapshot through save → load (OPFS)', async () => {
    const snap = makeSnapshot({ extra: 42 })
    await canvasSnapshotStore.save(CANVAS_A, snap)
    const loaded = await canvasSnapshotStore.load(CANVAS_A)
    expect(loaded).toEqual(snap)
  })

  it('returns null when no snapshot exists (OPFS)', async () => {
    const loaded = await canvasSnapshotStore.load(CANVAS_A)
    expect(loaded).toBeNull()
  })

  it('isolates canvases — save canvas-a does not affect canvas-b (OPFS)', async () => {
    await canvasSnapshotStore.save(CANVAS_A, makeSnapshot({ which: 'a' }))
    await canvasSnapshotStore.save(CANVAS_B, makeSnapshot({ which: 'b' }))
    const a = await canvasSnapshotStore.load(CANVAS_A)
    const b = await canvasSnapshotStore.load(CANVAS_B)
    expect(a).toMatchObject({ document: { which: 'a' } })
    expect(b).toMatchObject({ document: { which: 'b' } })
  })

  it('remove deletes the snapshot (OPFS)', async () => {
    await canvasSnapshotStore.save(CANVAS_A, makeSnapshot())
    expect(await canvasSnapshotStore.load(CANVAS_A)).not.toBeNull()
    await canvasSnapshotStore.remove(CANVAS_A)
    expect(await canvasSnapshotStore.load(CANVAS_A)).toBeNull()
  })

  it('remove of a missing snapshot is a no-op (OPFS)', async () => {
    await expect(canvasSnapshotStore.remove(CANVAS_A)).resolves.not.toThrow()
  })

  it('save swallows OPFS errors and falls back to localStorage', async () => {
    // Stub OPFS to throw, and simultaneously stub localStorage.setItem
    // to throw so the fallback also fails — which triggers a warn.
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: () => {
          throw new Error('OPFS QuotaExceededError simulated')
        },
      },
    })
    const origSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('localStorage QuotaExceededError simulated')
    }
    const warn = vi.fn()
    const origWarn = console.warn
    console.warn = warn
    try {
      await expect(
        canvasSnapshotStore.save(CANVAS_A, makeSnapshot()),
      ).resolves.not.toThrow()
      expect(warn).toHaveBeenCalled()
      const msg = String(warn.mock.calls[0]?.[0] ?? '')
      expect(msg).toContain('save failed')
    } finally {
      Storage.prototype.setItem = origSetItem
      console.warn = origWarn
    }
  })
})

describe('canvasSnapshotStore — localStorage fallback', () => {
  it('falls back to localStorage save + load when OPFS is unavailable', async () => {
    const snap = makeSnapshot({ fallback: true })
    await canvasSnapshotStore.save(CANVAS_A, snap)

    // Verify it landed in localStorage (the fallback).
    const raw = window.localStorage.getItem('cys-stift.canvas.canvas-a.v1')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual(snap)

    const loaded = await canvasSnapshotStore.load(CANVAS_A)
    expect(loaded).toEqual(snap)
  })

  it('returns null when no snapshot exists (no OPFS)', async () => {
    expect(await canvasSnapshotStore.load(CANVAS_A)).toBeNull()
  })

  it('returns null and does not throw on corrupt localStorage JSON', async () => {
    window.localStorage.setItem('cys-stift.canvas.canvas-a.v1', 'not valid json{{{')
    const loaded = await canvasSnapshotStore.load(CANVAS_A)
    expect(loaded).toBeNull()
  })

  it('returns null when stored object lacks a document field', async () => {
    window.localStorage.setItem(
      'cys-stift.canvas.canvas-a.v1',
      JSON.stringify({ noDocHere: true }),
    )
    const loaded = await canvasSnapshotStore.load(CANVAS_A)
    expect(loaded).toBeNull()
  })

  it('remove cleans localStorage too', async () => {
    await canvasSnapshotStore.save(CANVAS_A, makeSnapshot())
    expect(window.localStorage.getItem('cys-stift.canvas.canvas-a.v1')).not.toBeNull()
    await canvasSnapshotStore.remove(CANVAS_A)
    expect(window.localStorage.getItem('cys-stift.canvas.canvas-a.v1')).toBeNull()
  })

  it('overwrites a previous snapshot for the same canvas', async () => {
    await canvasSnapshotStore.save(CANVAS_A, makeSnapshot({ v: 1 }))
    await canvasSnapshotStore.save(CANVAS_A, makeSnapshot({ v: 2 }))
    const loaded = await canvasSnapshotStore.load(CANVAS_A)
    expect(loaded).toMatchObject({ document: { v: 2 } })
  })
})

describe('canvasSnapshotStore — OPFS → localStorage migration', () => {
  it('migrates a localStorage snapshot to OPFS on first load', async () => {
    // Seed localStorage without OPFS (no mock initially — it's already
    // uninstalled via beforeEach). After the seed, install OPFS mock and
    // verify migration.
    window.localStorage.setItem(
      'cys-stift.canvas.canvas-a.v1',
      JSON.stringify(makeSnapshot({ migrated: true })),
    )

    const opfs = installOpfsMock()
    try {
      // First load: should come from localStorage AND be migrated to OPFS.
      const loaded = await canvasSnapshotStore.load(CANVAS_A)
      expect(loaded).toMatchObject({ document: { migrated: true } })
      // localStorage copy should be removed after migration (fire-and-forget,
      // so wait a microtask).
      await new Promise((r) => setTimeout(r, 10))
      expect(window.localStorage.getItem('cys-stift.canvas.canvas-a.v1')).toBeNull()
      // Second load should come from OPFS now.
      const loaded2 = await canvasSnapshotStore.load(CANVAS_A)
      expect(loaded2).toEqual(loaded)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('canvasSnapshotStore — edge cases', () => {
  // These tests deliberately mock navigator.storage to return null (OPFS
  // unavailable) but still exercise localStorage fault tolerance.
  it('save does not throw when localStorage throws quota errors', async () => {
    const orig = Storage.prototype.setItem
    const warn = vi.fn()
    const origWarn = console.warn
    console.warn = warn
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError simulated')
    }
    try {
      await expect(canvasSnapshotStore.save(CANVAS_A, makeSnapshot())).resolves.not.toThrow()
      expect(warn).toHaveBeenCalled()
      const msg = String(warn.mock.calls[0]?.[0] ?? '')
      expect(msg).toContain('save failed')
    } finally {
      Storage.prototype.setItem = orig
      console.warn = origWarn
    }
  })
})
