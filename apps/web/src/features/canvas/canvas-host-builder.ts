'use client'

/**
 * canvas-host-builder — 为 /ask agent 构建目标画布的临时 host + 应用 DSL 后落库。
 *
 * 【为什么需要它】/ask 页不在画布上,无实时 CanvasHost(那只在 /canvas 页挂载存活)。
 * 但 agent 改画布要复用 applyLayout(它为 host 设计)。本模块用 InMemoryCanvasHost
 * 临时装载目标画布的完整状态(cards + freeform),让 applyLayout / diffCanvasSnapshots
 * 能脱离 /canvas 页运行。
 *
 * 【构建】buildCanvasHostForCanvas:new InMemoryCanvasHost → loadCardsIntoEditor
 * (cards via cardToElement)+ freeform elements(store.load)。这是只读快照,不写真实
 * /canvas 的 host(临时 host 用完即弃)。
 *
 * 【落库】applyOpsAndPersist:在临时 host 上 applyLayout → 把 after 的 freeform
 * 存回 store + card 位置/颜色回写 CardService(因为 card 几何活在 CardService 的
 * canvasPosition,不在 freeform store)+ onCardCreate 落 service.createWithId。
 * 这模拟了 /canvas 页 bindCardWriteback + freeform 持久化做的事,但一次性同步落库。
 *
 * R2 安全:只读 CardService 的 listOnCanvas / canvasPosition / update / createWithId,
 * 不碰 deviceId / media.dataUrl。freeform store 本就不含 card 内容。
 */
import { InMemoryCanvasHost, type CanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import type { CanvasId, CardId, CardService, Card, ColorToken } from '@cys-stift/domain'
import { canvasFreeformStore } from '@/lib/canvas-freeform-store'
import { loadCardsIntoEditor, cardToElement, elementToCardPosition } from './canvas-binding'
import { applyLayout, type ApplyOpResult } from './apply-layout'
import type { SanitizeDiagnostic } from '@/features/ai/dsl-sanitize'
import type { DslOp } from '@/features/ai/dsl-parser'
import { freeformElementsOf } from './canvas-freeform-binding'

/**
 * 构建目标画布的临时 host(只读快照):cards(listOnCanvas 过滤 archived/deleted)
 * + freeform(store.load)。返回 host + 初始 elements(before 状态)。
 *
 * 用于 /ask agent 的 diff 预览 + applyOpsAndPersist 应用前构建。
 */
export async function buildCanvasHostForCanvas(
  canvasId: CanvasId,
  service: CardService,
): Promise<{ host: InMemoryCanvasHost; before: CanvasElement[] }> {
  const host = new InMemoryCanvasHost()
  // cards:复用 loadCardsIntoEditor(已处理 archived/deleted 过滤 + z 序 + drift reconcile)。
  loadCardsIntoEditor(host, service, canvasId)
  // freeform:store.load 拿非卡片元素,upsert 进 host(applyWithoutEcho 不触发监听)。
  const snap = await canvasFreeformStore.load(canvasId)
  if (snap) {
    host.applyWithoutEcho(() => {
      for (const el of snap.elements) host.upsert(el)
    })
  }
  return { host, before: host.getElements() }
}

/** applyOpsAndPersist 的结果(复用 applyLayout 的 ApplyResult + 落库计数)。 */
export interface PersistResult {
  /** 是否完成了持久化事务。false 表示已回滚，调用方不得把本次操作当成功。 */
  ok: boolean
  /** 与 ok 同义的显式提交标记，供数据层调用方避免把 undefined 当成功。 */
  committed: boolean
  total: number
  applied: number
  skipped: number
  failed: number
  opResults: ApplyOpResult[]
  /** card 位置/颜色回写数。 */
  cardsUpdated: number
  /** 新建 card 数(create 指令)。 */
  cardsCreated: number
  /** create 指令落库失败数(配额满/ID 冲突;case 2a 不再静默吞,调用方可 toast)。 */
  cardsFailed: number
  /** 已存在卡片的位置/颜色回写失败数。 */
  cardUpdatesFailed: number
  /** Sanitize 诊断(引用不存在的卡/端点等,case 1/11/7);有则挂,无则 undefined。 */
  sanitizeDiagnostics?: SanitizeDiagnostic[]
  /** freeform 元素变更数(added + updated + removed)。 */
  freeformChanged: number
  /** 成功提交后可执行一次的撤销。第二次调用返回 false。 */
  undo?: () => Promise<boolean>
  /** rollback 是 undo 的语义别名，二者共享同一个一次性门。 */
  rollback?: () => Promise<boolean>
  /** 事务失败的可读原因。 */
  failureReason?: string
}

/**
 * 在目标画布的临时 host 上应用 DSL ops,并把结果落库:
 *  - freeform 元素 → canvasFreeformStore.save
 *  - card 位置/颜色变更 → service.update(canvasPosition + color)
 *  - create card 指令 → service.createWithId(空标题卡,几何来自 DSL)
 *
 * 不碰真实 /canvas host —— 落库后 /canvas 页若已打开,freeform store 的订阅 +
 * CardService 的订阅会触发 re-load/re-render(跨页同步靠 store 订阅机制)。
 *
 * @param host 已构建好的目标画布临时 host(buildCanvasHostForCanvas 产物)
 * @param before 应用前的 elements(buildCanvasHostForCanvas 的 before,用于对比 card 变更)
 */
export async function applyOpsAndPersist(
  host: InMemoryCanvasHost,
  before: CanvasElement[],
  ops: DslOp[],
  canvasId: CanvasId,
  service: CardService,
): Promise<PersistResult> {
  // 事务快照必须在 applyLayout 之前取得。CardService 返回的 Card 可能是
  // repository 内部对象，不能直接持有引用，否则后续 update 会污染回滚基线。
  const beforeFreeform = await canvasFreeformStore.load(canvasId)
  const beforeCards = new Map<CardId, Card>()
  for (const element of before) {
    if (element.kind !== 'card') continue
    const card = service.get(cardIdFromElement(element.id))
    if (card) beforeCards.set(card.id, cloneCard(card))
  }

  // createWithId 成功后即记录 id。即使随后 host.upsert 或 freeform 写失败，
  // 也必须把这张尚未可见的 ghost card 一并清掉。
  const createdCardIds: CardId[] = []
  // onCardCreate:create 指令落 service.createWithId(空标题卡,几何 + 颜色来自 DSL)。
  // 后续 applyLayout 会在 host 里 upsert 该 card 元素,统一进 after 回写。
  const result = applyLayout(host, ops, undefined, ({ cardId, x, y, w, h, color }) => {
    // createWithId:DSL 指定 id 建卡。空标题 + 空 body,用户后续编辑。
    try {
      service.createWithId(cardId as CardId, {
        title: '',
        body: '',
        type: 'note',
        canvasPosition: { canvasId, x, y, w, h, z: Date.now(), rotation: 0 },
        ...(color ? { color: color as ColorToken } : {}),
        source: { kind: 'manual', deviceId: 'ask-agent' },
      })
      createdCardIds.push(cardId as CardId)
      return { ok: true }
    } catch (err) {
      console.error('[canvas-host-builder] createWithId failed', cardId, err)
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      }
    }
  })
  const cardsCreated = result.cardsCreated
  const cardsFailed = result.opResults.filter(
    (entry) => entry.status === 'failed' && entry.op.type === 'card' && entry.op.create,
  ).length
  const touchedExistingCardIds = new Set<CardId>(
    result.opResults
      .filter(
        (entry) =>
          entry.status === 'applied' &&
          entry.op.type === 'card' &&
          !entry.op.create,
      )
      .map((entry) => (entry.op as Extract<DslOp, { type: 'card' }>).cardId as CardId),
  )

  const after = host.getElements()

  // 还原 host + store + CardService 的共同快照。失败路径直接调用
  // restoreNow；成功路径把同一实现包成一次性 undo/rollback。
  const restoreNow = async (): Promise<boolean> => {
    let ok = true

    // 先恢复 freeform 持久层。save/remove 的旧实现有的返回 void，只有明确
    // false 才代表失败，兼容现有测试 double 与旧 adapter。
    try {
      const restored = beforeFreeform
        ? await canvasFreeformStore.save(canvasId, cloneCanvasElements(beforeFreeform.elements))
        : await canvasFreeformStore.remove(canvasId)
      if (restored === false) ok = false
    } catch (error) {
      ok = false
      console.warn('[canvas-host-builder] freeform rollback failed', error)
    }

    // 删除本次新建卡。hardDelete 是 CardService 的正式恢复入口。
    for (const id of createdCardIds) {
      try {
        const deleted = service.hardDelete(id)
        if (deleted === false) ok = false
      } catch (error) {
        ok = false
        console.warn('[canvas-host-builder] created card rollback failed', id, error)
      }
    }

    // 恢复已有卡的几何与颜色。applyOpsAndPersist 只会写这两个字段，因此不
    // 触碰正文、媒体、标签等用户数据；每个明确 false/null 都计为恢复失败。
    for (const id of touchedExistingCardIds) {
      const previous = beforeCards.get(id)
      if (!previous) {
        ok = false
        continue
      }
      const current = service.get(id)
      if (!current || current.deletedAt) {
        ok = false
        continue
      }
      if (previous.canvasPosition) {
        if (!sameCanvasPosition(current.canvasPosition, previous.canvasPosition)) {
          try {
            if (service.moveToCanvas(id, cloneCanvasPosition(previous.canvasPosition)) === false) ok = false
          } catch (error) {
            ok = false
            console.warn('[canvas-host-builder] card position rollback failed', id, error)
          }
        }
      } else if (current.canvasPosition) {
        try {
          if (service.removeFromCanvas(id) === false) ok = false
        } catch (error) {
          ok = false
          console.warn('[canvas-host-builder] card canvas rollback failed', id, error)
        }
      }
      const previousColor = previous.color ?? null
      if ((current.color ?? null) !== previousColor) {
        try {
          const restored = service.update(id, { color: previousColor }) as unknown
          if (restored === null || restored === false || restored === undefined) ok = false
        } catch (error) {
          ok = false
          console.warn('[canvas-host-builder] card color rollback failed', id, error)
        }
      }
    }

    // 临时 host 不会再被页面使用，但恢复它可以让定向测试和任何持有引用的
    // 调用方看到一致状态；applyWithoutEcho 避免制造额外 undo/writeback。
    try {
      host.applyWithoutEcho(() => {
        const ids = host.getElements().map((element) => element.id)
        for (const id of ids) host.remove(id)
        for (const element of before) host.upsert(cloneCanvasElement(element))
      })
    } catch (error) {
      ok = false
      console.warn('[canvas-host-builder] host rollback failed', error)
    }
    return ok
  }

  const makeFailure = async (reason: string, extraFailed = 0): Promise<PersistResult> => {
    const rollbackOk = await restoreNow()
    // 整体回滚后，所有原本 applied 的 mutation 都不再算成功；保留 skipped，
    // 并把 rolled-back applied 显式标成 failed，避免 UI/日志误报成功。
    const opResults = result.opResults.map((entry) =>
      entry.status === 'applied'
        ? { ...entry, status: 'failed' as const, reason: `rolled back: ${reason}` }
        : entry,
    )
    // PersistResult keeps ApplyResult's count invariant. Storage-layer failures
    // without a matching DSL item stay visible through ok/failureReason and
    // cardUpdatesFailed instead of inflating the operation total.
    const failed = opResults.filter((entry) => entry.status === 'failed').length
    const persistResult: PersistResult = {
      ok: false,
      committed: false,
      total: result.total,
      applied: 0,
      skipped: opResults.filter((entry) => entry.status === 'skipped').length,
      failed,
      opResults,
      cardsUpdated: 0,
      cardsCreated: 0,
      cardsFailed,
      cardUpdatesFailed: extraFailed,
      freeformChanged: 0,
      failureReason: `${reason}${rollbackOk ? '' : ' (rollback incomplete)'}`,
    }
    if (result.sanitizeDiagnostics && result.sanitizeDiagnostics.length > 0) {
      persistResult.sanitizeDiagnostics = result.sanitizeDiagnostics
    }
    return persistResult
  }

  // ── freeform 落库:after 的非 card 元素全量存回 store。
  const freeformAfter = freeformElementsOf(after)
  const freeformBefore = freeformElementsOf(before)
  let freeformSaved = false
  try {
    freeformSaved = await canvasFreeformStore.save(canvasId, freeformAfter)
  } catch (error) {
    console.error('[canvas-host-builder] freeform save threw', error)
  }
  if (freeformSaved === false) {
    return makeFailure('freeform save failed')
  }
  // 变更数 = added + updated + removed(原公式 |Δlen| + (added+updated) 漏算 removed、
  // 重复算 added,加+删混合时错;改正确三和)。beforeById 降查找 O(n²)→O(n)。
  const beforeById = new Map(freeformBefore.map((el) => [el.id, el]))
  const afterIds = new Set(freeformAfter.map((el) => el.id))
  let freeformAdded = 0
  let freeformUpdated = 0
  for (const a of freeformAfter) {
    const b = beforeById.get(a.id)
    if (!b) freeformAdded++
    else if (JSON.stringify(b) !== JSON.stringify(a)) freeformUpdated++
  }
  const freeformRemoved = freeformBefore.filter((b) => !afterIds.has(b.id)).length
  const freeformChanged = freeformAdded + freeformUpdated + freeformRemoved

  // ── card 回写:after 的 card 元素,位置/颜色变了就 service.update。
  let cardsUpdated = 0
  let cardUpdatesFailed = 0
  const afterCards = after.filter((el) => el.kind === 'card')
  for (const el of afterCards) {
    const cardId = cardIdFromElement(el.id)
    // createWithId already persisted new cards with their final geometry/color;
    // unrelated cards must not be rewritten or counted by this transaction.
    if (!touchedExistingCardIds.has(cardId)) continue
    const card = service.get(cardId)
    if (!card || card.deletedAt) {
      cardUpdatesFailed++
      continue
    }
    const existingZ = card.canvasPosition?.z ?? 0
    const newPos = elementToCardPosition(el, canvasId, existingZ)
    const drifted =
      card.canvasPosition?.x !== newPos.x ||
      card.canvasPosition?.y !== newPos.y ||
      card.canvasPosition?.w !== newPos.w ||
      card.canvasPosition?.h !== newPos.h ||
      card.canvasPosition?.rotation !== newPos.rotation
    const colorChanged = el.color && el.color !== card.color
    if (drifted) {
      // 位置/尺寸变更走 moveToCanvas(canvasPosition 的正规入口)。
      let moved = false
      try {
        moved = service.moveToCanvas(card.id, newPos)
      } catch (error) {
        console.error('[canvas-host-builder] moveToCanvas failed', card.id, error)
      }
      if (moved === false) {
        cardUpdatesFailed++
        continue
      }
      if (colorChanged) {
        let updated: unknown = null
        try {
          updated = service.update(card.id, { color: el.color as ColorToken }) as unknown
        } catch (error) {
          console.error('[canvas-host-builder] card color update failed', card.id, error)
        }
        if (updated === null || updated === false || updated === undefined) {
          cardUpdatesFailed++
          continue
        }
      }
      cardsUpdated++
    } else if (colorChanged) {
      let updated: unknown = null
      try {
        updated = service.update(card.id, { color: el.color as ColorToken }) as unknown
      } catch (error) {
        console.error('[canvas-host-builder] card color update failed', card.id, error)
      }
      if (updated === null || updated === false || updated === undefined) {
        cardUpdatesFailed++
        continue
      }
      cardsUpdated++
    }
  }

  if (cardUpdatesFailed > 0) {
    return makeFailure('card persistence failed', cardUpdatesFailed)
  }

  const changed = result.applied > 0 || cardsCreated > 0 || cardsUpdated > 0 || freeformChanged > 0
  const committedCards = new Map<CardId, Card>()
  for (const id of [...touchedExistingCardIds, ...createdCardIds]) {
    const card = service.get(id)
    if (card) committedCards.set(id, cloneCard(card))
  }
  const matchesCommittedState = async (): Promise<boolean> => {
    try {
      const currentFreeform = await canvasFreeformStore.load(canvasId)
      if (
        canvasElementsRevision(currentFreeform?.elements ?? []) !==
        canvasElementsRevision(freeformAfter)
      ) return false
    } catch {
      return false
    }
    for (const id of touchedExistingCardIds) {
      const current = service.get(id)
      const committed = committedCards.get(id)
      if (
        !current ||
        !committed ||
        !sameCanvasPosition(current.canvasPosition, committed.canvasPosition) ||
        (current.color ?? null) !== (committed.color ?? null)
      ) return false
    }
    // A user may start editing a newly created card immediately. Never hard
    // delete that work: only undo the create while the whole card still equals
    // the committed snapshot.
    for (const id of createdCardIds) {
      const current = service.get(id)
      const committed = committedCards.get(id)
      if (!current || !committed || cardRevision(current) !== cardRevision(committed)) return false
    }
    return true
  }
  let undoUsed = false
  const undoOnce = async (): Promise<boolean> => {
    if (undoUsed) return false
    undoUsed = true
    if (!await matchesCommittedState()) return false
    return restoreNow()
  }

  const persistResult: PersistResult = {
    ok: true,
    committed: true,
    total: result.total,
    applied: result.applied,
    skipped: result.skipped,
    failed: result.failed,
    opResults: result.opResults,
    cardsUpdated,
    cardsCreated,
    cardsFailed,
    cardUpdatesFailed,
    freeformChanged,
  }
  if (changed) {
    persistResult.undo = undoOnce
    persistResult.rollback = undoOnce
  }
  // 透出 sanitizeDiagnostics(让 /ask temp 路径也能 toast 引用不存在的卡/端点)
  if (result.sanitizeDiagnostics && result.sanitizeDiagnostics.length > 0) {
    persistResult.sanitizeDiagnostics = result.sanitizeDiagnostics
  }
  return persistResult
}

/** 从 host element id 还原 CardId(card 元素 id 就是 String(card.id))。 */
function cardIdFromElement(elId: string): CardId {
  return elId as unknown as CardId
}

function cloneCanvasPosition(position: NonNullable<Card['canvasPosition']>): NonNullable<Card['canvasPosition']> {
  return { ...position }
}

function sameCanvasPosition(
  left: Card['canvasPosition'],
  right: Card['canvasPosition'],
): boolean {
  if (!left || !right) return left === right
  return left.canvasId === right.canvasId &&
    left.x === right.x &&
    left.y === right.y &&
    left.w === right.w &&
    left.h === right.h &&
    left.z === right.z &&
    left.rotation === right.rotation
}

/** Snapshot helpers intentionally copy nested mutable fields used by cards and
 * freedraw elements. A JSON round-trip would turn Date metadata into strings,
 * which is a poor boundary for CardService rollback. */
function cloneCard(card: Card): Card {
  return {
    ...card,
    source: { ...card.source },
    media: (card.media ?? []).map((item) => ({ ...item })),
    links: (card.links ?? []).map((item) => ({ ...item })),
    codeSnippets: (card.codeSnippets ?? []).map((item) => ({ ...item })),
    quotes: (card.quotes ?? []).map((item) => ({ ...item })),
    tags: (card.tags ?? []).map((item) => ({ ...item })),
    capturedAt: new Date(card.capturedAt),
    createdAt: new Date(card.createdAt),
    updatedAt: new Date(card.updatedAt),
    ...(card.canvasPosition ? { canvasPosition: cloneCanvasPosition(card.canvasPosition) } : {}),
    ...(card.deletedAt ? { deletedAt: new Date(card.deletedAt) } : {}),
  }
}

function cloneCanvasElement(element: CanvasElement): CanvasElement {
  return {
    ...element,
    ...(element.curve ? { curve: { ...element.curve } } : {}),
    ...(element.elbow ? { elbow: element.elbow.map((point) => ({ ...point })) } : {}),
    ...(element.meta
      ? {
          meta: {
            ...element.meta,
            ...(Array.isArray(element.meta.points)
              ? {
                  points: (element.meta.points as unknown[]).map((point) =>
                    Array.isArray(point) ? [...point] : point,
                  ),
                }
              : {}),
          },
        }
      : {}),
  }
}

function cloneCanvasElements(elements: readonly CanvasElement[]): CanvasElement[] {
  return elements.map(cloneCanvasElement)
}

function canvasElementsRevision(elements: readonly CanvasElement[]): string {
  return JSON.stringify(
    cloneCanvasElements(elements).sort((left, right) => left.id.localeCompare(right.id)),
  )
}

function cardRevision(card: Card): string {
  return JSON.stringify(cloneCard(card))
}

/** 构建一个空 host(无 cards/freeform),供纯 freeform 场景或测试用。 */
export function buildEmptyHost(): InMemoryCanvasHost {
  return new InMemoryCanvasHost()
}

export type { CanvasHost, CanvasElement, Card }
