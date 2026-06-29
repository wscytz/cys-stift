/**
 * 自动布局(Batch A / 方向 1)— 把画布的 card + arrow 关系拓扑喂给 dagre,
 * 跑分层布局(Sugiyama),读回每个 card 的 {x,y},供 applyLayout 单步应用。
 *
 * ## 为什么放 web 层而非 canvas-engine
 * canvas-engine 设计目标是零外部依赖(可独立成包)。dagre 是外部依赖,放进来
 * 会破坏引擎纯净。布局算法是"业务编排"(取元素→建图→应用坐标),引擎只提供
 * getElements(),算法本身属 web 业务层。
 *
 * ## 选中范围语义
 * - opts.targetIds 传空 = 全画布所有 card 参与
 * - opts.targetIds 传 N≥2 个 id = 只布局这些 card(局部重排),其余不动
 * arrow 边集:只取两端都在参与集合内的 arrow(避免拉外部 card 进来)。
 *
 * ## 处理的边界
 * - 空 card / 单 card 无 arrow → 返回原位(不丢失)
 * - 环依赖(A→B→C→A) → dagre 自动断环,不崩
 * - 孤立 card(无边) → dagre 给 rank,不丢
 * - freeform 元素(text/rect/frame/freedraw) → 本函数不碰,调用方负责提示
 */
import dagre from 'dagre'
import type { CanvasElement } from '@cys-stift/canvas-engine'

export interface AutoLayoutOptions {
  /** 参与布局的 card id 集合。空 = 全画布。非空 = 只布局这些(局部)。 */
  targetIds?: Set<string>
  /** 节点间距(卡与卡之间的空隙),dagre nodesep/ranksep 默认用此值。默认 60。 */
  gap?: number
}

export interface LayoutPosition {
  x: number
  y: number
}

/**
 * 算自动布局。返回 Map<cardId, {x,y}> —— cardId 是 CanvasElement.id(=== CardId)。
 * 调用方拿这个 Map 去 applyLayout 或直接 batch upsert(保留各 card 原 w/h/rotation)。
 *
 * 纯函数:输入 elements + opts,输出坐标 Map,不碰 host。便于单测。
 */
export function computeAutoLayout(
  elements: CanvasElement[],
  opts: AutoLayoutOptions = {},
): Map<string, LayoutPosition> {
  const gap = opts.gap ?? 60
  const result = new Map<string, LayoutPosition>()

  // 1. 分离 card 节点 + arrow 边。
  // targetIds 给定时只取在集合内的 card;否则取全部 card。
  const target = opts.targetIds
  const cards = elements.filter(
    (e) => e.kind === 'card' && (!target || target.has(e.id)),
  )
  if (cards.length === 0) return result

  // 单 card:原地返回(无关系可排,dagre 也只给单点,没意义挪动)。
  if (cards.length === 1) {
    result.set(cards[0]!.id, { x: cards[0]!.x, y: cards[0]!.y })
    return result
  }

  const cardIds = new Set(cards.map((c) => c.id))
  // arrow 边:两端都在参与集合内才算(from/to 引用 cardId)。
  const edges = elements.filter(
    (e) =>
      e.kind === 'arrow' &&
      e.from &&
      e.to &&
      cardIds.has(e.from) &&
      cardIds.has(e.to),
  )

  // 2. 建 dagre 图。
  const g = new dagre.graphlib.Graph()
  // rankdir: 'TB' 顶层→底层(思维导图/流程图最自然);nodesep 同层间距;ranksep 层间距。
  g.setGraph({ rankdir: 'TB', nodesep: gap, ranksep: gap, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const c of cards) {
    // dagre 要节点尺寸算布局;用 card 实际 w/h(防重叠)。
    g.setNode(c.id, { width: c.w, height: c.h })
  }
  for (const e of edges) {
    // 同 from→to 去重(dagre 多重同向边会让布局怪);setEdge 幂等。
    g.setEdge(e.from!, e.to!)
  }

  // 3. 跑布局。
  dagre.layout(g)

  // 4. 读回坐标。dagre 给的是节点中心(x,y),转成左上角(我们 CanvasElement 用左上角)。
  for (const c of cards) {
    const node = g.node(c.id)
    if (!node) continue
    result.set(c.id, {
      x: Math.round(node.x - c.w / 2),
      y: Math.round(node.y - c.h / 2),
    })
  }

  return result
}
