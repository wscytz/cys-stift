import { describe, it, expect, vi } from 'vitest'
import {
  cardShapeIdOf,
  cardIdFromShapeId,
  cardToElement,
  elementToCardPosition,
  bindCardWriteback,
  syncCardsToEditor,
  createCardOnCanvas,
} from '../canvas-binding'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasId, Card, CardId, CardService, CanvasPosition } from '@cys-stift/domain'

const CARD = {
  id: 'abc-123' as unknown as CardId,
  title: 'test',
  body: '',
  type: 'note' as const,
  media: [],
  links: [],
  codeSnippets: [],
  quotes: [],
  tags: [],
  canvasPosition: {
    canvasId: 'canvas-1' as unknown as CanvasId,
    x: 100,
    y: 200,
    w: 320,
    h: 160,
    z: 3,
    rotation: 0.5,
  },
  source: { kind: 'manual', deviceId: 'dev' } as never,
  capturedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  pinned: false,
  archived: false,
}

describe('cardShapeIdOf / cardIdFromShapeId roundtrip', () => {
  const input = 'test-id' as unknown as CardId
  it('encodes a card id with shape: prefix', () => {
    expect(cardShapeIdOf(input)).toBe('shape:test-id')
  })
  it('decodes back to the original card id', () => {
    expect(cardIdFromShapeId(cardShapeIdOf(input))).toBe('test-id')
  })
  it('strips shape: prefix from any string', () => {
    expect(cardIdFromShapeId('shape:hello')).toBe('hello')
    expect(cardIdFromShapeId('not-prefixed')).toBe('not-prefixed')
  })
})

describe('cardToElement', () => {
  it('maps card.canvasPosition onto a host element (geometry only)', () => {
    const el = cardToElement(CARD)
    expect(el.kind).toBe('card')
    expect(el.id).toBe('abc-123')
    expect(el.x).toBe(100)
    expect(el.y).toBe(200)
    expect(el.rotation).toBe(0.5)
    expect(el.w).toBe(320)
    expect(el.h).toBe(160)
  })
  it('falls back to DEFAULT_W/H when canvasPosition is missing', () => {
    const c = { ...CARD, canvasPosition: undefined }
    const el = cardToElement(c)
    expect(el.w).toBe(240)
    expect(el.h).toBe(120)
    expect(el.rotation).toBe(0)
  })
  it('falls back to 0 coords when position is missing', () => {
    const c = { ...CARD, canvasPosition: undefined }
    const el = cardToElement(c)
    expect(el.x).toBe(0)
    expect(el.y).toBe(0)
  })
})

describe('elementToCardPosition', () => {
  it('preserves existing z and maps canvasId', () => {
    const el = {
      id: 'abc',
      kind: 'card' as const,
      x: 50,
      y: 60,
      w: 200,
      h: 100,
      rotation: 0,
    }
    const pos = elementToCardPosition(el, 'target-canvas' as unknown as CanvasId, 7)
    expect(pos).toEqual({
      canvasId: 'target-canvas',
      x: 50,
      y: 60,
      w: 200,
      h: 100,
      z: 7,
      rotation: 0,
    })
  })
})

/**
 * Bug B regression: canvas Delete/橡皮 擦掉卡元素必须走 removeFromCanvas(送回
 * inbox),不能 softDelete。否则引擎 undo 只恢复 host 元素,DB 的 deletedAt 不
 * 回滚 → 切画布/reload 卡永久丢失(静默数据丢失)。
 *
 * 这里用 InMemoryCanvasHost + fake CardService 验证:user-source remove 触发
 * bindCardWriteback 的 onUserChange → 调用 removeFromCanvas,且永不被 softDelete。
 */
function makeCardOnCanvas(id: string, canvasId: string): Card {
  return {
    id: id as unknown as CardId,
    title: id,
    body: '',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    tags: [],
    canvasPosition: {
      canvasId: canvasId as unknown as CanvasId,
      x: 10,
      y: 20,
      w: 240,
      h: 120,
      z: 1,
      rotation: 0,
    },
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    archived: false,
  }
}

function makeFakeService(cards: Map<string, Card>): {
  service: CardService
  softDeleteCalls: string[]
  removeFromCanvasCalls: string[]
  moveToCanvasCalls: { id: string; pos: CanvasPosition }[]
} {
  const softDeleteCalls: string[] = []
  const removeFromCanvasCalls: string[] = []
  const moveToCanvasCalls: { id: string; pos: CanvasPosition }[] = []
  const service = {
    get: (id: CardId) => cards.get(String(id)) ?? null,
    listOnCanvas: (canvasId: CanvasId) =>
      [...cards.values()].filter(
        (c) => !c.deletedAt && !c.archived && c.canvasPosition?.canvasId === canvasId,
      ),
    moveToCanvas: (id: CardId, pos: CanvasPosition) => {
      moveToCanvasCalls.push({ id: String(id), pos })
      const c = cards.get(String(id))
      if (c) cards.set(String(id), { ...c, canvasPosition: pos })
    },
    softDelete: (id: CardId) => {
      softDeleteCalls.push(String(id))
      const c = cards.get(String(id))
      if (c) cards.set(String(id), { ...c, deletedAt: new Date() })
    },
    removeFromCanvas: (id: CardId) => {
      removeFromCanvasCalls.push(String(id))
      const c = cards.get(String(id))
      if (c) cards.set(String(id), { ...c, canvasPosition: undefined })
      return true
    },
  } as unknown as CardService
  return { service, softDeleteCalls, removeFromCanvasCalls, moveToCanvasCalls }
}

describe('bindCardWriteback: user-source remove → removeFromCanvas (not softDelete)', () => {
  it('removing a card element sends the card to inbox (removeFromCanvas)', () => {
    const canvasId = 'canvas-1' as unknown as CanvasId
    const cards = new Map([['card-a', makeCardOnCanvas('card-a', 'canvas-1')]])
    const { service, softDeleteCalls, removeFromCanvasCalls } = makeFakeService(cards)
    const host = new InMemoryCanvasHost()

    // load 卡(applyWithoutEcho:不触发 user-source)
    host.applyWithoutEcho(() => host.upsert(cardToElement(cards.get('card-a')!)))
    const unbind = bindCardWriteback(host, service, canvasId)

    // user-source remove(模拟 Delete 键 / 橡皮擦掉卡)
    host.remove('card-a')

    expect(removeFromCanvasCalls).toEqual(['card-a'])
    expect(softDeleteCalls).toEqual([])
    // 卡仍存在,只是 canvasPosition 被清(回 inbox)
    expect(cards.get('card-a')!.canvasPosition).toBeUndefined()
    expect(cards.get('card-a')!.deletedAt).toBeUndefined()

    unbind()
  })

  it('a programmatic (no-echo) remove does NOT trigger writeback', () => {
    const canvasId = 'canvas-1' as unknown as CanvasId
    const cards = new Map([['card-b', makeCardOnCanvas('card-b', 'canvas-1')]])
    const { service, softDeleteCalls, removeFromCanvasCalls } = makeFakeService(cards)
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => host.upsert(cardToElement(cards.get('card-b')!)))
    const unbind = bindCardWriteback(host, service, canvasId)

    // syncCardsToEditor 风格的 programmatic remove(applyWithoutEcho 包裹)
    host.applyWithoutEcho(() => host.remove('card-b'))

    expect(removeFromCanvasCalls).toEqual([])
    expect(softDeleteCalls).toEqual([])

    unbind()
  })
})

/**
 * undo/redo desync 回归(v0.38.0):Delete 走 removeFromCanvas(清 DB canvasPosition),
 * 引擎 undo 把卡元素放回 host,但 undo 走 applyWithoutEcho → onUserChange 不触发 →
 * 绑定无从得知 → DB canvasPosition 仍空 → 下一次 syncCardsToEditor 再次移除卡。
 * 解法:bindCardWriteback 监听 host.onHistoryChange,undo 后把 DB canvasPosition
 * 用 host 元素几何 move 回本画布(幂等,echo-suppressed)。
 *
 * 这里用 InMemoryCanvasHost(已加最小 undo 栈 + onHistoryChange)+ fake CardService
 * (记录 moveToCanvas)端到端验证:Delete → removeFromCanvas;Undo → 卡回 host 且
 * moveToCanvas 被调(DB canvasPosition 恢复);随后 syncCardsToEditor 不再二次移除。
 */
describe('bindCardWriteback: undo reconciles DB canvasPosition (no desync)', () => {
  it('Delete then Undo restores the card and its DB canvasPosition', () => {
    const canvasId = 'canvas-1' as unknown as CanvasId
    const cards = new Map([['card-c', makeCardOnCanvas('card-c', 'canvas-1')]])
    const { service, softDeleteCalls, removeFromCanvasCalls, moveToCanvasCalls } =
      makeFakeService(cards)
    const host = new InMemoryCanvasHost()

    // 初始载入(applyWithoutEcho,不触发 user-source,但 InMemory host 仍推 undo 快照)
    host.applyWithoutEcho(() => host.upsert(cardToElement(cards.get('card-c')!)))
    const unbind = bindCardWriteback(host, service, canvasId)

    // 1) 用户 Delete(模拟 Delete 键 / 橡皮)→ host 移除卡 → onUserChange(removed)
    host.remove('card-c')
    expect(removeFromCanvasCalls).toEqual(['card-c'])
    expect(softDeleteCalls).toEqual([])
    expect(cards.get('card-c')!.canvasPosition).toBeUndefined()
    expect(host.getElement('card-c')).toBeUndefined()

    // 2) Undo:引擎把卡元素放回 host(applyWithoutEcho,不触发 onUserChange),
    //    但会触发 onHistoryChange → 绑定的 reconcile 应把 DB canvasPosition 恢复。
    host.undo()

    // 卡元素回到了 host
    expect(host.getElement('card-c')).toBeDefined()
    // reconcile 用 host 元素几何调了 moveToCanvas(= DB canvasPosition 恢复)
    expect(moveToCanvasCalls).toHaveLength(1)
    expect(moveToCanvasCalls[0]!.id).toBe('card-c')
    expect(moveToCanvasCalls[0]!.pos.canvasId).toBe('canvas-1')
    // DB canvasPosition 已恢复,指向本画布
    expect(cards.get('card-c')!.canvasPosition?.canvasId).toBe('canvas-1')

    // 3) 模拟一次 snap 式重同步(syncCardsToEditor 用 listOnCanvas 算 wanted)。
    //    修复前:卡不在 listOnCanvas → sync 再次移除。修复后:卡在列表里 → 不动。
    const beforeRemoveCalls = removeFromCanvasCalls.length
    syncCardsToEditor(host, service, canvasId)
    // 卡仍在 host(没被 sync 二次移除)
    expect(host.getElement('card-c')).toBeDefined()
    // 期间没有 user-source remove 触发新的 removeFromCanvas
    expect(removeFromCanvasCalls.length).toBe(beforeRemoveCalls)

    unbind()
  })

  it('reconcile is idempotent on a normal edit (no-op when DB already matches)', () => {
    const canvasId = 'canvas-1' as unknown as CanvasId
    const cards = new Map([['card-d', makeCardOnCanvas('card-d', 'canvas-1')]])
    const { service, moveToCanvasCalls } = makeFakeService(cards)
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => host.upsert(cardToElement(cards.get('card-d')!)))
    const unbind = bindCardWriteback(host, service, canvasId)

    // 正常编辑(拖动卡):echoed upsert 会推 undo 快照 → 触发 onHistoryChange。
    // 此时 DB canvasPosition 仍指向本画布(还没被 debounce flush 改)→ reconcile 幂等跳过。
    const beforeReconcileCalls = moveToCanvasCalls.length
    host.upsert({ ...cardToElement(cards.get('card-d')!), x: 500, y: 600 })

    expect(moveToCanvasCalls.length).toBe(beforeReconcileCalls) // reconcile 没多调 moveToCanvas

    unbind()
  })

  it('redo re-removes the card: reconcile finds nothing in host to restore', () => {
    const canvasId = 'canvas-1' as unknown as CanvasId
    const cards = new Map([['card-e', makeCardOnCanvas('card-e', 'canvas-1')]])
    const { service, removeFromCanvasCalls, moveToCanvasCalls } = makeFakeService(cards)
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => host.upsert(cardToElement(cards.get('card-e')!)))
    const unbind = bindCardWriteback(host, service, canvasId)

    // Delete → Undo(恢复)→ Redo(再次移除)
    host.remove('card-e')
    expect(removeFromCanvasCalls).toEqual(['card-e'])
    host.undo()
    const restoredMoveCalls = moveToCanvasCalls.length
    host.redo()

    // redo 后卡又不在 host 了
    expect(host.getElement('card-e')).toBeUndefined()
    // redo 的 onHistoryChange 触发 reconcile,但 host 里没有 card-e → 无 moveToCanvas
    expect(moveToCanvasCalls.length).toBe(restoredMoveCalls)

    unbind()
  })
})

/**
 * 撤销卡复活回归(P0):undo 把卡从 host 撤掉,但 undo 走 applyWithoutEcho →
 * onUserChange 不触发 → writeback 没清 DB canvasPosition → DB 仍记录此卡在本画布,
 * 但 host 无元素。下次任意 syncCardsToEditor 读 DB wantedIds 含此卡 → upsert 回
 * host → 幽灵卡复活。
 *
 * 解法:reconcileHistory 在现有 host→DB 遍历后追加 DB→host 反向差集:DB 有本画布的
 * 卡但 host 没有 → removeFromCanvas(回 inbox)。与现有 host 有 DB 无 → moveToCanvas
 * 配对:undo = remove,redo = move 回,闭环幂等。
 *
 * 这里用 mock host(手动 fireHistoryChange)+ vi.fn service,聚焦 reconcileHistory 逻辑。
 * 真实 InMemoryCanvasHost.undo() 恢复完整快照,不适合表达单卡撤销的不一致状态。
 */
function makeMockHost(): {
  host: import('@cys-stift/canvas-engine').CanvasHost
  fireHistoryChange: () => void
} {
  let historyCb: (() => void) | null = null
  const host = {
    getElements: vi.fn(() => [] as import('@cys-stift/canvas-engine').CanvasElement[]),
    getElement: vi.fn(() => undefined),
    upsert: vi.fn(),
    remove: vi.fn(),
    applyWithoutEcho: vi.fn((fn: () => void) => fn()),
    onUserChange: vi.fn(() => () => {}),
    onHistoryChange: vi.fn((cb: () => void) => {
      historyCb = cb
      return () => {
        historyCb = null
      }
    }),
  } as unknown as import('@cys-stift/canvas-engine').CanvasHost
  return { host, fireHistoryChange: () => historyCb?.() }
}

function makeMockServiceForReconcile(): CardService {
  return {
    get: vi.fn(),
    listOnCanvas: vi.fn(() => []),
    moveToCanvas: vi.fn(),
    removeFromCanvas: vi.fn(),
  } as unknown as CardService
}

describe('reconcileHistory — undo removes orphan DB card (reverse diff)', () => {
  it('removeFromCanvas when DB has card on canvas but host does not (undo path)', () => {
    const { host, fireHistoryChange } = makeMockHost()
    const svc = makeMockServiceForReconcile()
    // 模拟 undo 后状态:host 空,DB 有一张本画布的卡(u1)
    ;(svc.listOnCanvas as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'u1', canvasPosition: { canvasId: 'default-canvas' } },
    ])
    ;(svc.get as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'u1',
      canvasPosition: { canvasId: 'default-canvas' },
    }) // 非归档非软删
    ;(host.getElements as ReturnType<typeof vi.fn>).mockReturnValue([]) // undo 把卡从 host 撤掉了

    const unbind = bindCardWriteback(host, svc, 'default-canvas' as never)
    fireHistoryChange() // 触发 reconcileHistory

    expect(svc.removeFromCanvas).toHaveBeenCalledWith('u1')

    unbind()
  })

  it('does not removeFromCanvas when host has the card (normal edit, no-op)', () => {
    const { host, fireHistoryChange } = makeMockHost()
    const svc = makeMockServiceForReconcile()
    ;(svc.listOnCanvas as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'u1', canvasPosition: { canvasId: 'default-canvas' } },
    ])
    ;(host.getElements as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'u1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 },
    ])

    const unbind = bindCardWriteback(host, svc, 'default-canvas' as never)
    fireHistoryChange()

    expect(svc.removeFromCanvas).not.toHaveBeenCalled()

    unbind()
  })

  it('skips archived cards in the reverse diff', () => {
    const { host, fireHistoryChange } = makeMockHost()
    const svc = makeMockServiceForReconcile()
    ;(svc.listOnCanvas as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'u1', archived: true, canvasPosition: { canvasId: 'default-canvas' } },
    ])
    ;(host.getElements as ReturnType<typeof vi.fn>).mockReturnValue([])

    const unbind = bindCardWriteback(host, svc, 'default-canvas' as never)
    fireHistoryChange()

    expect(svc.removeFromCanvas).not.toHaveBeenCalled()

    unbind()
  })

  it('skips soft-deleted cards in the reverse diff', () => {
    const { host, fireHistoryChange } = makeMockHost()
    const svc = makeMockServiceForReconcile()
    ;(svc.listOnCanvas as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 'u1',
        deletedAt: new Date(),
        canvasPosition: { canvasId: 'default-canvas' },
      },
    ])
    ;(host.getElements as ReturnType<typeof vi.fn>).mockReturnValue([])

    const unbind = bindCardWriteback(host, svc, 'default-canvas' as never)
    fireHistoryChange()

    expect(svc.removeFromCanvas).not.toHaveBeenCalled()

    unbind()
  })
})

/**
 * createCardOnCanvas(v0.x):「在画布上 (x,y) 建卡」共用建卡函数,供 DSL paste
 * (传 id,title 空)与右键建卡(不传 id)共用。保持「元素 id === CardId」不变量。
 */
function makeMockService() {
  // 模拟真实 CardService:createWithId/get 联动并把 canvasPosition 落库,
  // create 自 mint id。这样 createCardOnCanvas 调 service.get(id)! 拿到
  // 带几何的卡,与真实行为一致。
  const store = new Map<string, Record<string, unknown>>()
  return {
    create: vi.fn((input?: Record<string, unknown>) => {
      const card = { id: 'minted', ...input }
      store.set('minted', card)
      return card
    }),
    createWithId: vi.fn((id: string, input?: Record<string, unknown>) => {
      const card = { id, ...input }
      store.set(id, card)
      return card
    }),
    get: vi.fn((id: string) => store.get(id) ?? null),
    moveToCanvas: vi.fn(),
  } as unknown as Parameters<typeof createCardOnCanvas>[0]
}

describe('createCardOnCanvas', () => {
  it('creates a card with the given id at the given position', () => {
    const host = new InMemoryCanvasHost()
    const svc = makeMockService()
    createCardOnCanvas(svc, host, 'default-canvas' as never, { id: 'c1', title: 't', x: 100, y: 200 })
    expect(svc.createWithId).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 't' }))
    expect(host.getElement('c1')).toMatchObject({ kind: 'card', x: 100, y: 200 })
  })

  it('mints id when none given (right-click path)', () => {
    const host = new InMemoryCanvasHost()
    const svc = makeMockService()
    createCardOnCanvas(svc, host, 'default-canvas' as never, { title: 'r', x: 5, y: 6 })
    expect(svc.create).toHaveBeenCalled()
  })

  it('falls back to moveToCanvas when id already exists', () => {
    const host = new InMemoryCanvasHost()
    const svc = makeMockService()
    ;(svc.get as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'c1' })
    createCardOnCanvas(svc, host, 'default-canvas' as never, { id: 'c1', title: 't', x: 1, y: 2 })
    expect(svc.createWithId).not.toHaveBeenCalled()
    expect(svc.moveToCanvas).toHaveBeenCalled()
  })
})
