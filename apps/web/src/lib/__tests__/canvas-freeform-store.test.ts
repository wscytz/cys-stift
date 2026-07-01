import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CanvasId } from '@cys-stift/domain'
import type { CanvasElement } from '@cys-stift/canvas-engine'

// ── Helpers ─────────────────────────────────────────────────────────────────

const CANVAS_A = 'canvas-a' as unknown as CanvasId
const CANVAS_B = 'canvas-b' as unknown as CanvasId

function textEl(id: string, text = 'hi'): CanvasElement {
  return { id, kind: 'text', x: 10, y: 20, w: 40, h: 18, rotation: 0, text, color: 'black' }
}
function freedrawEl(id: string): CanvasElement {
  return {
    id,
    kind: 'freedraw',
    x: 0,
    y: 0,
    w: 30,
    h: 30,
    rotation: 0,
    meta: { points: [[0, 0], [10, 10], [30, 30]] },
  }
}
function cardEl(id: string): CanvasElement {
  return { id, kind: 'card', x: 5, y: 5, w: 240, h: 120, rotation: 0 }
}

// ── Fake OPFS utilities (mirrors canvas-snapshot-store.test.ts) ──────────────

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
        if (content === undefined) throw new Error('NotFound')
        return new File([content], name)
      },
    }
  }
  function getDH(): any {
    return { getDirectoryHandle: getDH, getFileHandle: getFH, removeEntry }
  }
  async function removeEntry(name: string) {
    files.delete(name)
  }
  return {
    files,
    async getDirectory(): Promise<any> {
      return {
        async getDirectoryHandle() {
          return { getFileHandle: getFH, getDirectoryHandle: getDH, removeEntry }
        },
      }
    },
  }
}

function installOpfsMock() {
  const mock = createMockOpfs()
  vi.stubGlobal('navigator', { ...navigator, storage: mock })
  return mock
}

/** Force OPFS unavailable so the store falls back to localStorage. */
function installNoOpfs() {
  vi.stubGlobal('navigator', { ...navigator, storage: undefined })
}

// ── Module under test (re-imported per test for clean module state) ──────────

let store: typeof import('../canvas-freeform-store').canvasFreeformStore
let onQuotaExceeded: typeof import('../canvas-freeform-store').onQuotaExceeded
let subscribeFreeformChanges: typeof import('../canvas-freeform-store').subscribeFreeformChanges
let getFreeformVersion: typeof import('../canvas-freeform-store').getFreeformVersion

beforeEach(async () => {
  vi.resetModules()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  const mod = await import('../canvas-freeform-store')
  store = mod.canvasFreeformStore
  onQuotaExceeded = mod.onQuotaExceeded
  subscribeFreeformChanges = mod.subscribeFreeformChanges
  getFreeformVersion = mod.getFreeformVersion
})

describe('canvasFreeformStore — OPFS primary path', () => {
  beforeEach(() => {
    installOpfsMock()
  })

  it('round-trips text + freedraw through save → load', async () => {
    const els = [textEl('t1', 'hello 你好'), freedrawEl('f1')]
    await store.save(CANVAS_A, els)
    const loaded = await store.load(CANVAS_A)
    expect(loaded?.elements).toEqual(els)
  })

  it('drops card elements on save (DB is the source of truth for cards)', async () => {
    await store.save(CANVAS_A, [cardEl('c1'), textEl('t1')])
    const loaded = await store.load(CANVAS_A)
    expect(loaded?.elements.map((e) => e.id)).toEqual(['t1'])
    expect(loaded?.elements.some((e) => e.kind === 'card')).toBe(false)
  })

  it('isolates per-canvas (A does not leak into B)', async () => {
    await store.save(CANVAS_A, [textEl('a', 'in-a')])
    await store.save(CANVAS_B, [textEl('b', 'in-b')])
    const a = await store.load(CANVAS_A)
    const b = await store.load(CANVAS_B)
    expect(a?.elements.map((e) => e.text)).toEqual(['in-a'])
    expect(b?.elements.map((e) => e.text)).toEqual(['in-b'])
  })

  it('load returns null when nothing was ever saved', async () => {
    expect(await store.load(CANVAS_A)).toBeNull()
  })

  it('remove deletes a saved snapshot', async () => {
    await store.save(CANVAS_A, [textEl('t1')])
    expect(await store.load(CANVAS_A)).not.toBeNull()
    await store.remove(CANVAS_A)
    expect(await store.load(CANVAS_A)).toBeNull()
  })

  it('saving an all-card list persists an empty element list', async () => {
    await store.save(CANVAS_A, [cardEl('c1'), cardEl('c2')])
    const loaded = await store.load(CANVAS_A)
    expect(loaded?.elements).toEqual([])
  })
})

describe('canvasFreeformStore — localStorage fallback', () => {
  beforeEach(() => {
    installNoOpfs()
  })

  it('round-trips through localStorage when OPFS is unavailable', async () => {
    const els = [textEl('t1'), freedrawEl('f1')]
    await store.save(CANVAS_A, els)
    const loaded = await store.load(CANVAS_A)
    expect(loaded?.elements).toEqual(els)
  })

  it('writes under the freeform localStorage key', async () => {
    await store.save(CANVAS_A, [textEl('t1')])
    const raw = window.localStorage.getItem('cys-stift.canvas-freeform.canvas-a.v1')
    expect(raw).toBeTruthy()
  })

  it('returns null on corrupt JSON, does not throw', async () => {
    window.localStorage.setItem('cys-stift.canvas-freeform.canvas-a.v1', '{not json')
    expect(await store.load(CANVAS_A)).toBeNull()
  })

  it('returns null when elements is not an array (bad payload shape)', async () => {
    window.localStorage.setItem(
      'cys-stift.canvas-freeform.canvas-a.v1',
      JSON.stringify({ v: 1, app: 'cys-stift', elements: 'nope' }),
    )
    expect(await store.load(CANVAS_A)).toBeNull()
  })

  it('remove clears the localStorage entry', async () => {
    await store.save(CANVAS_A, [textEl('t1')])
    await store.remove(CANVAS_A)
    expect(window.localStorage.getItem('cys-stift.canvas-freeform.canvas-a.v1')).toBeNull()
  })
})

describe('canvasFreeformStore — legacy cleanup', () => {
  beforeEach(() => {
    installNoOpfs()
  })

  it('remove also clears the legacy tldraw snapshot localStorage key', async () => {
    // Simulate a leftover pre-self-built tldraw snapshot for this canvas.
    window.localStorage.setItem(
      'cys-stift.canvas.canvas-a.v1',
      JSON.stringify({ document: {}, session: {} }),
    )
    await store.remove(CANVAS_A)
    expect(window.localStorage.getItem('cys-stift.canvas.canvas-a.v1')).toBeNull()
  })
})

describe('canvasFreeformStore — SSR safety', () => {
  it('load returns null and save/remove are no-ops when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrStore = (await import('../canvas-freeform-store')).canvasFreeformStore
      expect(await ssrStore.load(CANVAS_A)).toBeNull()
      await expect(ssrStore.save(CANVAS_A, [textEl('t1')])).resolves.not.toThrow()
      await expect(ssrStore.remove(CANVAS_A)).resolves.not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })
})

describe('canvasFreeformStore.save — quota failure', () => {
  beforeEach(() => {
    // Force OPFS unavailable so save falls through to lsSave (which we mock).
    installNoOpfs()
  })

  it('returns false and notifies subscribers when localStorage.setItem throws', async () => {
    // jsdom 的 localStorage.setItem 是 Storage.prototype 上的不可写属性,
    // vi.spyOn(window.localStorage, 'setItem') 无法拦截 —— 必须.spyOn
    // Storage.prototype.setItem(镜像 db-client.test.ts 的配额测试)。
    const quotaErr = new DOMException('quota exceeded', 'QuotaExceededError')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaErr
    })
    let fired = false
    const unsub = onQuotaExceeded(() => {
      fired = true
    })

    const ok = await store.save(CANVAS_A, [textEl('t1')])
    expect(ok).toBe(false)
    expect(fired).toBe(true)
    unsub()
    vi.restoreAllMocks()
  })

  it('returns true on success', async () => {
    const ok = await store.save(CANVAS_B, [textEl('t2')])
    expect(ok).toBe(true)
  })
})

// ── 内容变更订阅(2026-07-01:图谱加关系实时刷新的根因修复)──────────────────
// relation-builder 写关系箭头 → store.save → notifyChange → useGlobalEdges 重聚合。
// 此前 freeform 写入无通知通道,读取方只靠 canvas 列表变或重挂载 → 要切页面才看到。

describe('canvasFreeformStore — 内容变更订阅', () => {
  it('初始 version 为 0', () => {
    expect(getFreeformVersion()).toBe(0)
  })

  it('save 成功后 version 递增 + 触发订阅回调', async () => {
    const cb = vi.fn()
    const unsub = subscribeFreeformChanges(cb)
    const before = getFreeformVersion()
    await store.save(CANVAS_A, [textEl('t1')])
    expect(getFreeformVersion()).toBe(before + 1)
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('remove 后 version 递增 + 触发回调', async () => {
    await store.save(CANVAS_A, [textEl('t1')])
    const cb = vi.fn()
    const unsub = subscribeFreeformChanges(cb)
    const before = getFreeformVersion()
    await store.remove(CANVAS_A)
    expect(getFreeformVersion()).toBe(before + 1)
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('多次 save 每次都递增(不合并)', async () => {
    const cb = vi.fn()
    subscribeFreeformChanges(cb)
    await store.save(CANVAS_A, [textEl('t1')])
    await store.save(CANVAS_A, [textEl('t1'), textEl('t2')])
    await store.save(CANVAS_A, [textEl('t3')])
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('取消订阅后不再收到回调', async () => {
    const cb = vi.fn()
    const unsub = subscribeFreeformChanges(cb)
    unsub()
    await store.save(CANVAS_A, [textEl('t1')])
    expect(cb).not.toHaveBeenCalled()
  })

  it('配额失败(save 返回 false)不递增 version、不触发回调', async () => {
    // localStorage 抛错 → lsSave 返回 false + 触发 quota 订阅,但内容没写成 → 不 notifyChange。
    const cb = vi.fn()
    subscribeFreeformChanges(cb)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    // OPFS 在 jsdom 不可用 → 走 localStorage 回退路径 → 抛 → save 返回 false。
    const ok = await store.save(CANVAS_A, [textEl('t1')])
    expect(ok).toBe(false)
    expect(cb).not.toHaveBeenCalled()
    expect(getFreeformVersion()).toBe(0)
    vi.restoreAllMocks()
  })
})
