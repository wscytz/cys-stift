/**
 * 整理(Batch 6 / 整理范式)— 把画布的 card + arrow 关系拓扑喂给 dagre
 * 或纯几何网格算法,跑出每个 card 的 {x,y},供 applyLayout 单步应用。
 *
 * ## 为什么放 web 层而非 canvas-engine
 * canvas-engine 设计目标是零外部依赖(可独立成包)。dagre 是外部依赖,放进来
 * 会破坏引擎纯净。布局算法是"业务编排"(取元素→建图→应用坐标),引擎只提供
 * getElements(),算法本身属 web 业务层。
 *
 * ## 策略(strategy)× 方向(direction)× 间距(gap)
 * - mindmap(思维导图):dagre 分层,rankdir = direction(默认 TB),nodesep=gap,
 *   ranksep = gap*1.5(层间距更宽,思维导图可读)。这是 v0.42 之前的老行为泛化。
 * - flow(流程图):dagre 分层,默认 direction LR,nodesep=gap,ranksep = gap*2
 *   (横向流水线,层间距更宽)。
 * - grid(网格):纯几何(不走 dagre)。按 id 排序定稳定顺序(CanvasElement 无 title
 *   字段,title 在 Card 实体上;保纯签名不传 resolver),
 *   cols = ceil(sqrt(n)),按 direction 决定填充走向(TB 行优先 / LR 列优先 /
 *   BT 上下镜像 / RL 左右镜像)。每卡用自己的 w/h。
 * - pack(紧凑):grid 同款几何,但 effectiveGap = gap*0.5、cols = round(sqrt(n))
 *   (更紧凑),结果按原质心居中。文档化:cols 选 round(更小)以压紧。
 *
 * ## 选中范围语义
 * - opts.targetIds 传空 = 全画布所有 card 参与
 * - opts.targetIds 传 N≥2 个 id = 只布局这些 card(局部重排),其余不动
 * arrow 边集(mindmap/flow):只取两端都在参与集合内的 arrow(避免拉外部 card)。
 * grid/pack 不读 arrow(纯几何)。
 *
 * ## 处理的边界
 * - 空 card / 单 card 无 arrow → 返回原位(不丢失)
 * - 环依赖(A→B→C→A) → dagre 自动断环,不崩
 * - 孤立 card(无边) → dagre 给 rank,不丢;grid/pack 按排序进网格
 * - freeform 元素(text/rect/frame/freedraw) → 本函数不碰,调用方负责提示
 *
 * ## 纯函数
 * 输入 elements + opts,输出坐标 Map,不碰 host。便于单测。无 Math.random / Date.now。
 */
import dagre from 'dagre'
import type { CanvasElement } from '@cys-stift/canvas-engine'

/** 整理策略。 */
export type OrganizeStrategy = 'mindmap' | 'flow' | 'grid' | 'pack'
/** 整理方向(rankdir 语义;grid/pack 决定填充走向与镜像)。 */
export type OrganizeDirection = 'TB' | 'LR' | 'RL' | 'BT'

export interface AutoLayoutOptions {
  /** 参与布局的 card id 集合。空 = 全画布。非空 = 只布局这些(局部)。 */
  targetIds?: Set<string>
  /** 节点间距(卡与卡之间的空隙),dagre nodesep/grid 间距默认用此值。默认 60。 */
  gap?: number
  /** 整理策略。默认 mindmap(dagre 分层)。 */
  strategy?: OrganizeStrategy
  /** 整理方向。默认 TB(mindmap)/ LR(flow);grid/pack 决定填充走向。 */
  direction?: OrganizeDirection
}

export interface LayoutPosition {
  x: number
  y: number
}

/**
 * 位置有限性守卫:computed 非有限(NaN/Infinity)→ 回落 card 原坐标。
 * 防「某卡 w/h 损坏(Infinity)→ maxW=Infinity → 全盘位置 NaN → 写进 host →
 * JSON.stringify(NaN)=null → reload 变 0」的静默坐标损坏(同 applyLayout finiteRound 防的类)。
 * 原坐标也非有限时(卡本就已损坏)原样保留 —— 至少 organize 不引入新损坏。
 */
function finitePos(computed: { x: number; y: number }, orig: CanvasElement): LayoutPosition {
  return {
    x: Number.isFinite(computed.x) ? Math.round(computed.x) : orig.x,
    y: Number.isFinite(computed.y) ? Math.round(computed.y) : orig.y,
  }
}

/** 仅取有限 w/h 算 max(损坏卡的 Infinity/NaN 不参与,免毒化 step)。 */
function finiteMax(nums: number[]): number {
  let m = 0
  for (const n of nums) if (Number.isFinite(n) && n > m) m = n
  return m
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
  const strategy = opts.strategy ?? 'mindmap'
  // 默认方向:mindmap→TB;flow→LR;grid/pack 方向仅影响填充走向,默认 TB。
  const direction: OrganizeDirection = opts.direction ?? (strategy === 'flow' ? 'LR' : 'TB')
  const result = new Map<string, LayoutPosition>()

  // 1. 分离 card 节点。targetIds 给定时只取在集合内的 card;否则取全部 card。
  const target = opts.targetIds
  const cards = elements.filter(
    (e) => e.kind === 'card' && (!target || target.has(e.id)),
  )
  if (cards.length === 0) return result

  // 单 card:原地返回(无关系可排,挪动没意义)。
  if (cards.length === 1) {
    result.set(cards[0]!.id, { x: cards[0]!.x, y: cards[0]!.y })
    return result
  }

  // 分派到具体策略。grid/pack 走纯几何;mindmap/flow 走 dagre。
  if (strategy === 'grid' || strategy === 'pack') {
    return computeGridLayout(cards, gap, direction, strategy)
  }
  return computeDagreLayout(elements, cards, gap, direction, strategy)
}

/**
 * dagre 分层布局(mindmap / flow 共用)。
 * - mindmap:ranksep = gap*1.5(思维导图层间距适中)。
 * - flow:ranksep = gap*2(横向流水线层间距更宽)。
 */
function computeDagreLayout(
  elements: CanvasElement[],
  cards: CanvasElement[],
  gap: number,
  direction: OrganizeDirection,
  strategy: OrganizeStrategy,
): Map<string, LayoutPosition> {
  const result = new Map<string, LayoutPosition>()
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

  // 建 dagre 图。rankdir = direction;nodesep 同层间距;ranksep 层间距。
  const ranksep = strategy === 'flow' ? gap * 2 : gap * 1.5
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: direction, nodesep: gap, ranksep, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const c of cards) {
    // dagre 要节点尺寸算布局;用 card 实际 w/h(防重叠)。
    // 有限性守卫:dagre 遇 Infinity/NaN 维度会抛 "Not possible to find intersection"
    // (intersectRect 崩)→ 整个 organize 失灵。损坏维度回落默认尺寸(240×120)。
    const w = Number.isFinite(c.w) ? c.w : 240
    const h = Number.isFinite(c.h) ? c.h : 120
    g.setNode(c.id, { width: w, height: h })
  }
  for (const e of edges) {
    // 同 from→to 去重(dagre 多重同向边会让布局怪);setEdge 幂等。
    g.setEdge(e.from!, e.to!)
  }

  // dagre.layout 对某些退化输入(如全孤立 + 怪尺寸)理论上仍可能抛 —— 包一层兜底:
  // 抛了就返回各卡原位(organize no-op),不崩整个调用方(popover 无 try/catch)。
  try {
    dagre.layout(g)
  } catch {
    for (const c of cards) result.set(c.id, { x: c.x, y: c.y })
    return result
  }

  // 读回坐标。dagre 给的是节点中心(x,y),转成左上角(我们 CanvasElement 用左上角)。
  for (const c of cards) {
    const node = g.node(c.id)
    if (!node) continue
    result.set(c.id, finitePos({ x: node.x - c.w / 2, y: node.y - c.h / 2 }, c))
  }

  return result
}

/**
 * 纯几何网格布局(grid / pack 共用)。
 *
 * cols:grid 用 ceil(sqrt(n))(每行不漏);pack 用 round(sqrt(n))(更紧凑,可能末行少一格)。
 * effectiveGap:grid 用 gap;pack 用 gap*0.5(紧凑)。
 *
 * 填充走向(以 cols/rows 计算 row/col 后再决定是否镜像):
 * - TB:行优先,从左上 origin 起。row=floor(i/cols), col=i%cols。
 * - BT:TB 的上下镜像——col 不变,row 翻转(rows-1-row)。origin 落在原 bbox 底部。
 * - LR:列优先,从左上 origin 起。col=floor(i/rows), row=i%rows(rows=ceil(n/cols))。
 * - RL:LR 的左右镜像——row 不变,col 翻转(cols-1-col)。origin 落在原 bbox 右侧。
 *
 * origin:取参与 card 原始 bbox 的左上(min x/min y),让布局大致留在用户视线区。
 * pack 在算完所有坐标后整体平移到原质心(grid 不平移,保留左上对齐)。
 */
function computeGridLayout(
  cards: CanvasElement[],
  gap: number,
  direction: OrganizeDirection,
  strategy: OrganizeStrategy,
): Map<string, LayoutPosition> {
  const result = new Map<string, LayoutPosition>()
  const n = cards.length

  // 排序:按 id(稳定可比)。CanvasElement 无 title 字段(title 在 Card 实体),
  // 保纯签名不传 resolver;id 通常含语义,稳定可复现(便于单测)。
  const sorted = [...cards].sort((a, b) => {
    const ta = cardSortKey(a)
    const tb = cardSortKey(b)
    if (ta === tb) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    return ta < tb ? -1 : 1
  })

  // cols:grid=ceil(每行尽量满);pack=round(更小,压紧)。
  const sqrt = Math.sqrt(n)
  const cols = strategy === 'pack' ? Math.max(1, Math.round(sqrt)) : Math.max(1, Math.ceil(sqrt))
  const rows = Math.ceil(n / cols)
  // effectiveGap:grid=gap;pack=gap*0.5(紧凑)。
  const effectiveGap = strategy === 'pack' ? gap * 0.5 : gap

  // origin:参与 card 原始 bbox 左上,让布局留在视线区。
  const minX = Math.min(...sorted.map((c) => c.x))
  const minY = Math.min(...sorted.map((c) => c.y))
  let originX = minX
  let originY = minY

  // 先按「正向填充」算出每个 i 的 (col,row),再按 direction 镜像。
  // 预算正向填充下的网格最大宽高,用于镜像后重算 origin(BT/RL 需要平移 origin)。
  const slots: { col: number; row: number; w: number; h: number }[] = []
  for (let i = 0; i < n; i++) {
    const c = sorted[i]!
    let col: number
    let row: number
    if (direction === 'TB' || direction === 'BT') {
      // 行优先:row = floor(i/cols), col = i%cols
      col = i % cols
      row = Math.floor(i / cols)
    } else {
      // 列优先:col = floor(i/rows), row = i%rows
      col = Math.floor(i / rows)
      row = i % rows
    }
    slots.push({ col, row, w: c.w, h: c.h })
  }

  // 镜像:BT 翻 row,RL 翻 col。镜像后 col/row 可能 = cols-1 / rows-1(最大),
  // 需要 origin 平移使最左/最上的卡仍对齐 minX/minY。
  if (direction === 'BT') {
    for (const s of slots) s.row = rows - 1 - s.row
  } else if (direction === 'RL') {
    for (const s of slots) s.col = cols - 1 - s.col
  }

  // 算坐标。注意:列优先(RL/LR)时同一列内卡 w 可能不同,但 col 步进用该列最大 w。
  // 为简化(且单测固定尺寸),列宽统一取所有卡最大 w;行高统一取最大 h。
  // 这样网格规整、可断言,代价是尺寸不一的卡之间留白略多(可接受)。
  // finiteMax 仅取有限值:损坏卡的 Infinity/NaN w/h 不毒化 step(否则全盘位置 NaN)。
  const maxW = finiteMax(sorted.map((c) => c.w)) || 240
  const maxH = finiteMax(sorted.map((c) => c.h)) || 120
  const stepX = maxW + effectiveGap
  const stepY = maxH + effectiveGap

  // 镜向后 origin 调整:BT 需要把 originY 下移(使镜像后顶部 = 原 minY + 总高)。
  // 实际更直观的做法:算出每个 slot 的坐标后,整体平移使 bbox 左上 = (minX,minY)。
  // 先用 originX/originY 粗算,再整体校正。
  const raw = sorted.map((c, i) => {
    const s = slots[i]!
    return {
      id: c.id,
      x: originX + s.col * stepX,
      y: originY + s.row * stepY,
    }
  })
  // 校正:raw 的 bbox 左上平移到 (minX, minY)。
  const rawMinX = Math.min(...raw.map((r) => r.x))
  const rawMinY = Math.min(...raw.map((r) => r.y))
  const dx = minX - rawMinX
  const dy = minY - rawMinY
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]!
    const c = sorted[i]!
    // finitePos:非有限(NaN/Infinity,如某卡 x 损坏致 origin NaN)→ 回落卡原坐标,
    // 防 NaN 进 host 序列化损坏。
    result.set(r.id, finitePos({ x: r.x + dx, y: r.y + dy }, c))
  }

  // pack:整体平移到原质心(grid 已对齐左上,不平移)。
  if (strategy === 'pack') {
    // 原质心
    const cxOrig = sorted.reduce((s, c) => s + (c.x + c.w / 2), 0) / n
    const cyOrig = sorted.reduce((s, c) => s + (c.y + c.h / 2), 0) / n
    // 新质心
    const cxNew =
      Array.from(result.values()).reduce((s, p) => s + p.x, 0) / n + maxW / 2
    const cyNew =
      Array.from(result.values()).reduce((s, p) => s + p.y, 0) / n + maxH / 2
    // 原坐标损坏(NaN/Infinity)→ cxOrig 非有限 → shift 不平移(0),免重新毒化已守卫的位置。
    const shiftX = Number.isFinite(cxOrig - cxNew) ? Math.round(cxOrig - cxNew) : 0
    const shiftY = Number.isFinite(cyOrig - cyNew) ? Math.round(cyOrig - cyNew) : 0
    for (const [id, p] of result) {
      result.set(id, { x: p.x + shiftX, y: p.y + shiftY })
    }
  }

  return result
}

/** 取 card 的稳定排序键(标题;无则空串,fallback id 在 sort 内处理)。 */
function cardSortKey(c: CanvasElement): string {
  // CanvasElement 不保证 title 字段(card 的内容在 Card 实体);元素上没有 title。
  // 用 id 作排序键(调用方传的 card id 通常含语义)。稳定可比即可。
  return c.id
}
