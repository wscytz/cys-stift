'use client'

/**
 * relation-builder — 详情页建/删关系(RB-T1)。
 *
 * 与 BR-T2(embed-links / wiki-links)不同,本层是**手动关系**:用户在卡片详情页
 * 显式选一个 RelationType,建一条语义箭头;或删一条。它**不依赖画布 host**:
 * 详情页此刻画布可能尚未挂载(用户根本没开画布),所以直接读写 default canvas
 * 的 freeform store(透明 `CanvasElement[]`,与画布 host 的 `.cystift` 序列化同源,
 * 画布打开后会被 `canvas-freeform-binding` 加载进 host)。
 *
 * 手动关系的视觉签名直接来自 `RelationType`(color + dash + arrowhead 三维,
 * text label = type.id),让画布打开后 `inferRelationType` 能反推出关系类型,
 * RelationPanel / GraphCanvas 都能正确显示。区别于自动关系:手动关系**不带 meta**
 * (wikilink 自动箭头带 `meta.wikilink`,embed 自动箭头带 `meta.embed`)——
 * 删手动关系时不会被自动同步逻辑误碰,反之亦然。
 */
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { canvasFreeformStore } from '@/lib/canvas-freeform-store'
import { DEFAULT_CANVAS_ID } from './default-canvas'
import type { RelationType } from './relation-types'

/** 生成元素 id:优先 crypto.randomUUID(Node 现代环境 / 浏览器都有),回退 Date+random。 */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `arrow-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 在 default canvas 建一条手动语义关系箭头(from → to)。
 *
 * - load 现有 freeform 元素(为空则从 [] 开始);
 * - push 一条 arrow,签名取自 RelationType(color/dash/arrowhead),text = type.id;
 * - 不设 meta(手动关系标记:区别 wikilink/embed 自动关系);
 * - save 回 store。
 *
 * @returns 新建的 arrow id(供后续 removeRelation / UI 高亮定位)。
 */
export async function addRelation(
  from: string,
  to: string,
  type: RelationType,
): Promise<string> {
  const snapshot = await canvasFreeformStore.load(DEFAULT_CANVAS_ID)
  const elements = snapshot ? snapshot.elements : []

  const id = genId()
  const arrow: CanvasElement = {
    id,
    kind: 'arrow',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    from,
    to,
    color: type.color,
    dash: type.dash,
    arrowhead: type.arrowhead,
    text: type.id,
  }

  await canvasFreeformStore.save(DEFAULT_CANVAS_ID, [...elements, arrow])
  return id
}

/**
 * 从 default canvas 删一条手动关系箭头(按 arrow id)。
 *
 * id 不存在时 no-op(不抛、不误删其他元素)。load → filter 掉该 id → save。
 */
export async function removeRelation(arrowId: string): Promise<void> {
  const snapshot = await canvasFreeformStore.load(DEFAULT_CANVAS_ID)
  if (!snapshot) return

  const elements = snapshot.elements.filter((el) => el.id !== arrowId)
  await canvasFreeformStore.save(DEFAULT_CANVAS_ID, elements)
}
