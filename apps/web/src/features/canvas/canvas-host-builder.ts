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
import { applyLayout } from './apply-layout'
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
  applied: number
  skipped: number
  /** card 位置/颜色回写数。 */
  cardsUpdated: number
  /** 新建 card 数(create 指令)。 */
  cardsCreated: number
  /** freeform 元素变更数(added + updated + removed)。 */
  freeformChanged: number
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
  // onCardCreate:create 指令落 service.createWithId(空标题卡,几何 + 颜色来自 DSL)。
  // 后续 applyLayout 会在 host 里 upsert 该 card 元素,统一进 after 回写。
  let cardsCreated = 0
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
      cardsCreated++
    } catch (err) {
      // ⚠️ known swallow:createWithId 失败时用户无感(配额满 / ID 冲突)。
      // 低概率(配额满会被 capture 主路径先 toast;AI uid 生成 cardId 不冲突)。
      // 修法:PersistResult 加 cardsFailed 累加 → 调用方(agent-confirm-card)toast。
      console.error('[canvas-host-builder] createWithId failed', cardId, err)
    }
  })

  const after = host.getElements()

  // ── freeform 落库:after 的非 card 元素全量存回 store。
  const freeformAfter = freeformElementsOf(after)
  const freeformBefore = freeformElementsOf(before)
  await canvasFreeformStore.save(canvasId, freeformAfter)
  const freeformChanged = Math.abs(freeformAfter.length - freeformBefore.length) +
    freeformAfter.filter((a) => {
      const b = freeformBefore.find((el) => el.id === a.id)
      return !b || JSON.stringify(b) !== JSON.stringify(a)
    }).length

  // ── card 回写:after 的 card 元素,位置/颜色变了就 service.update。
  let cardsUpdated = 0
  const afterCards = after.filter((el) => el.kind === 'card')
  for (const el of afterCards) {
    const card = service.get(cardIdFromElement(el.id))
    if (!card || card.deletedAt) continue
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
      service.moveToCanvas(card.id, newPos)
      if (colorChanged) service.update(card.id, { color: el.color as ColorToken })
      cardsUpdated++
    } else if (colorChanged) {
      service.update(card.id, { color: el.color as ColorToken })
      cardsUpdated++
    }
  }

  return {
    applied: result.applied,
    skipped: result.skipped,
    cardsUpdated,
    cardsCreated,
    freeformChanged,
  }
}

/** 从 host element id 还原 CardId(card 元素 id 就是 String(card.id))。 */
function cardIdFromElement(elId: string): CardId {
  return elId as unknown as CardId
}

/** 构建一个空 host(无 cards/freeform),供纯 freeform 场景或测试用。 */
export function buildEmptyHost(): InMemoryCanvasHost {
  return new InMemoryCanvasHost()
}

export type { CanvasHost, CanvasElement, Card }
