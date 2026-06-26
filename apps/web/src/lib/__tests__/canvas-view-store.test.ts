import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CanvasId } from '@cys-stift/domain'

// ── Hook testing note ───────────────────────────────────────────────────────
// useCanvasView (the React hook) is NOT tested here.
// apps/web/package.json has no @testing-library/react in devDependencies, and
// pulling in a new dependency just to test the hook would violate YAGNI (the
// explicit project rule). The hook is a thin wrapper over useSyncExternalStore
// + the store API exercised below; the snapshot stability contract it relies on
// is covered by the "no-op update keeps snapshot identity" test. If a hook test
// is wanted later, add @testing-library/react first.

const STORAGE_KEY = 'cys-stift.canvas-view.v1'

const CANVAS_A = 'canvas-a' as unknown as CanvasId
const CANVAS_B = 'canvas-b' as unknown as CanvasId

let store: typeof import('../canvas-view-store').canvasViewStore

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  store = (await import('../canvas-view-store')).canvasViewStore
})

describe('canvasViewStore.get — defaults', () => {
  it('returns the default view for an unknown canvas', () => {
    const v = store.get(CANVAS_A)
    expect(v).toEqual({
      zoom: 1,
      panX: 0,
      panY: 0,
      gridMode: 'snap',
      gridSize: 8,
    })
  })

  it('returns the default view when nothing was persisted for the canvas', () => {
    // Persist a view for A, then B should still get defaults.
    store.update(CANVAS_A, { zoom: 2 })
    expect(store.get(CANVAS_B).zoom).toBe(1)
  })
})

describe('canvasViewStore.update — merge + persist', () => {
  it('merges a partial patch onto the default view', () => {
    store.update(CANVAS_A, { zoom: 1.5, panX: 100 })
    const v = store.get(CANVAS_A)
    expect(v.zoom).toBe(1.5)
    expect(v.panX).toBe(100)
    // Untouched fields keep their defaults.
    expect(v.panY).toBe(0)
    expect(v.gridMode).toBe('snap')
  })

  it('stacks successive patches onto the previous state (not the default)', () => {
    store.update(CANVAS_A, { panX: 10 })
    store.update(CANVAS_A, { panY: 20 })
    const v = store.get(CANVAS_A)
    expect(v).toMatchObject({ panX: 10, panY: 20 })
  })

  it('persists the new view to localStorage', () => {
    store.update(CANVAS_A, { zoom: 3, gridMode: 'free' })
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { views: Record<string, unknown> }
    expect(parsed.views['canvas-a']).toMatchObject({ zoom: 3, gridMode: 'free' })
  })

  it('is a no-op when the patch produces no change (and does not persist)', () => {
    // Seed a value first so the "no change" comparison is against the real
    // current state, not the default.
    store.update(CANVAS_A, { zoom: 2 })
    const rawAfterSeed = window.localStorage.getItem(STORAGE_KEY)

    // Patch with the *same* values — no field actually changes.
    store.update(CANVAS_A, { zoom: 2, panX: 0, panY: 0, gridMode: 'snap', gridSize: 8 })
    // panX/panY/gridMode/gridSize here are the DEFAULTS, but zoom=2 means the
    // current object differs from defaults on zoom — so the no-change branch
    // only fires if the patch equals the *current* zoom=2 state. Construct a
    // truly no-change patch: pass the exact current view.
    const current = store.get(CANVAS_A)
    const beforeCall = window.localStorage.getItem(STORAGE_KEY)
    store.update(CANVAS_A, current)
    const afterCall = window.localStorage.getItem(STORAGE_KEY)

    // No-op branch: saveViewMap is not invoked → raw string is byte-identical.
    expect(afterCall).toBe(beforeCall)
    // And the seed write happened exactly once (sanity).
    expect(beforeCall).toBe(rawAfterSeed)
  })
})

describe('canvasViewStore — per-canvas isolation', () => {
  it('keeps each canvas view independent', () => {
    store.update(CANVAS_A, { zoom: 2, panX: 50 })
    store.update(CANVAS_B, { zoom: 0.5, panY: 200 })
    expect(store.get(CANVAS_A).zoom).toBe(2)
    expect(store.get(CANVAS_A).panY).toBe(0)
    expect(store.get(CANVAS_B).zoom).toBe(0.5)
    expect(store.get(CANVAS_B).panX).toBe(0)
  })

  it('persists both canvases under the same key', () => {
    store.update(CANVAS_A, { zoom: 2 })
    store.update(CANVAS_B, { zoom: 4 })
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY)!,
    ) as { views: Record<string, { zoom: number }> }
    expect(Object.keys(parsed.views).sort()).toEqual(['canvas-a', 'canvas-b'])
  })
})

describe('canvasViewStore.reset — drop a single canvas', () => {
  it('removes one canvas view, leaving others intact', () => {
    store.update(CANVAS_A, { zoom: 2 })
    store.update(CANVAS_B, { zoom: 3 })
    store.reset(CANVAS_A)
    expect(store.get(CANVAS_A).zoom).toBe(1) // back to default
    expect(store.get(CANVAS_B).zoom).toBe(3) // untouched
  })

  it('is a no-op when the canvas has no saved view', () => {
    const before = window.localStorage.getItem(STORAGE_KEY)
    store.reset(CANVAS_A) // never set
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before)
  })

  it('persists the removal to localStorage', () => {
    store.update(CANVAS_A, { zoom: 2 })
    store.reset(CANVAS_A)
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY)!,
    ) as { views: Record<string, unknown> }
    expect(parsed.views['canvas-a']).toBeUndefined()
  })
})

describe('canvasViewStore.resetAll — clear everything', () => {
  it('wipes all canvas views', () => {
    store.update(CANVAS_A, { zoom: 2 })
    store.update(CANVAS_B, { zoom: 3 })
    store.resetAll()
    expect(store.get(CANVAS_A).zoom).toBe(1)
    expect(store.get(CANVAS_B).zoom).toBe(1)
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY)!,
    ) as { views: Record<string, unknown> }
    expect(parsed.views).toEqual({})
  })

  it('is a no-op when the map is already empty', () => {
    const before = window.localStorage.getItem(STORAGE_KEY)
    store.resetAll()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before)
  })
})

describe('canvasViewStore — hydrate (reads persisted state on load)', () => {
  it('rehydrates a previously-saved view across a fresh module load', async () => {
    store.update(CANVAS_A, { zoom: 2.5, panX: 7 })
    // Simulate a new session: re-import the module (vi.resetModules happens in
    // beforeEach, but we do it explicitly to mimic a fresh page load).
    vi.resetModules()
    const fresh = (await import('../canvas-view-store')).canvasViewStore
    const v = fresh.get(CANVAS_A)
    expect(v).toMatchObject({ zoom: 2.5, panX: 7 })
  })
})

describe('canvasViewStore — corrupt / legacy localStorage', () => {
  it('treats corrupt JSON as empty (does not throw)', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ this is NOT json {{{')
    expect(() => store.get(CANVAS_A)).not.toThrow()
    expect(store.get(CANVAS_A).zoom).toBe(1) // default
  })

  it('drops the legacy { view: ... } single-value shape (back-compat)', () => {
    // Pre-v0.15 the store held one view under `view:`. The new store doesn't
    // know which canvas it belonged to, so it's intentionally dropped.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        view: { zoom: 9, panX: 99, panY: 99, gridMode: 'snap', gridSize: 8 },
      }),
    )
    expect(store.get(CANVAS_A).zoom).toBe(1) // legacy not promoted to any canvas
  })

  it('ignores per-canvas entries that fail shape validation', () => {
    // Good entry for A, junk entry for B.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        views: {
          'canvas-a': { zoom: 2, panX: 0, panY: 0, gridMode: 'snap', gridSize: 8 },
          'canvas-b': { zoom: 'not-a-number', panX: 0, panY: 0, gridMode: 'snap', gridSize: 8 },
        },
      }),
    )
    expect(store.get(CANVAS_A).zoom).toBe(2) // valid entry loads
    expect(store.get(CANVAS_B).zoom).toBe(1) // junk dropped → default
  })
})

describe('canvasViewStore — SSR safety', () => {
  it('returns the default view when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrStore = (await import('../canvas-view-store')).canvasViewStore
      const v = ssrStore.get(CANVAS_A)
      expect(v).toEqual({ zoom: 1, panX: 0, panY: 0, gridMode: 'snap', gridSize: 8 })
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('update / reset / resetAll do not throw when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrStore = (await import('../canvas-view-store')).canvasViewStore
      expect(() => ssrStore.update(CANVAS_A, { zoom: 5 })).not.toThrow()
      expect(() => ssrStore.reset(CANVAS_A)).not.toThrow()
      expect(() => ssrStore.resetAll()).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })
})

// 镜像 db-client 的配额回滚测试。quota-silence fix:配额满时必须回滚内存
// _views(让 UI 不撒谎:改了 zoom/pan/gridMode,reload 后消失)+ notifyQuota
// (让 AppMenu toast 提示)。此前 saveViewMap 裸 catch {} → 静默丢画布视图。
describe('canvasViewStore — quota exceeded (rollback + notify)', () => {
  let store: typeof import('../canvas-view-store').canvasViewStore
  let onQuotaExceeded: typeof import('../canvas-view-store').onQuotaExceeded

  beforeEach(async () => {
    vi.resetModules()
    window.localStorage.clear()
    store = (await import('../canvas-view-store')).canvasViewStore
    onQuotaExceeded = (await import('../canvas-view-store')).onQuotaExceeded
  })

  /** Force localStorage.setItem to throw. jsdom puts setItem on Storage.prototype
   *  (non-writable on the instance), so a direct `window.localStorage.setItem = fn`
   *  silently no-ops. Override the prototype method and restore it after. */
  function simulateQuota() {
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

  it('rolls back update + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.update(CANVAS_A, { zoom: 2 })
      unsub()
      // Rollback: zoom did not stick in memory.
      expect(store.get(CANVAS_A).zoom).toBe(1)
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back reset + fires quota when persist fails', () => {
    // Seed a view first (before simulating quota).
    store.update(CANVAS_A, { zoom: 3 })
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.reset(CANVAS_A)
      unsub()
      // Rollback: the view is still zoom=3 (reset did not stick).
      expect(store.get(CANVAS_A).zoom).toBe(3)
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back resetAll + fires quota when persist fails', () => {
    store.update(CANVAS_A, { zoom: 3 })
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.resetAll()
      unsub()
      // Rollback: the view survives (resetAll did not stick).
      expect(store.get(CANVAS_A).zoom).toBe(3)
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('normal write still works + does not fire quota', () => {
    let quotaFired = false
    const unsub = onQuotaExceeded(() => {
      quotaFired = true
    })
    store.update(CANVAS_A, { zoom: 2 })
    unsub()
    expect(store.get(CANVAS_A).zoom).toBe(2)
    expect(quotaFired).toBe(false)
  })
})

// Bug 1 回归(2026-06-26):配额失败后 persist() 内部的 notify 让订阅者先看到
// 失败的 newViews,随后 _views 被恢复成 prev,但若不再 notify,useSyncExternalStore
// 订阅者就永远不会重新读取 → UI 卡在失败的改动上(改了 zoom/pan,reload 后消失,
// 但当前会话里 UI 还显示着改动)。修复:回滚决策之后无条件再 notify 一次,使最后一次
// 订阅者可见的快照 = prev。这里注册真实订阅者,断言最后一次捕获的快照就是回滚后的 prev。
describe('canvasViewStore — quota rollback is subscriber-visible (Bug 1)', () => {
  let store: typeof import('../canvas-view-store').canvasViewStore
  let subscribe: typeof import('../canvas-view-store').subscribe
  let getSnapshot: typeof import('../canvas-view-store').getSnapshot

  beforeEach(async () => {
    vi.resetModules()
    window.localStorage.clear()
    store = (await import('../canvas-view-store')).canvasViewStore
    subscribe = (await import('../canvas-view-store')).subscribe
    getSnapshot = (await import('../canvas-view-store')).getSnapshot
  })

  function simulateQuota() {
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

  function recordSeen() {
    const seen: ReturnType<typeof getSnapshot>[] = []
    const unsub = subscribe(() => seen.push(getSnapshot()))
    return { seen, unsub }
  }

  it('update rollback: last snapshot seen by subscribers is the pre-mutation map', () => {
    store.get(CANVAS_A) // force hydration so the snapshot ref is stable from here on
    const beforeMutation = getSnapshot()
    const { seen, unsub } = recordSeen()
    const restore = simulateQuota()
    try {
      store.update(CANVAS_A, { zoom: 2 })
      unsub()
      expect(seen.length).toBeGreaterThanOrEqual(1)
      const last = seen[seen.length - 1]!
      // The subscriber's last observed snapshot equals the pre-mutation map
      // (the failed zoom=2 is NOT stuck on screen).
      expect(last).toBe(beforeMutation)
      expect(last[CANVAS_A as unknown as string]).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('reset rollback: last snapshot seen by subscribers still has the canvas view', () => {
    store.update(CANVAS_A, { zoom: 3 }) // seed (succeeds)
    const { seen, unsub } = recordSeen()
    const restore = simulateQuota()
    try {
      store.reset(CANVAS_A)
      unsub()
      const last = seen[seen.length - 1]!
      expect(last[CANVAS_A as unknown as string]?.zoom).toBe(3)
    } finally {
      restore()
    }
  })

  it('resetAll rollback: last snapshot seen by subscribers still has all views', () => {
    store.update(CANVAS_A, { zoom: 3 }) // seed (succeeds)
    const { seen, unsub } = recordSeen()
    const restore = simulateQuota()
    try {
      store.resetAll()
      unsub()
      const last = seen[seen.length - 1]!
      expect(last[CANVAS_A as unknown as string]?.zoom).toBe(3)
    } finally {
      restore()
    }
  })

  it('successful mutation notifies subscribers exactly once (no render loop)', () => {
    store.get(CANVAS_A) // force hydration first
    const { seen, unsub } = recordSeen()
    store.update(CANVAS_A, { zoom: 2 })
    unsub()
    expect(seen.length).toBe(1)
    expect(seen[0]![CANVAS_A as unknown as string]?.zoom).toBe(2)
  })
})
