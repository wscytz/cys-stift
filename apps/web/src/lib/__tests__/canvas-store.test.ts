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

// Bug 1 回归(2026-06-26):配额失败后,persist() 内部的 notify 让订阅者先看到
// 失败的 newSnap,随后 _snap 被恢复成 prev,但若不再 notify,useSyncExternalStore
// 订阅者就永远不会重新读取 → UI 卡在失败的改动上(画布「看似创建/改名/删除成功」
// 直到下一次无关改动才纠正)。修复:回滚决策之后无条件再 notify 一次,使最后一次
// 订阅者可见的快照 = prev。这里注册真实订阅者,捕获每次 notify 时的 getSnapshot(),
// 断言最后一次捕获的快照就是回滚后的 prev。
// P1 (2026-06-28) 回归:首次 hydrate 必须把 seed 落地到 localStorage。
// 此前 hydrateOnce 只 loadSnapshot()+notify(),不 persist —— 用户未改过画布
// (create/rename/setActive/delete 才 persist)时 localStorage 无 canvases.v1,
// export-service 读不到 canvases 列表 → freeform 几何(手绘/箭头/text/rect/frame)
// 全部不进导出,canvases 列表也丢,备份不完整(核心卖点受损)。
describe('canvasStore — hydrateOnce persists seed (P1 export bug)', () => {
  it('writes canvases.v1 after first hydrate so export can read it', async () => {
    expect(window.localStorage.getItem('cys-stift.canvases.v1')).toBeNull()
    // 触发 hydrate(get() 内部首调 hydrateOnce)。
    canvasStore.get()
    expect(window.localStorage.getItem('cys-stift.canvases.v1')).not.toBeNull()
  })

  it('persisted seed is valid JSON wrapping a snapshot with the default canvas', async () => {
    canvasStore.get()
    const raw = window.localStorage.getItem('cys-stift.canvases.v1')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as { snapshot: { canvases: Array<{ name: string }>; activeCanvasId: string } }
    expect(parsed.snapshot.canvases.length).toBeGreaterThanOrEqual(1)
    expect(parsed.snapshot.canvases.some((c) => c.name === 'default canvas')).toBe(true)
  })

  it('hydrate persistence is idempotent — calling get() twice writes once-stable seed', async () => {
    canvasStore.get()
    const afterFirst = window.localStorage.getItem('cys-stift.canvases.v1')
    canvasStore.get()
    const afterSecond = window.localStorage.getItem('cys-stift.canvases.v1')
    expect(afterFirst).not.toBeNull()
    expect(afterFirst).toBe(afterSecond)
  })
})

describe('canvasStore — quota rollback is subscriber-visible (Bug 1)', () => {
  let cs: typeof import('../canvas-store').canvasStore
  let subscribe: typeof import('../canvas-store').subscribe
  let getSnapshot: typeof import('../canvas-store').getSnapshot

  beforeEach(async () => {
    vi.resetModules()
    window.localStorage.clear()
    cs = (await import('../canvas-store')).canvasStore
    subscribe = (await import('../canvas-store')).subscribe
    getSnapshot = (await import('../canvas-store')).getSnapshot
  })

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

  /** Register a subscriber that records the snapshot it sees on each notify. */
  function recordSeen() {
    const seen: ReturnType<typeof getSnapshot>[] = []
    const unsub = subscribe(() => seen.push(getSnapshot()))
    return { seen, unsub }
  }

  it('create rollback: last snapshot seen by subscribers is the pre-mutation state', () => {
    cs.get() // force hydration so the snapshot ref is stable from here on
    const beforeMutation = getSnapshot()
    const { seen, unsub } = recordSeen()
    const restore = throwOnSetItem()
    try {
      const id = cs.create('doomed')
      unsub()
      expect(id).toBe('')
      // The subscriber MUST have been notified after the rollback, and the
      // last snapshot it observed must equal the pre-mutation state (no
      // orphan "doomed" canvas visible to the UI).
      expect(seen.length).toBeGreaterThanOrEqual(1)
      const last = seen[seen.length - 1]!
      expect(last).toBe(beforeMutation)
      expect(last.canvases.some((c) => c.name === 'doomed')).toBe(false)
    } finally {
      restore()
    }
  })

  it('rename rollback: last snapshot seen by subscribers has the original name', () => {
    const id = cs.create('original')
    const { seen, unsub } = recordSeen()
    const restore = throwOnSetItem()
    try {
      cs.rename(id, 'renamed')
      unsub()
      const last = seen[seen.length - 1]!
      expect(last.canvases.find((c) => c.id === id)?.name).toBe('original')
    } finally {
      restore()
    }
  })

  it('delete rollback: last snapshot seen by subscribers still contains the canvas', () => {
    const id = cs.create('temp')
    const { seen, unsub } = recordSeen()
    const restore = throwOnSetItem()
    try {
      const result = cs.delete(id)
      unsub()
      expect(result).toBe(false)
      const last = seen[seen.length - 1]!
      expect(last.canvases.some((c) => c.id === id)).toBe(true)
    } finally {
      restore()
    }
  })

  it('setActive rollback: last snapshot seen by subscribers keeps the pre-switch active id', () => {
    const defaultId = cs.get().activeCanvasId
    const b = cs.create('second') // succeeds; active is now b
    const { seen, unsub } = recordSeen()
    const restore = throwOnSetItem()
    try {
      cs.setActive(defaultId) // persist fails → rollback to b
      unsub()
      const last = seen[seen.length - 1]!
      expect(last.activeCanvasId).toBe(b)
    } finally {
      restore()
    }
  })

  it('successful mutation notifies subscribers exactly once (no render loop)', () => {
    cs.get() // force hydration first (hydrate's own notify must not count here)
    const { seen, unsub } = recordSeen()
    cs.create('happy')
    unsub()
    // Exactly one notify for one successful create.
    expect(seen.length).toBe(1)
    expect(seen[0]!.canvases.some((c) => c.name === 'happy')).toBe(true)
  })
})

// P3 (2026-06-28): 跨 tab storage 同步。多 tab 场景下,Tab A 新建画布写
// 'cys-stift.canvases.v1',storage 事件在 Tab B(其它 tab)触发。此前
// canvas-store 不监听 storage → Tab B 看不到新画布,直到手动 reload。
// 修法镜像 db-client 的 cards.v1 监听:key === STORAGE_KEY 时重新 loadSnapshot
// 并 notify。storage 事件本 tab 不触发(只其它 tab),所以不与 persist 循环。
describe('cross-tab storage sync', () => {
  it('reloads snapshot + notifies when canvases.v1 changes', async () => {
    vi.resetModules()
    window.localStorage.clear()
    const mod = await import('../canvas-store')
    const canvasStore = mod.canvasStore
    const subscribe = mod.subscribe
    // 先 hydrate 一次,让初始 seed 稳定 + _hydrated=true(否则监听里 loadSnapshot
    // 跑了也覆盖不了 get() 没调过的场景)。
    canvasStore.get()
    const calls: number[] = []
    const unsub = subscribe(() => calls.push(1))
    // 模拟其它 tab 写了 canvases.v1(新增画布 c2)。snapshot 结构对齐 saveSnapshot:
    // 外层 { snapshot: CanvasesSnapshot },CanvasesSnapshot = { canvases, activeCanvasId }。
    // isSnapshot 校验每个 canvas 必须有 id/workspaceId/name/view/createdAt/updatedAt,
    // 所以用完整合法对象构造。
    const existing = canvasStore.get().canvases
    const otherTab = JSON.stringify({
      snapshot: {
        canvases: [
          ...existing,
          {
            id: 'canvas-c2',
            workspaceId: existing[0]!.workspaceId,
            name: 'other',
            view: existing[0]!.view,
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
          },
        ],
        activeCanvasId: 'canvas-c2',
      },
    })
    window.localStorage.setItem('cys-stift.canvases.v1', otherTab)
    // storage 事件只是「localStorage 已被其它 tab 改了」的信号(浏览器在写的同时
    // 触发);监听器靠 loadSnapshot() 重新读 localStorage。这里 setItem 模拟
    // 「localStorage 已更新」,dispatchEvent 模拟「本 tab 收到通知」。
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'cys-stift.canvases.v1',
        newValue: otherTab,
      }),
    )
    const snap = canvasStore.get()
    expect(snap.canvases.some((c) => c.id === 'canvas-c2')).toBe(true)
    expect(calls.length).toBeGreaterThan(0)
    unsub()
  })

  it('ignores storage events for other keys', async () => {
    vi.resetModules()
    window.localStorage.clear()
    const mod = await import('../canvas-store')
    const canvasStore = mod.canvasStore
    const subscribe = mod.subscribe
    canvasStore.get()
    const calls: number[] = []
    const unsub = subscribe(() => calls.push(1))
    const before = calls.length
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'other-key', newValue: 'x' }),
    )
    expect(calls.length).toBe(before)
    unsub()
  })
})
