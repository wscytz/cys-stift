import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import {
  bindCardLayoutAnchorPersistence,
  clearLayoutAnchorOnUserGeometryChange,
  collectCardLayoutAnchors,
  loadCardLayoutAnchors,
  saveCardLayoutAnchors,
  withLayoutAnchorPreserved,
} from '../card-layout-anchor-store'

const card = (id: string, extra: Partial<CanvasElement> = {}): CanvasElement => ({
  id,
  kind: 'card',
  x: 0,
  y: 0,
  w: 240,
  h: 120,
  rotation: 0,
  ...extra,
})

const storedAnchor = { id: 't', dir: 'right-of' as const, gap: 20 }

/** 绑定后统一回收:失败测试也不会把 pagehide/visibility 监听泄漏给后续用例。 */
const activeUnbinds: Array<() => void> = []
const bind = (host: CanvasHost, canvasId = 'c1', debounceMs = 300): (() => void) => {
  const unbind = bindCardLayoutAnchorPersistence(host, canvasId, debounceMs)
  activeUnbinds.push(unbind)
  return unbind
}

/** jsdom 的 visibilityState 是 prototype getter,实例级覆盖后 delete 即可还原。 */
const setVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

/** 只用 onUserChange 的最小 host:对齐 CanvasHost 的可选 onElementsChange 契约。 */
const withoutElementsChange = (inner: InMemoryCanvasHost): CanvasHost => ({
  getElements: () => inner.getElements(),
  getElement: (id) => inner.getElement(id),
  getSelectedIds: () => inner.getSelectedIds(),
  setSelectedIds: (ids) => inner.setSelectedIds(ids),
  upsert: (el) => inner.upsert(el),
  remove: (id) => inner.remove(id),
  batch: (fn) => inner.batch(fn),
  applyWithoutEcho: (fn) => inner.applyWithoutEcho(fn),
  onUserChange: (cb) => inner.onUserChange(cb),
  onSelectionChange: (cb) => inner.onSelectionChange(cb),
  getView: () => inner.getView(),
  setView: (v) => inner.setView(v),
  onViewChange: (cb) => inner.onViewChange(cb),
})

describe('card-layout-anchor-store', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    for (const unbind of activeUnbinds.splice(0)) unbind()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (document as unknown as Record<string, unknown>).visibilityState
  })

  it('collects only valid anchors from card elements', () => {
    const anchors = collectCardLayoutAnchors([
      card('a', { meta: { layoutAnchor: { id: 'b', dir: 'right-of', gap: 20 } } }),
      card('c', { meta: { layoutAnchor: { id: 'd', dir: 'nope', gap: 20 } } }),
      { id: 't', kind: 'text', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
    ])
    expect(anchors).toEqual({ a: { id: 'b', dir: 'right-of', gap: 20 } })
  })

  it('save/load round-trips and drops invalid entries', () => {
    saveCardLayoutAnchors('c1', { a: { id: 'b', dir: 'below', gap: 12 } })
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: { id: 'b', dir: 'below', gap: 12 } })

    window.localStorage.setItem(
      'cys-stift.card-anchors.c1',
      JSON.stringify({
        a: { id: 'b', dir: 'bad', gap: 1 },
        c: { id: 'd', dir: 'right-of', gap: 8 },
        'bad id!': { id: 'e', dir: 'right-of', gap: 1 },
      }),
    )
    expect(loadCardLayoutAnchors('c1')).toEqual({ c: { id: 'd', dir: 'right-of', gap: 8 } })
  })

  it('treats malformed or non-object sidecars as empty', () => {
    window.localStorage.setItem('cys-stift.card-anchors.c1', '{not json')
    expect(loadCardLayoutAnchors('c1')).toEqual({})
    window.localStorage.setItem('cys-stift.card-anchors.c1', '[]')
    expect(loadCardLayoutAnchors('c1')).toEqual({})
    window.localStorage.setItem('cys-stift.card-anchors.c1', 'null')
    expect(loadCardLayoutAnchors('c1')).toEqual({})
  })

  it('degrades silently when localStorage throws (privacy mode / quota)', () => {
    // jsdom 的 Storage 是 proxy,实例方法不可 spy;替换全局 localStorage 才能命中
    // 代码里的 window.localStorage 读取。
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => saveCardLayoutAnchors('c1', { a: storedAnchor })).not.toThrow()
    expect(loadCardLayoutAnchors('c1')).toEqual({})

    const host = new InMemoryCanvasHost()
    host.upsert(card('a'))
    expect(() => {
      const unbind = bind(host, 'c1', 0)
      host.upsert(card('a', { meta: { layoutAnchor: storedAnchor } }))
      unbind()
    }).not.toThrow()
  })

  it('applies stored anchors to cards that appear after bind', () => {
    saveCardLayoutAnchors('c1', { a: { id: 'b', dir: 'below', gap: 10 } })
    const host = new InMemoryCanvasHost()
    bind(host, 'c1', 0)
    host.upsert(card('a'))
    expect(host.getElement('a')?.meta?.layoutAnchor).toEqual({ id: 'b', dir: 'below', gap: 10 })
  })

  it('falls back to onUserChange when the host has no onElementsChange', () => {
    saveCardLayoutAnchors('c1', { b: storedAnchor })
    const inner = new InMemoryCanvasHost()
    bind(withoutElementsChange(inner), 'c1', 60_000)
    inner.upsert(card('b'))
    expect(inner.getElement('b')?.meta?.layoutAnchor).toEqual(storedAnchor)
  })

  it('does not overwrite an anchor already present on the element', () => {
    saveCardLayoutAnchors('c1', { a: storedAnchor })
    const own = { id: 'z', dir: 'below' as const, gap: 4 }
    const host = new InMemoryCanvasHost()
    host.upsert(card('a', { meta: { layoutAnchor: own } }))
    bind(host, 'c1', 60_000)
    expect(host.getElement('a')?.meta?.layoutAnchor).toEqual(own)
  })

  it('seeding does not emit a user change (no undo/DB writeback)', () => {
    saveCardLayoutAnchors('c1', { a: storedAnchor })
    const host = new InMemoryCanvasHost()
    host.upsert(card('a'))
    let userChanges = 0
    host.onUserChange(() => {
      userChanges++
    })
    bind(host, 'c1', 60_000)
    expect(host.getElement('a')?.meta?.layoutAnchor).toEqual(storedAnchor)
    expect(userChanges).toBe(0)
  })

  it('bind merges stored anchors and flushes cleared anchors on dispose', () => {
    saveCardLayoutAnchors('c1', { a: { id: 'b', dir: 'right-of', gap: 20 } })
    const host = new InMemoryCanvasHost()
    host.upsert(card('a'))
    const unbind = bind(host, 'c1', 0)
    expect(host.getElement('a')?.meta?.layoutAnchor).toEqual({
      id: 'b',
      dir: 'right-of',
      gap: 20,
    })

    // 用户拖拽/其他路径清掉 anchor → dispose 时同步 flush 空表
    host.upsert(card('a'))
    unbind()
    expect(loadCardLayoutAnchors('c1')).toEqual({})
  })

  it('drops a disappeared card seed so a reused id does not inherit the old anchor', () => {
    saveCardLayoutAnchors('c1', { x: storedAnchor })
    const host = new InMemoryCanvasHost()
    host.upsert(card('x'))
    const unbind = bind(host, 'c1', 60_000)
    expect(host.getElement('x')?.meta?.layoutAnchor).toEqual(storedAnchor)

    // debounce 未到,localStorage 里还是旧表;内存种子必须在卡片消失时立即作废。
    host.remove('x')
    host.upsert(card('x', { x: 999, y: 999 }))
    expect(host.getElement('x')?.meta?.layoutAnchor).toBeUndefined()

    // 落盘也不该把旧锚写回去
    unbind()
    expect(loadCardLayoutAnchors('c1')).toEqual({})
  })

  it('does not resurrect a cleared anchor across reloads', () => {
    vi.useFakeTimers()
    const host = new InMemoryCanvasHost()
    host.upsert(card('a'))
    const unbind = bind(host, 'c1', 0)
    host.upsert(card('a', { meta: { layoutAnchor: storedAnchor } }))
    vi.advanceTimersByTime(0)
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: storedAnchor })
    unbind()

    // reload:新 host,卡片从 DB 水化(无 meta),sidecar 回填
    const host2 = new InMemoryCanvasHost()
    host2.upsert(card('a'))
    const unbind2 = bind(host2, 'c1', 0)
    expect(host2.getElement('a')?.meta?.layoutAnchor).toEqual(storedAnchor)

    // 用户拖拽清锚 → 落盘后再次 reload 不应复活
    host2.upsert(card('a', { x: 10, y: 10 }))
    vi.advanceTimersByTime(0)
    expect(loadCardLayoutAnchors('c1')).toEqual({})
    unbind2()

    const host3 = new InMemoryCanvasHost()
    host3.upsert(card('a'))
    bind(host3, 'c1', 0)
    expect(host3.getElement('a')?.meta?.layoutAnchor).toBeUndefined()
  })

  it('keeps the sidecar while cards hydrate late (does not flush an empty canvas)', () => {
    vi.useFakeTimers()
    saveCardLayoutAnchors('c1', { a: storedAnchor })
    const host = new InMemoryCanvasHost()
    bind(host, 'c1', 300)
    // 卡片还没 hydrate:debounce 过去也不能把 sidecar 擦成空表
    vi.advanceTimersByTime(5_000)
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: storedAnchor })

    host.upsert(card('a'))
    expect(host.getElement('a')?.meta?.layoutAnchor).toEqual(storedAnchor)
  })

  it('clears stale sidecar after all cards are deleted (N-04)', () => {
    vi.useFakeTimers()
    const host = new InMemoryCanvasHost()
    bind(host, 'c1', 300)
    host.upsert(card('a', { meta: { layoutAnchor: storedAnchor } }))
    vi.advanceTimersByTime(400)
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: storedAnchor })

    host.remove('a')
    vi.advanceTimersByTime(400)
    expect(loadCardLayoutAnchors('c1')).toEqual({})
  })

  it('unbind on an empty host does not clear the sidecar (R-11)', () => {
    saveCardLayoutAnchors('c1', { a: storedAnchor })
    const host = new InMemoryCanvasHost()
    const unbind = bind(host, 'c1', 300)
    unbind()
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: storedAnchor })
  })

  it('flushes pending changes on pagehide (window close / Tauri close)', () => {
    const host = new InMemoryCanvasHost()
    bind(host, 'c1', 60_000)
    host.upsert(card('a', { meta: { layoutAnchor: storedAnchor } }))
    expect(loadCardLayoutAnchors('c1')).toEqual({})

    window.dispatchEvent(new Event('pagehide'))
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: storedAnchor })
  })

  it('flushes pending changes when the document becomes hidden', () => {
    const host = new InMemoryCanvasHost()
    bind(host, 'c1', 60_000)
    host.upsert(card('a', { meta: { layoutAnchor: storedAnchor } }))
    expect(loadCardLayoutAnchors('c1')).toEqual({})

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: storedAnchor })
  })

  it('does not write on visibilitychange while the document is still visible', () => {
    const writes: string[] = []
    const real = window.localStorage
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => real.getItem(key),
      setItem: (key: string, value: string) => {
        writes.push(key)
        real.setItem(key, value)
      },
      removeItem: (key: string) => {
        writes.push(key)
        real.removeItem(key)
      },
      clear: () => real.clear(),
      key: (index: number) => real.key(index),
      get length() {
        return real.length
      },
    })
    const host = new InMemoryCanvasHost()
    bind(host, 'c1', 60_000)
    host.upsert(card('a', { meta: { layoutAnchor: storedAnchor } }))

    document.dispatchEvent(new Event('visibilitychange'))
    expect(writes).toEqual([])
  })

  it('does not leave a debounce timer that writes after an early pagehide flush', () => {
    vi.useFakeTimers()
    const host = new InMemoryCanvasHost()
    const unbind = bind(host, 'c1', 60_000)
    host.upsert(card('a', { meta: { layoutAnchor: storedAnchor } }))
    window.dispatchEvent(new Event('pagehide'))
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: storedAnchor })

    unbind()
    window.localStorage.clear()
    vi.advanceTimersByTime(120_000)
    expect(loadCardLayoutAnchors('c1')).toEqual({})
  })

  it('removes pagehide/visibility listeners on unbind', () => {
    const host = new InMemoryCanvasHost()
    const unbind = bind(host, 'c1', 60_000)
    host.upsert(card('a', { meta: { layoutAnchor: storedAnchor } }))
    unbind()
    window.localStorage.clear()

    window.dispatchEvent(new Event('pagehide'))
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(loadCardLayoutAnchors('c1')).toEqual({})
  })
})

describe('clearLayoutAnchorOnUserGeometryChange', () => {
  const anchor = { id: 'a', dir: 'right-of' as const, gap: 20 }

  it('clears when anchor unchanged and geometry moved (user drag)', () => {
    const previous = card('b', { x: 360, y: 100, meta: { layoutAnchor: anchor } })
    const next = card('b', { x: 440, y: 140, meta: { layoutAnchor: { ...anchor } } })
    expect(clearLayoutAnchorOnUserGeometryChange(next, previous).meta?.layoutAnchor).toBeUndefined()
  })

  it('preserves a new card anchor (DSL create, previous undefined)', () => {
    const next = card('b', { meta: { layoutAnchor: anchor } })
    expect(clearLayoutAnchorOnUserGeometryChange(next, undefined).meta?.layoutAnchor).toEqual(anchor)
  })

  it('preserves when the anchor changed (DSL re-solve)', () => {
    const previous = card('b', { x: 360, y: 100, meta: { layoutAnchor: anchor } })
    const next = card('b', {
      x: 360,
      y: 240,
      meta: { layoutAnchor: { id: 'a', dir: 'below', gap: 20 } },
    })
    expect(clearLayoutAnchorOnUserGeometryChange(next, previous).meta?.layoutAnchor).toEqual({
      id: 'a',
      dir: 'below',
      gap: 20,
    })
  })

  it('preserves during a programmatic layout apply (same anchor, new geometry)', () => {
    const previous = card('b', { x: 360, y: 100, meta: { layoutAnchor: anchor } })
    const next = card('b', { x: 1064, y: 100, meta: { layoutAnchor: { ...anchor } } })
    const kept = withLayoutAnchorPreserved(() =>
      clearLayoutAnchorOnUserGeometryChange(next, previous),
    )
    expect(kept.meta?.layoutAnchor).toEqual(anchor)
    // 作用域外仍是用户拖拽语义：同样的形状会被清锚。
    expect(clearLayoutAnchorOnUserGeometryChange(next, previous).meta?.layoutAnchor).toBeUndefined()
  })

  it('preserves when geometry is unchanged (content-only upsert)', () => {
    const previous = card('b', { meta: { layoutAnchor: anchor } })
    const next = card('b', { meta: { layoutAnchor: { ...anchor } } })
    expect(clearLayoutAnchorOnUserGeometryChange(next, previous).meta?.layoutAnchor).toEqual(anchor)
  })
})
