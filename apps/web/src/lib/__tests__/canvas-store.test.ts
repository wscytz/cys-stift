import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the freeform store so we can assert canvas deletion cleans up its
// persisted non-card elements (and leftover tldraw snapshots).
const freeformRemove = vi.fn(async () => {})
vi.mock('../canvas-freeform-store', () => ({
  canvasFreeformStore: {
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    remove: freeformRemove,
  },
}))

let canvasStore: typeof import('../canvas-store').canvasStore

beforeEach(async () => {
  vi.resetModules()
  freeformRemove.mockClear()
  window.localStorage.clear()
  canvasStore = (await import('../canvas-store')).canvasStore
})

describe('canvasStore — seed / first launch', () => {
  it('returns the seed canvas as active on first hydration', () => {
    const snap = canvasStore.get()
    expect(snap.canvases.length).toBe(1)
    expect(snap.canvases[0]?.name).toBe('default canvas')
    expect(snap.activeCanvasId).toBe(snap.canvases[0]?.id)
  })
})

describe('canvasStore.create', () => {
  it('creates a canvas and makes it active', () => {
    const id = canvasStore.create('My Canvas')
    const snap = canvasStore.get()
    expect(snap.canvases.length).toBe(2)
    expect(snap.canvases.some((c) => c.name === 'My Canvas')).toBe(true)
    expect(snap.activeCanvasId).toBe(id)
  })
  it('dedupes names by appending (N)', () => {
    canvasStore.create('test')
    canvasStore.create('test')
    canvasStore.create('test')
    const names = canvasStore.get().canvases.map((c) => c.name)
    expect(names).toContain('test')
    expect(names).toContain('test (2)')
    expect(names).toContain('test (3)')
  })
  it('trims the name', () => {
    canvasStore.create('  hello  ')
    expect(canvasStore.get().canvases.some((c) => c.name === 'hello')).toBe(true)
  })
  it('falls back to "untitled canvas" on empty name', () => {
    canvasStore.create('   ')
    expect(canvasStore.get().canvases.some((c) => c.name === 'untitled canvas')).toBe(true)
  })
})

describe('canvasStore.rename', () => {
  it('renames a canvas', () => {
    const id = canvasStore.create('old')
    canvasStore.rename(id, 'new')
    expect(canvasStore.get().canvases.find((c) => c.id === id)?.name).toBe('new')
  })
  it('is a no-op on empty name', () => {
    const id = canvasStore.create('keep')
    canvasStore.rename(id, '  ')
    expect(canvasStore.get().canvases.find((c) => c.id === id)?.name).toBe('keep')
  })
  it('no-ops for unknown id', () => {
    canvasStore.rename('unknown' as never, 'boom')
    expect(canvasStore.get().canvases.length).toBe(1) // still only seed
  })
})

describe('canvasStore.delete', () => {
  it('refuses to delete the default canvas', () => {
    expect(canvasStore.delete(canvasStore.get().canvases[0]!.id)).toBe(false)
    expect(canvasStore.get().canvases.length).toBe(1)
  })
  it('deletes a non-default canvas and falls back to default', () => {
    const created = canvasStore.create('temp')
    expect(canvasStore.get().canvases.length).toBe(2)
    canvasStore.delete(created)
    const snap = canvasStore.get()
    expect(snap.canvases.length).toBe(1)
    expect(snap.activeCanvasId).toBe(snap.canvases[0]?.id)
  })
  it('no-ops for unknown id', () => {
    expect(canvasStore.delete('ghost-id' as never)).toBe(false)
  })
  it('cleans up freeform-store data when deleting a non-default canvas', () => {
    const created = canvasStore.create('temp')
    canvasStore.delete(created)
    expect(freeformRemove).toHaveBeenCalledWith(created)
  })
  it('does not clean up freeform data when refusing to delete the default canvas', () => {
    canvasStore.delete(canvasStore.get().canvases[0]!.id)
    expect(freeformRemove).not.toHaveBeenCalled()
  })
  it('does not clean up freeform data for an unknown id', () => {
    canvasStore.delete('ghost-id' as never)
    expect(freeformRemove).not.toHaveBeenCalled()
  })
})

describe('canvasStore.setActive', () => {
  it('switches active canvas', () => {
    const a = canvasStore.get().activeCanvasId
    const b = canvasStore.create('second')
    expect(canvasStore.get().activeCanvasId).toBe(b)
    canvasStore.setActive(a)
    expect(canvasStore.get().activeCanvasId).toBe(a)
  })
  it('no-ops for unknown id', () => {
    canvasStore.setActive('ghost' as never)
    expect(canvasStore.get().activeCanvasId).toBe(canvasStore.get().canvases[0]?.id)
  })
})

describe('canvasStore — corrupt localStorage', () => {
  it('survives corrupt JSON and seeds fresh', async () => {
    vi.resetModules()
    window.localStorage.setItem('cys-stift.canvases.v1', 'this is NOT json {{{')
    const cs = (await import('../canvas-store')).canvasStore
    const snap = cs.get()
    expect(snap.canvases.length).toBe(1)
    expect(snap.canvases[0]?.name).toBe('default canvas')
  })
})

describe('canvasStore — quota exceeded', () => {
  it('persists without throwing under quota simulation', () => {
    const cs = canvasStore
    // Stub setItem after first hydration to simulate quota.
    const orig = window.localStorage.setItem
    let calls = 0
    window.localStorage.setItem = function (...args: Parameters<typeof orig>) {
      if (calls++ < 2) return orig.apply(this, args) // let initial hydrations pass
      throw new Error('QuotaExceededError') // simulate quota for a persist
    }
    try {
      // This persist will be swallowed — no throw.
      expect(() => cs.create('x')).not.toThrow()
      // The canvas still exists in-memory.
      expect(cs.get().canvases.some((c) => c.name === 'x')).toBe(true)
    } finally {
      window.localStorage.setItem = orig
    }
  })
})
