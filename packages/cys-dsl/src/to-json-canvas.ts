/**
 * to-json-canvas — cys-dsl ops → JSON Canvas 1.0(jsoncanvas.org)适配器。
 *
 * 用途(执行意向书 Step 2「顺手」):让陌生画布用户把 .sift 一键转成他们已在用的格式
 * (Obsidian .canvas / React Flow / Excalidraw 生态均支持 JSON Canvas 导入)。
 *
 * 映射(v0.1,明确取舍):
 * - card  → node(type:'text'),title 落 node.text;
 * - free text → node(type:'text');
 * - 关系箭头(from/to)→ edge,label 落 edge.label;
 * - rect / frame → 跳过(JSON Canvas 无对应语义,数据仍在 .sift 源);
 * - 自由箭头(freeArrow)/ keepExistingPos 卡(无独立几何,独立转换无现有画布可沿用)→ 跳过;
 * - 其余 cys 字段(color/content/@type/@tags/@links/@code/@quote/@group/@href/compute/
 *   dash/arrowhead/curve/route/elbow/wikilink)整体落节点的 `cys` 附加属性 —— JSON Canvas
 *   允许节点/边携带任意附加属性,round-trip 回 DSL 时不丢。
 *
 * 颜色**故意不**映射到 node.color:JSON Canvas 1.0 的 color 只接受 "1".."6" 或 #hex,
 * DSL 的色 token('blue' 等)不是合法值,塞进去会产出不合规文档 —— 保存在 cys.color。
 * curve/route/elbow 同理保进 cys(消费端画直线,数据不丢)。
 *
 * 纯函数、零依赖(与包整体纪律一致);本模块进公开 barrel,cli.ts 不进(避免 node:fs
 * 进 web bundle)。
 */
import type { DslArrowOp, DslCardOp, DslFreeOp, DslOp } from './dsl-parser'

/** 与 apply-layout / relational-solver 一致的缺省卡尺寸。 */
export const JSON_CANVAS_DEFAULT_CARD_W = 240
export const JSON_CANVAS_DEFAULT_CARD_H = 120
/** 自由 text 元素的转换缺省尺寸(仅当 op 未带 @size 时)。 */
export const JSON_CANVAS_DEFAULT_TEXT_W = 200
export const JSON_CANVAS_DEFAULT_TEXT_H = 60

/** JSON Canvas 1.0 节点。附加字段全部收在 `cys` 命名空间(spec 允许任意附加属性)。 */
export type JsonCanvasNode = {
  id: string
  type: 'text' | 'group'
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  cys?: Record<string, unknown>
}

/** JSON Canvas 1.0 边。 */
export type JsonCanvasEdge = {
  id: string
  fromNode: string
  toNode: string
  color?: string
  label?: string
  cys?: Record<string, unknown>
}

/** JSON Canvas 1.0 文档根。 */
export type JsonCanvasFile = {
  nodes: JsonCanvasNode[]
  edges: JsonCanvasEdge[]
}

/** 被跳过的 op 及原因(转换是**诚实的**:跳过必留痕,不静默丢)。 */
export type SkippedOp = {
  /** 源 op 在输入数组中的下标。 */
  opIndex: number
  /** op 种类名(card / rect / frame / arrow)。 */
  op: string
  reason: string
}

/**
 * 将(已求解的)DSL ops 转 JSON Canvas 1.0 文档。
 *
 * 输入应是 solveRelational 之后的 ops(关系式已解析为绝对坐标);converter 自身不求解。
 * 箭头延迟到节点集齐后处理(DSL 允许前向引用:arrow 行可出现在目标 card 行之前)。
 */
export function toJsonCanvas(ops: DslOp[]): { canvas: JsonCanvasFile; skipped: SkippedOp[] } {
  const nodes: JsonCanvasNode[] = []
  const edges: JsonCanvasEdge[] = []
  const skipped: SkippedOp[] = []
  const deferredArrows: { op: DslArrowOp; opIndex: number }[] = []

  const pushCys = (node_or_edge: { cys?: Record<string, unknown> }, cys: Record<string, unknown>): void => {
    if (Object.keys(cys).length > 0) node_or_edge.cys = cys
  }

  // id 全局唯一(JSON Canvas spec:node/edge id 各自 unique)。显式重复 → 跳过留痕
  // (保首个,后续引用边仍解析到首节点);兜底生成 id 撞车 → 静默改名(边 id 无引用语义)。
  const usedIds = new Set<string>()
  function claimId(candidate: string, explicit: boolean, opIndex: number, opKind: string): string | null {
    if (!usedIds.has(candidate)) {
      usedIds.add(candidate)
      return candidate
    }
    if (explicit) {
      skipped.push({ opIndex, op: opKind, reason: `id ${candidate} 与更早元素重复,仅首个进转换` })
      return null
    }
    let n = 2
    while (usedIds.has(`${candidate}-${n}`)) n++
    const renamed = `${candidate}-${n}`
    usedIds.add(renamed)
    return renamed
  }

  function addCard(op: DslCardOp, opIndex: number): void {
    if (op.keepExistingPos === true) {
      skipped.push({
        opIndex,
        op: 'card',
        reason: '纯属性编辑 op(keepExistingPos,无独立几何)——独立转换没有现有画布坐标可沿用',
      })
      return
    }
    const id = claimId(op.cardId, true, opIndex, 'card')
    if (id === null) return
    // spec:x/y/width/height 为 required integer —— solver/parse 可产小数,此处取整。
    // text 型节点 text 为 required —— 无 @title 时落空串。
    const node: JsonCanvasNode = {
      id,
      type: 'text',
      x: Math.round(op.x),
      y: Math.round(op.y),
      width: Math.round(op.w ?? JSON_CANVAS_DEFAULT_CARD_W),
      height: Math.round(op.h ?? JSON_CANVAS_DEFAULT_CARD_H),
      text: op.title ?? '',
    }
    pushCys(node, {
      ...(op.color !== undefined ? { color: op.color } : {}),
      ...(op.content !== undefined ? { content: op.content } : {}),
      ...(op.cardType !== undefined ? { cardType: op.cardType } : {}),
      ...(op.tags?.length ? { tags: op.tags } : {}),
      ...(op.links?.length ? { links: op.links } : {}),
      ...(op.code?.length ? { code: op.code } : {}),
      ...(op.quotes?.length ? { quotes: op.quotes } : {}),
      ...(op.group !== undefined ? { group: op.group } : {}),
      ...(op.href?.length ? { href: op.href } : {}),
    })
    nodes.push(node)
  }

  function addFree(op: DslFreeOp, opIndex: number): void {
    if (op.shape !== 'text') {
      skipped.push({
        opIndex,
        op: op.shape,
        reason: `JSON Canvas 无 ${op.shape} 语义(v0.1 不映射;源 .sift 中保留)`,
      })
      return
    }
    const id = claimId(op.id ?? `n${opIndex}`, op.id !== undefined, opIndex, op.shape)
    if (id === null) return
    const node: JsonCanvasNode = {
      id,
      type: 'text',
      x: Math.round(op.x),
      y: Math.round(op.y),
      width: Math.round(op.w ?? JSON_CANVAS_DEFAULT_TEXT_W),
      height: Math.round(op.h ?? JSON_CANVAS_DEFAULT_TEXT_H),
      text: op.text ?? '',
    }
    pushCys(node, {
      ...(op.color !== undefined ? { color: op.color } : {}),
      ...(op.group !== undefined ? { group: op.group } : {}),
      ...(op.compute !== undefined ? { compute: op.compute } : {}),
    })
    nodes.push(node)
  }

  function addArrow(op: DslArrowOp, opIndex: number, nodeIds: Set<string>): void {
    const missing = !nodeIds.has(op.from) ? op.from : !nodeIds.has(op.to) ? op.to : null
    if (missing !== null) {
      skipped.push({
        opIndex,
        op: 'arrow',
        reason: `端点 #${missing} 不在可转换节点中(元素缺失或其 op 被跳过),边随之跳过`,
      })
      return
    }
    const edgeId = claimId(op.id ?? `e${opIndex}`, op.id !== undefined, opIndex, 'arrow')
    if (edgeId === null) return
    const edge: JsonCanvasEdge = { id: edgeId, fromNode: op.from, toNode: op.to }
    if (op.label !== undefined) edge.label = op.label
    pushCys(edge, {
      ...(op.color !== undefined ? { color: op.color } : {}),
      ...(op.dash !== undefined ? { dash: op.dash } : {}),
      ...(op.arrowhead !== undefined ? { arrowhead: op.arrowhead } : {}),
      ...(op.wikilink !== undefined ? { wikilink: op.wikilink } : {}),
      ...(op.curve !== undefined ? { curve: op.curve } : {}),
      ...(op.route !== undefined ? { route: op.route } : {}),
      ...(op.elbow !== undefined ? { elbow: op.elbow } : {}),
    })
    edges.push(edge)
  }

  ops.forEach((op, opIndex) => {
    if (op.type === 'card') return addCard(op, opIndex)
    if (op.type === 'free') return addFree(op, opIndex)
    // 箭头:freeArrow(或 from/to 为空串)无端点,JSON Canvas 边必须有节点端点。
    if (op.freeArrow || !op.from || !op.to) {
      skipped.push({ opIndex, op: 'arrow', reason: '自由箭头无 from/to 端点,JSON Canvas 边需要节点端点' })
      return
    }
    deferredArrows.push({ op, opIndex })
  })

  const nodeIds = new Set(nodes.map((n) => n.id))
  for (const { op, opIndex } of deferredArrows) addArrow(op, opIndex, nodeIds)

  skipped.sort((a, b) => a.opIndex - b.opIndex)
  return { canvas: { nodes, edges }, skipped }
}
