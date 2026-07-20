import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CanvasId } from '@cys-stift/domain'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import type { CanvasFreeformSnapshot } from '@/lib/canvas-freeform-store'
import {
  attachCanvasFreeformPersistence,
  isFreeformElement,
  freeformElementsOf,
} from '../canvas-freeform-binding'

const CANVAS = 'canvas-x' as unknown as CanvasId
const DEBOUNCE = 100

function textEl(id: string): CanvasElement {
  return { id, kind: 'text', x: 0, y: 0, w: 20, h: 18, rotation: 0, text: id }
}
function freedrawEl(id: string): CanvasElement {
  return { id, kind: 'freedraw', x: 0, y: 0, w: 10, h: 10, rotation: 0, meta: { points: [[0, 0]] } }
}
function cardEl(id: string): CanvasElement {
  return { id, kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 }
}

/** Manually-resolvable fake store for race tests. */
function makeFakeStore(loadResult: CanvasFreeformSnapshot | null = null) {
  let resolveLoad: (v: CanvasFreeformSnapshot | null) => void = () => {}
  const loadGate = new Promise<CanvasFreeformSnapshot | null>((r) => {
    resolveLoad = r
  })
  return {
    saveCalls: [] as CanvasElement[][],
    removeCalls: [] as CanvasId[],
    /** When true, load() blocks until releaseLoad() is called. */
    deferred: false,
    loadResult,
    async load(_id: CanvasId): Promise<CanvasFreeformSnapshot | null> {
      if (this.deferred) return loadGate
      return this.loadResult
    },
    releaseLoad() {
      resolveLoad(this.loadResult)
    },
    async save(_id: CanvasId, els: CanvasElement[]): Promise<boolean> {
      this.saveCalls.push(els)
      return true
    },
    async remove(id: CanvasId): Promise<boolean> {
      this.removeCalls.push(id)
      return true
    },
  }
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('isFreeformElement / freeformElementsOf', () => {
  it('isFreeformElement is true for non-card kinds', () => {
    expect(isFreeformElement(textEl('t'))).toBe(true)
    expect(isFreeformElement(freedrawEl('f'))).toBe(true)
    expect(isFreeformElement(cardEl('c'))).toBe(false)
  })
  it('freeformElementsOf preserves order and drops cards', () => {
    const els = [cardEl('c1'), textEl('t1'), cardEl('c2'), freedrawEl('f1')]
    expect(freeformElementsOf(els).map((e) => e.id)).toEqual(['t1', 'f1'])
  })
})

describe('attachCanvasFreeformPersistence — hydrate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('restores persisted freeform elements into the host', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore({ v: 1, app: 'cys-stift', elements: [textEl('t1'), freedrawEl('f1')] })
    const unbind = attachCanvasFreeformPersistence(host, CANVAS, { debounceMs: DEBOUNCE, store })
    await flush()
    expect(host.getElements().map((e) => e.id).sort()).toEqual(['f1', 't1'])
    unbind()
  })

  it('never restores a card element from the snapshot', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore({ v: 1, app: 'cys-stift', elements: [cardEl('c1'), textEl('t1')] })
    const unbind = attachCanvasFreeformPersistence(host, CANVAS, { debounceMs: DEBOUNCE, store })
    await flush()
    expect(host.getElement('c1')).toBeUndefined()
    expect(host.getElement('t1')).toBeDefined()
    unbind()
  })

  it('hydrate does not trigger a save (applyWithoutEcho)', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore({ v: 1, app: 'cys-stift', elements: [textEl('t1')] })
    const unbind = attachCanvasFreeformPersistence(host, CANVAS, { debounceMs: DEBOUNCE, store })
    await flush()
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls.length).toBe(0)
    unbind()
  })

  it('does not overwrite a card with the same id during restore', async () => {
    const host = new InMemoryCanvasHost()
    // user already has a card 'c1' on the host (loaded by loadCardsIntoEditor)
    host.applyWithoutEcho(() => host.upsert(cardEl('c1')))
    // a stale snapshot somehow carries an element with the same id
    const store = makeFakeStore({ v: 1, app: 'cys-stift', elements: [{ ...textEl('c1') }] })
    const unbind = attachCanvasFreeformPersistence(host, CANVAS, { debounceMs: DEBOUNCE, store })
    await flush()
    expect(host.getElement('c1')?.kind).toBe('card')
    unbind()
  })
})

describe('attachCanvasFreeformPersistence — save triggers', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function attachHydrated(host: InMemoryCanvasHost, store: ReturnType<typeof makeFakeStore>) {
    const unbind = attachCanvasFreeformPersistence(host, CANVAS, { debounceMs: DEBOUNCE, store })
    await flush() // let hydrate complete
    return unbind
  }

  it('user upsert of a freedraw debounce-saves the non-card elements', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore()
    const unbind = await attachHydrated(host, store)
    host.upsert(freedrawEl('f1')) // user-source (echoing default true)
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls.length).toBe(1)
    expect(store.saveCalls[0]!.map((e) => e.id)).toEqual(['f1'])
    unbind()
  })

  it('user upsert of a card does NOT save', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore()
    const unbind = await attachHydrated(host, store)
    host.upsert(cardEl('c1'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls.length).toBe(0)
    unbind()
  })

  it('user remove of a freeform element saves', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore()
    const unbind = await attachHydrated(host, store)
    host.upsert(textEl('t1'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    store.saveCalls.length = 0
    host.remove('t1')
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls.length).toBe(1)
    expect(store.saveCalls[0]).toEqual([])
    unbind()
  })

  it('user remove of a card does NOT save', async () => {
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => host.upsert(cardEl('c1')))
    const store = makeFakeStore()
    const unbind = await attachHydrated(host, store)
    host.remove('c1') // user-source card removal (soft-delete path)
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls.length).toBe(0)
    unbind()
  })

  it('mixed update (card + text) saves only the non-card elements', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore()
    const unbind = await attachHydrated(host, store)
    host.upsert(cardEl('c1'))
    host.upsert(textEl('t1'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    const last = store.saveCalls[store.saveCalls.length - 1]!
    expect(last.map((e) => e.id)).toEqual(['t1'])
    unbind()
  })

  it('cleanup flushes a pending debounced save', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore()
    const unbind = await attachHydrated(host, store)
    host.upsert(textEl('t1'))
    // unbind BEFORE the debounce fires
    unbind()
    await flush()
    expect(store.saveCalls.length).toBe(1)
    expect(store.saveCalls[0]!.map((e) => e.id)).toEqual(['t1'])
  })

  it('persists an undo-restored freeform state instead of replaying the pre-undo snapshot', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore()
    const unbind = await attachHydrated(host, store)
    host.upsert(textEl('t1'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    store.saveCalls.length = 0
    host.undo()
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls.at(-1)).toEqual([])
    unbind()
  })

  it('tracks an element restored by undo so deleting it again is persisted', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore({ v: 1, app: 'cys-stift', elements: [textEl('t1')] })
    const unbind = await attachHydrated(host, store)

    host.remove('t1')
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    host.undo()
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(host.getElement('t1')).toBeDefined()

    store.saveCalls.length = 0
    host.remove('t1')
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls).toEqual([[]])
    unbind()
  })

  it('serializes an in-flight save before the later undo snapshot', async () => {
    const host = new InMemoryCanvasHost()
    const saveCalls: CanvasElement[][] = []
    const gates: Array<() => void> = []
    let persisted: CanvasElement[] = []
    const store = {
      load: async () => null,
      remove: async () => true,
      save: async (_id: CanvasId, elements: CanvasElement[]) => {
        const snapshot = elements.map((element) => ({ ...element }))
        saveCalls.push(snapshot)
        await new Promise<void>((resolve) => gates.push(resolve))
        persisted = snapshot
        return true
      },
    }
    const unbind = attachCanvasFreeformPersistence(host, CANVAS, { debounceMs: DEBOUNCE, store })
    await flush()

    host.upsert(textEl('t1'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(saveCalls.map((elements) => elements.map((element) => element.id))).toEqual([['t1']])

    host.undo()
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(saveCalls).toHaveLength(1)

    gates.shift()?.()
    await flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(saveCalls).toHaveLength(2)
    expect(saveCalls[1]).toEqual([])
    gates.shift()?.()
    await flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(persisted).toEqual([])
    unbind()
  })
})

describe('attachCanvasFreeformPersistence — race safety', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a user change before hydrate completes does not save an empty snapshot', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore({ v: 1, app: 'cys-stift', elements: [textEl('persisted')] })
    store.deferred = true // load() blocks
    const unbind = attachCanvasFreeformPersistence(host, CANVAS, { debounceMs: DEBOUNCE, store })
    // user draws while hydrate is still pending
    host.upsert(freedrawEl('fresh'))
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls.length).toBe(0) // nothing saved yet — would clobber persisted
    // hydrate completes now
    store.releaseLoad()
    await flush()
    // after hydrate, the merged state (persisted + fresh) is saved once
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 10)
    expect(store.saveCalls.length).toBeGreaterThanOrEqual(1)
    const last = store.saveCalls[store.saveCalls.length - 1]!
    expect(last.map((e) => e.id).sort()).toEqual(['fresh', 'persisted'])
    unbind()
  })

  it('a load that resolves after unbind does not upsert into the host', async () => {
    const host = new InMemoryCanvasHost()
    const store = makeFakeStore({ v: 1, app: 'cys-stift', elements: [textEl('late')] })
    store.deferred = true
    const unbind = attachCanvasFreeformPersistence(host, CANVAS, { debounceMs: DEBOUNCE, store })
    unbind() // dispose before load resolves
    store.releaseLoad()
    await flush()
    expect(host.getElement('late')).toBeUndefined()
  })
})
