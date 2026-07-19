import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import type { GraphNode, GraphEdge } from './aggregate-edges'

/**
 * GraphNode + d3-force 模拟坐标/速度/固定点。
 * x/y/vx/vy/fx/fy 由 d3-force 在 tick 中读写(PositionedNode 把它们声明为必填,
 * 满足 SimulationNodeDatum 的可选约束 —— 必填字段可赋给可选字段)。
 */
export interface PositionedNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  fx: number | null
  fy: number | null
}

/** d3-force 控制句柄:暴露坐标数组 + 拖拽/重启/停止,屏蔽数据变异细节。 */
export interface SimulationHandle {
  nodes: PositionedNode[]
  onTick: (cb: () => void) => void
  fixNode: (id: string, x: number, y: number) => void
  releaseNode: (id: string) => void
  restart: () => void
  stop: () => void
}

type LinkDatum = { source: string; target: string }

/**
 * 用 d3-force 构建 force-directed 布局模拟。
 * - link(forceLink,id=节点 id,distance 80,strength 0.3):边拉拢
 * - charge(forceManyBody,-120):节点互斥
 * - center(forceCenter,画布中心):整体居中
 * - collide(forceCollide,24):节点不重叠
 * 初始位置在画布中心附近随机抖动(避免完全重叠导致 charge 力方向随机)。
 * 立即 .stop() —— T4 决定何时 restart + 监听 tick。
 */
export interface NodeInitialPosition {
  x: number
  y: number
  fx?: number
  fy?: number
}

export function createGraphSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: {
    width: number
    height: number
    /** 持久化的节点坐标(含拖拽固定点 fx/fy)。有则用缓存,无则中心抖动 fallback。 */
    initialPositions?: Record<string, NodeInitialPosition>
  },
): SimulationHandle {
  const positioned: PositionedNode[] = nodes.map((n) => {
    const cached = opts.initialPositions?.[n.id]
    if (cached && Number.isFinite(cached.x) && Number.isFinite(cached.y)) {
      // Keep fixed coordinates only when both members of the pair are finite;
      // a malformed half-pair otherwise makes d3-force propagate NaN ticks.
      const fixed = Number.isFinite(cached.fx) && Number.isFinite(cached.fy)
      return {
        ...n,
        x: cached.x,
        y: cached.y,
        vx: 0,
        vy: 0,
        fx: fixed ? cached.fx! : null,
        fy: fixed ? cached.fy! : null,
      }
    }
    // 无缓存:中心附近抖动(避免完全重叠导致 charge 力方向随机)。
    return {
      ...n,
      x: opts.width / 2 + (Math.random() - 0.5) * 100,
      y: opts.height / 2 + (Math.random() - 0.5) * 100,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    }
  })
  const idToIdx = new Map(positioned.map((n, i) => [n.id, i]))
  // 只保留两端都在 nodes 里的边(悬空 from/to 会让 forceLink 初始化报错)。
  const linkData: LinkDatum[] = edges
    .map((e) => ({ source: e.from, target: e.to }))
    .filter((l) => idToIdx.has(l.source) && idToIdx.has(l.target))

  // 用 forceLink 时,必须走 forceSimulation 的双泛型重载 <NodeDatum, LinkDatum>,
  // 否则 .force('link', ...) 会因 Simulation 的 LinkDatum===undefined 与 ForceLink 不匹配而报错。
  const sim = forceSimulation<PositionedNode, LinkDatum>(positioned)
    .force(
      'link',
      forceLink<PositionedNode, LinkDatum>(linkData)
        .id((d) => d.id)
        .distance(80)
        .strength(0.3),
    )
    .force('charge', forceManyBody().strength(-120))
    .force('center', forceCenter(opts.width / 2, opts.height / 2))
    .force('collide', forceCollide(24))
    .stop()

  let tickCb: (() => void) | null = null
  sim.on('tick', () => tickCb?.())

  return {
    nodes: positioned,
    onTick: (cb) => {
      tickCb = cb
    },
    fixNode: (id, x, y) => {
      const n = positioned[idToIdx.get(id) ?? -1]
      if (n) {
        n.fx = x
        n.fy = y
      }
    },
    releaseNode: (id) => {
      const n = positioned[idToIdx.get(id) ?? -1]
      if (n) {
        n.fx = null
        n.fy = null
      }
    },
    restart: () => {
      sim.alpha(0.3).restart()
    },
    stop: () => {
      sim.stop()
    },
  }
}
