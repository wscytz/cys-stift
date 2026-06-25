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
  // 镜像 db-client 的配额回滚测试。quota-silence fix:配额满时必须回滚内存
  // _snap(让 UI 不撒谎:创建/改名/删除看似成功,reload 后消失)+ notifyQuota
  // (让 AppMenu toast 提示)。此前 saveSnapshot 裸 catch {} → 静默丢画布。
  let onQuotaExceeded: typeof import('../canvas-store').onQuotaExceeded

  beforeEach(async () => {
    onQuotaExceeded = (await import('../canvas-store')).onQuotaExceeded
  })

  /** Force localStorage.setItem to throw. jsdom puts setItem on Storage.prototype
   *  (non-writable on the instance), so a direct `window.localStorage.setItem = fn`
   *  silently no-ops — override the prototype method and restore it after. */
  function throwOnSetItem() {
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    })
    return () => {
      if (orig) Object.defineProperty(Storage.prototype, 'setItem', orig)
    }
  }

  it('rolls back create + fires quota when persist fails (no orphan canvas)', () => {
    const cs = canvasStore
    const restore = throwOnSetItem()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      const id = cs.create('doomed')
      unsub()
      // create returned empty string (rollback path signals failure).
      expect(id).toBe('')
      // Rollback: the canvas is NOT in memory (UI does not lie).
      expect(cs.get().canvases.some((c) => c.name === 'doomed')).toBe(false)
      // Quota pub-sub fired so the toast can warn the user.
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back rename + fires quota when persist fails', () => {
    const cs = canvasStore
    const id = cs.create('original') // succeeds (quota not yet simulated)
    const restore = throwOnSetItem()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      cs.rename(id, 'renamed')
      unsub()
      // Rollback: rename did not stick in memory.
      expect(cs.get().canvases.find((c) => c.id === id)?.name).toBe('original')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back delete + fires quota when persist fails (no silent data loss)', () => {
    const cs = canvasStore
    const id = cs.create('temp') // succeeds
    const restore = throwOnSetItem()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      const result = cs.delete(id)
      unsub()
      // delete reported failure (rolled back).
      expect(result).toBe(false)
      // Rollback: the canvas is still in memory.
      expect(cs.get().canvases.some((c) => c.id === id)).toBe(true)
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back setActive + fires quota when persist fails', () => {
    const cs = canvasStore
    const defaultId = cs.get().activeCanvasId
    const b = cs.create('second') // succeeds; now active is b
    const restore = throwOnSetItem()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      cs.setActive(defaultId) // would switch back, but persist fails
      unsub()
      // Rollback: active is still b (the failed switch did not stick).
      expect(cs.get().activeCanvasId).toBe(b)
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('normal write still works + notifies subscribers (no false quota)', () => {
    const cs = canvasStore
    let quotaFired = false
    const unsub = onQuotaExceeded(() => {
      quotaFired = true
    })
    cs.create('happy-path')
    unsub()
    expect(cs.get().canvases.some((c) => c.name === 'happy-path')).toBe(true)
    expect(quotaFired).toBe(false)
  })
})
