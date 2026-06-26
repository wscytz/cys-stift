import type { CardId } from '@cys-stift/domain'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import { inferRelationType, type RelationType } from './relation-types'

/**
 * Backlink(相关的卡)— 关系网可消费侧。
 *
 * 关系箭头此前只能「画出来」,不能「查」:画了 A→B(blocks)后,在 B 看不到「A 阻塞
 * 我」。Backlink 让语义关系从单向绘制变双向可查,放大关系箭头价值(转义/语义关系是
 * 核心卖点,这是它的「消费」侧,互补 Outline 的结构侧)。
 *
 * 纯函数:遍历 host 元素找 kind==='arrow' 且 from/to 命中目标卡,分两组——
 * incoming(指向本卡)/ outgoing(本卡指出)。每条带对方卡 id + 关系类型(从 arrow
 * 颜色/text 反推,复用 inferRelationType,与 RelationPanel 同源)。R2 安全:只读
 * arrow 的 from/to/color/text,不碰 freedraw 点序列。
 */
export interface Backlink {
  /** 对方卡的 id(箭头另一端的 card 元素 id = CardId)。 */
  otherCardId: string
  /** 关系类型(null = 未标注类型的关系箭头)。 */
  relation: RelationType | null
  /** arrow 元素 id(点击跳转可选中箭头)。 */
  arrowId: string
}

export interface Backlinks {
  incoming: Backlink[] // 指向本卡:arrow.to === cardId,other = from
  outgoing: Backlink[] // 本卡指出:arrow.from === cardId,other = to
}

/**
 * 查目标卡在当前画布上的相关关系箭头。host 为 null(画布外打开)→ 空。
 * getCardTitle 用于调用方渲染,此处不依赖(只返 id)。
 */
export function findBacklinks(host: CanvasHost | null, cardId: CardId): Backlinks {
  if (!host) return { incoming: [], outgoing: [] }
  const incoming: Backlink[] = []
  const outgoing: Backlink[] = []
  for (const el of host.getElements()) {
    if (el.kind !== 'arrow') continue
    if (!el.from || !el.to) continue // 自由箭头无端点卡,不进 backlink
    if (el.to === cardId) {
      incoming.push({ otherCardId: el.from, relation: inferRelationType(el), arrowId: el.id })
    } else if (el.from === cardId) {
      outgoing.push({ otherCardId: el.to, relation: inferRelationType(el), arrowId: el.id })
    }
  }
  return { incoming, outgoing }
}

/** 避免重复导入 CanvasElement 类型给调用方。 */
export type { CanvasElement }
