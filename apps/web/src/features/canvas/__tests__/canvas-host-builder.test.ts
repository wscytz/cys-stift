import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { Card, CardService, CanvasId } from '@cys-stift/domain'

// mock canvasFreeformStore(load/save 是 localStorage/OPFS 副作用,单测隔离)
// 真实 save(id, elements[]) 内部 makeSnapshot 包裹;mock 直接存裸数组,load 还原。
const freeformStore = new Map<string, any[]>()
vi.mock('@/lib/canvas-freeform-store', () => ({
  canvasFreeformStore: {
    load: vi.fn(async (id: string) => {
      const els = freeformStore.get(id)
      return els ? { elements: els, version: 1, savedAt: 0 } : null
    }),
    save: vi.fn(async (id: string, elements: any[]) => {
      freeformStore.set(id, elements)
      return true
    }),
    remove: vi.fn(async () => {}),
  },
}))

import {
  buildCanvasHostForCanvas,
  applyOpsAndPersist,
  buildEmptyHost,
} from '../canvas-host-builder'
import type { DslOp } from '@cys-stift/dsl'
import { canvasFreeformStore } from '@/lib/canvas-freeform-store'

/** 造一张在 canvasId 上的卡(带 canvasPosition)。 */
function cardOnCanvas(id: string, canvasId: string, x: number, y: number, color?: string): Card {
  return {
    id: id as never,
    title: id,
    body: '',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    pinned: false,
    archived: false,
    canvasPosition: { canvasId: canvasId as CanvasId, x, y, w: 200, h: 80, z: 0, rotation: 0 },
    ...(color ? { color: color as any } : {}),
  } as Card
}

/** mock CardService:store 联动 listOnCanvas/get/update/createWithId。 */
function makeService(cards: Card[] = []): CardService {
  const store = new Map<string, Card>()
  for (const c of cards) store.set(String(c.id), c)
  const svc = {
    listOnCanvas: vi.fn((canvasId: CanvasId) =>
      [...store.values()].filter(
        (c) => c.canvasPosition?.canvasId === canvasId && !c.archived && !c.deletedAt,
      ),
    ),
    get: vi.fn((id: string) => store.get(id) ?? null),
    update: vi.fn((id: string, patch: any) => {
      const c = store.get(id)
      if (!c) return null
      const next = { ...c, ...patch, updatedAt: new Date() }
      store.set(id, next)
      return next
    }),
    moveToCanvas: vi.fn((id: string, position: any) => {
      const c = store.get(id)
      if (!c) return false
      store.set(id, { ...c, canvasPosition: position })
      return true
    }),
    removeFromCanvas: vi.fn((id: string) => {
      const c = store.get(id)
      if (!c) return false
      store.set(id, { ...c, canvasPosition: undefined })
      return true
    }),
    createWithId: vi.fn((id: string, input: any) => {
      const c = { ...input, id } as Card
      store.set(id, c)
      return c
    }),
    hardDelete: vi.fn((id: string) => store.delete(id)),
  }
  return svc as unknown as CardService
}

const CANVAS = 'default-canvas' as CanvasId

describe('buildCanvasHostForCanvas', () => {
  beforeEach(() => freeformStore.clear())

  it('装载 cards + freeform 到临时 host', async () => {
    freeformStore.set(String(CANVAS), [
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2' },
    ])
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100), cardOnCanvas('c2', String(CANVAS), 200, 100)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    expect(host.getElement('c1')).toMatchObject({ kind: 'card', x: 100 })
    expect(host.getElement('r1')).toMatchObject({ kind: 'rect' })
    expect(before.length).toBe(4) // 2 cards + rect + arrow
  })

  it('archived/deleted 卡不装载', async () => {
    const archived = cardOnCanvas('c1', String(CANVAS), 0, 0)
    archived.archived = true
    const svc = makeService([archived, cardOnCanvas('c2', String(CANVAS), 0, 0)])
    const { host } = await buildCanvasHostForCanvas(CANVAS, svc)
    expect(host.getElement('c1')).toBeUndefined()
    expect(host.getElement('c2')).toBeDefined()
  })

  it('空画布:无 cards 无 freeform', async () => {
    const svc = makeService([])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    expect(before).toEqual([])
    expect(host.getElements()).toEqual([])
  })
})

describe('applyOpsAndPersist', () => {
  beforeEach(() => freeformStore.clear())

  it('card 位置变更回写 CardService', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    // DSL op:把 c1 移到 (300, 200)
    const ops: DslOp[] = [
      { type: 'card', cardId: 'c1' as never, x: 300, y: 200 },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.cardsUpdated).toBe(1)
    expect(svc.moveToCanvas).toHaveBeenCalledWith('c1', expect.objectContaining({ x: 300, y: 200 }))
    const updated = svc.get('c1' as never)!
    expect(updated.canvasPosition?.x).toBe(300)
    expect(updated.canvasPosition?.y).toBe(200)
  })

  it('card 颜色变更回写 CardService', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      { type: 'card', cardId: 'c1' as never, x: 100, y: 100, color: 'red' },
    ]
    await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(svc.get('c1' as never)!.color).toBe('red')
  })

  it('freeform 变更(新增 arrow)落 store', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 0, 0), cardOnCanvas('c2', String(CANVAS), 100, 0)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      {
        type: 'arrow',
        id: 'new-arrow',
        from: 'c1',
        to: 'c2',
        color: 'red',
        dash: 'solid',
        arrowhead: 'arrow',
        label: undefined,
      } as DslOp,
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.applied).toBeGreaterThanOrEqual(1)
    // freeformChanged:新增 1 arrow → added=1(updated/removed=0)= 1
    // (旧公式此处算成 2:|Δlen|=1 + added=1 双算)
    expect(res.freeformChanged).toBe(1)
    // freeform store 应含新建的 arrow(applyArrowOp create 路径 mint 新 id,
    // 不保留 op.id,故按 kind 断言而非 id)
    const saved = freeformStore.get(String(CANVAS))!
    expect(saved.some((e) => e.kind === 'arrow' && e.from === 'c1' && e.to === 'c2')).toBe(true)
    // store 不含 card(freeformOnly 过滤)
    expect(saved.some((e) => e.kind === 'card')).toBe(false)
  })

  it('freeform 变更数 = added + updated(更新已有 rect + 新增 arrow = 2;钉三和公式)', async () => {
    // seed r1 在 store;DSL 移动 r1(updated)+ 新建 arrow(added)→ freeformChanged 应 = 2
    // (旧公式 |Δlen|+(added+updated) = 1+2 = 3,加+更新混合错)
    freeformStore.set(String(CANVAS), [
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    ])
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 0, 0), cardOnCanvas('c2', String(CANVAS), 100, 0)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      { type: 'free', shape: 'rect', id: 'r1', x: 500, y: 500, w: 10, h: 10 } as DslOp,
      { type: 'arrow', from: 'c1', to: 'c2' } as DslOp,
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.freeformChanged).toBe(2)
    // r1 被更新(位置变),arrow 新建
    const saved = freeformStore.get(String(CANVAS))!
    expect(saved.find((e) => e.id === 'r1')).toMatchObject({ x: 500, y: 500 })
    expect(saved.some((e) => e.kind === 'arrow')).toBe(true)
  })

  it('create card 指令落 service.createWithId', async () => {
    const svc = makeService([])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      { type: 'card', cardId: 'new1' as never, x: 50, y: 50, w: 200, h: 80, create: true },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.cardsCreated).toBe(1)
    expect(res.cardsUpdated).toBe(0)
    expect(svc.createWithId).toHaveBeenCalledWith('new1', expect.objectContaining({ canvasPosition: expect.objectContaining({ x: 50, y: 50 }) }))
  })

  it('createWithId 抛错 → cardsFailed 计数(cardsCreated 不增,不再静默吞)', async () => {
    const svc = makeService([])
    vi.spyOn(svc, 'createWithId').mockImplementation(() => { throw new Error('quota exceeded') })
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      { type: 'card', cardId: 'new1' as never, x: 0, y: 0, create: true },
      { type: 'card', cardId: 'new2' as never, x: 100, y: 0, create: true },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.cardsFailed).toBe(2)
    expect(res.cardsCreated).toBe(0)
    expect(res.applied).toBe(0)
    expect(res.failed).toBe(2)
    expect(host.getElement('new1')).toBeUndefined()
    expect(host.getElement('new2')).toBeUndefined()
  })

  it('create persistence failure leaves no ghost card and skips its dependent arrow', async () => {
    const svc = makeService([])
    vi.spyOn(svc, 'createWithId').mockImplementation(() => { throw new Error('quota exceeded') })
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      { type: 'card', cardId: 'new1' as never, x: 0, y: 0, create: true },
      { type: 'free', shape: 'rect', id: 'target', x: 300, y: 0, w: 100, h: 100 },
      { type: 'arrow', id: 'dependent', from: 'new1', to: 'target' },
    ]

    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)

    expect(host.getElement('new1')).toBeUndefined()
    expect(host.getElement('dependent')).toBeUndefined()
    expect(res.opResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ opIndex: 0, status: 'failed' }),
      expect.objectContaining({ opIndex: 2, status: 'skipped' }),
    ]))
  })

  it('透出 sanitizeDiagnostics(ops 引用不存在的 card → diagnostic 挂 PersistResult)', async () => {
    const svc = makeService([])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      { type: 'card', cardId: 'ghost' as never, x: 0, y: 0 }, // 无 create + 不存在 → case 1 diagnostic
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.sanitizeDiagnostics).toBeDefined()
    expect(res.sanitizeDiagnostics!.length).toBeGreaterThanOrEqual(1)
  })

  it('无变更的 card 不回写(避免无谓 update)', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    // op 位置和原位置相同
    const ops: DslOp[] = [
      { type: 'card', cardId: 'c1' as never, x: 100, y: 100 },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.cardsUpdated).toBe(0)
    expect(svc.update).not.toHaveBeenCalled()
  })

  it('空 ops no-op,不崩', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 0, 0)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const res = await applyOpsAndPersist(host, before, [], CANVAS, svc)
    expect(res.applied).toBe(0)
    expect(res.cardsUpdated).toBe(0)
  })

  it('freeform save 返回 false → 整体失败并回滚 host/store/card', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    freeformStore.set(String(CANVAS), [
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    ])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const save = vi.mocked(canvasFreeformStore.save)
    save.mockResolvedValueOnce(false)

    const res = await applyOpsAndPersist(
      host,
      before,
      [
        { type: 'free', shape: 'rect', id: 'r1', x: 99, y: 99, w: 10, h: 10 } as DslOp,
        { type: 'card', cardId: 'c1' as never, x: 300, y: 200 },
        { type: 'card', cardId: 'new1' as never, x: 500, y: 200, create: true },
      ],
      CANVAS,
      svc,
    )

    expect(res.ok).toBe(false)
    expect(res.committed).toBe(false)
    expect(res.applied).toBe(0)
    expect(res.failureReason).toMatch(/freeform save/i)
    expect(host.getElements()).toEqual(before)
    expect(freeformStore.get(String(CANVAS))).toEqual([
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    ])
    expect(svc.get('c1' as never)!.canvasPosition?.x).toBe(100)
    expect(svc.get('new1' as never)).toBeNull()
  })

  it('moveToCanvas 返回 false → 不计 cardsUpdated,暴露失败并回滚', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    vi.spyOn(svc, 'moveToCanvas').mockReturnValue(false)
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const res = await applyOpsAndPersist(
      host,
      before,
      [{ type: 'card', cardId: 'c1' as never, x: 300, y: 200 }],
      CANVAS,
      svc,
    )

    expect(res.ok).toBe(false)
    expect(res.cardsUpdated).toBe(0)
    expect(res.cardUpdatesFailed).toBe(1)
    expect(res.applied).toBe(0)
    expect(svc.get('c1' as never)!.canvasPosition?.x).toBe(100)
    expect(host.getElement('c1')).toMatchObject({ x: 100, y: 100 })
  })

  it('update 返回 false → 颜色不计入 cardsUpdated,结果暴露失败', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    vi.spyOn(svc, 'update').mockReturnValue(false as never)
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const res = await applyOpsAndPersist(
      host,
      before,
      [{ type: 'card', cardId: 'c1' as never, x: 100, y: 100, color: 'red' }],
      CANVAS,
      svc,
    )

    expect(res.ok).toBe(false)
    expect(res.cardsUpdated).toBe(0)
    expect(res.cardUpdatesFailed).toBe(1)
    expect(res.failed).toBe(1)
    expect(svc.get('c1' as never)!.color).toBeUndefined()
    expect(host.getElement('c1')?.color).not.toBe('red')
  })

  it('成功结果提供一次性 undo/rollback,第二次调用不再改数据', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const res = await applyOpsAndPersist(
      host,
      before,
      [{ type: 'card', cardId: 'c1' as never, x: 300, y: 200 }],
      CANVAS,
      svc,
    )

    expect(res.ok).toBe(true)
    expect(res.undo).toBeTypeOf('function')
    expect(svc.get('c1' as never)!.canvasPosition?.x).toBe(300)
    expect(await res.undo!()).toBe(true)
    expect(svc.get('c1' as never)!.canvasPosition?.x).toBe(100)
    expect(host.getElement('c1')).toMatchObject({ x: 100, y: 100 })
    expect(await res.rollback!()).toBe(false)
    expect(svc.get('c1' as never)!.canvasPosition?.x).toBe(100)
  })

  it('undo 能恢复 freeform 快照并删除本次新建卡', async () => {
    freeformStore.set(String(CANVAS), [
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    ])
    const svc = makeService([])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const res = await applyOpsAndPersist(
      host,
      before,
      [
        { type: 'free', shape: 'rect', id: 'r1', x: 80, y: 80, w: 10, h: 10 } as DslOp,
        { type: 'card', cardId: 'new-card' as never, x: 120, y: 80, create: true },
      ],
      CANVAS,
      svc,
    )

    expect(res.ok).toBe(true)
    expect(svc.get('new-card' as never)).not.toBeNull()
    expect(await res.undo!()).toBe(true)
    expect(svc.get('new-card' as never)).toBeNull()
    expect(freeformStore.get(String(CANVAS))).toEqual([
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    ])
    expect(host.getElements()).toEqual(before)
  })

  it('undo 遇到提交后用户改动时拒绝覆盖,且仍只消费一次', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const res = await applyOpsAndPersist(
      host,
      before,
      [{ type: 'card', cardId: 'c1' as never, x: 300, y: 200 }],
      CANVAS,
      svc,
    )
    // 模拟用户在 toast 出现后再次移动同一张卡。
    svc.moveToCanvas('c1' as never, { ...svc.get('c1' as never)!.canvasPosition!, x: 500 })
    expect(await res.undo!()).toBe(false)
    expect(svc.get('c1' as never)!.canvasPosition?.x).toBe(500)
    expect(await res.undo!()).toBe(false)
  })
})

describe('buildEmptyHost', () => {
  it('返回空 InMemoryCanvasHost', () => {
    const host = buildEmptyHost()
    expect(host).toBeInstanceOf(InMemoryCanvasHost)
    expect(host.getElements()).toEqual([])
  })
})

/**
 * v5 内容(@title/@content)在 /ask persist 路径的**写回**(原 Corner A,已接通)。
 *
 * applyOpsAndPersist:create 指令把 @title/@content 写进 createWithId;update 指令经
 * post-hoc 回写循环写回 Card.title/body(与几何/颜色同阶段);回滚 / 一次性 undo 均覆盖
 * title/body(无新增数据丢失面)。几何照常写。注:「清空内容」(空串语义)/「无 @pos 纯内容
 * 编辑」仍是 DSL 文法层局限(见 dsl 包 README 已知局限 D/E),与本路径无关。
 */
describe('applyOpsAndPersist — v5 内容写回(@title/@content)', () => {
  beforeEach(() => freeformStore.clear())

  it('card-update 带 @title/@content → title/body 落库(几何照写)', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)]) // title='c1', body=''
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      {
        type: 'card',
        cardId: 'c1' as never,
        x: 300,
        y: 200,
        title: 'NEW TITLE',
        content: 'NEW BODY',
      },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.ok).toBe(true)
    // 几何落库:
    expect(svc.get('c1' as never)!.canvasPosition?.x).toBe(300)
    // 内容落库(原 Corner A 缺口,已接通):
    expect(svc.get('c1' as never)!.title).toBe('NEW TITLE')
    expect(svc.get('c1' as never)!.body).toBe('NEW BODY')
  })

  it('card-create 带 @title/@content → 建卡即带内容(不再落空标题卡)', async () => {
    const svc = makeService([])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      {
        type: 'card',
        cardId: 'new1' as never,
        x: 50,
        y: 60,
        create: true,
        title: 'T',
        content: 'B',
      },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.ok).toBe(true)
    expect(res.cardsCreated).toBe(1)
    expect(svc.get('new1' as never)!.title).toBe('T')
    expect(svc.get('new1' as never)!.body).toBe('B')
  })

  it('纯内容更新(无几何/颜色变化)→ 计 cardsUpdated 且 title/body 落库', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)]) // title='c1', body=''
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      {
        type: 'card',
        cardId: 'c1' as never,
        x: 100, // 同原位,无几何漂移
        y: 100,
        title: '只改标题',
        content: '只改正文',
      },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.ok).toBe(true)
    expect(res.cardsUpdated).toBeGreaterThanOrEqual(1)
    expect(svc.get('c1' as never)!.title).toBe('只改标题')
    expect(svc.get('c1' as never)!.body).toBe('只改正文')
  })

  it('内容更新后 undo → title/body 恢复到 before', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      {
        type: 'card',
        cardId: 'c1' as never,
        x: 100,
        y: 100,
        title: '临时标题',
        content: '临时正文',
      },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.ok).toBe(true)
    // 提交后内容已写(无 impl 时此处即红):
    expect(svc.get('c1' as never)!.title).toBe('临时标题')
    expect(svc.get('c1' as never)!.body).toBe('临时正文')
    expect(res.undo).toBeDefined()
    const undone = await res.undo!()
    expect(undone).toBe(true)
    // undo 后内容恢复到 before(title='c1', body=''):
    expect(svc.get('c1' as never)!.title).toBe('c1')
    expect(svc.get('c1' as never)!.body).toBe('')
  })

  it('service.update 返回 null(内容写失败)→ 整体失败并回滚(title/body/几何维持原值)', async () => {
    const svc = makeService([cardOnCanvas('c1', String(CANVAS), 100, 100)])
    // 让 update 在写 title/body 时返回 null(模拟持久层失败);几何走 moveToCanvas,不受影响。
    const realUpdate = svc.update
    ;(svc as any).update = (id: string, patch: any) => {
      if (patch && (patch.title !== undefined || patch.body !== undefined)) return null
      return (realUpdate as any)(id, patch)
    }
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      {
        type: 'card',
        cardId: 'c1' as never,
        x: 300,
        y: 200,
        title: '应被回滚',
        content: '应被回滚正文',
      },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.ok).toBe(false)
    // 回滚后几何 + 内容均维持原值(无数据丢失):
    expect(svc.get('c1' as never)!.canvasPosition?.x).toBe(100)
    expect(svc.get('c1' as never)!.title).toBe('c1')
    expect(svc.get('c1' as never)!.body).toBe('')
  })

  it('create 带 content 后 undo → 新建卡被 hardDelete(内容随之消失)', async () => {
    const svc = makeService([])
    const { host, before } = await buildCanvasHostForCanvas(CANVAS, svc)
    const ops: DslOp[] = [
      {
        type: 'card',
        cardId: 'new1' as never,
        x: 50,
        y: 60,
        create: true,
        title: '会撤销',
        content: '会撤销正文',
      },
    ]
    const res = await applyOpsAndPersist(host, before, ops, CANVAS, svc)
    expect(res.ok).toBe(true)
    expect(svc.get('new1' as never)!.title).toBe('会撤销')
    const undone = await res.undo!()
    expect(undone).toBe(true)
    expect(svc.get('new1' as never)).toBeNull() // hardDelete
  })
})
