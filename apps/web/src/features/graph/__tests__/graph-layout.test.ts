import { describe, expect, it } from 'vitest'
import { createGraphSimulation } from '../graph-layout'
import type { GraphNode, GraphEdge } from '../aggregate-edges'

const nodes: GraphNode[] = [
  { id: 'n1', type: 'note', title: 'a', tagColor: null, archived: false },
  { id: 'n2', type: 'note', title: 'b', tagColor: null, archived: false },
]
const edges: GraphEdge[] = []

describe('createGraphSimulation 参数化初始坐标', () => {
  it('无 initialPositions → 节点落中心附近(抖动 fallback)', () => {
    const handle = createGraphSimulation(nodes, edges, { width: 800, height: 600 })
    const n1 = handle.nodes.find((n) => n.id === 'n1')!
    // 中心 (400,300) 附近 ±50
    expect(Math.abs(n1.x - 400)).toBeLessThanOrEqual(60)
    expect(Math.abs(n1.y - 300)).toBeLessThanOrEqual(60)
    expect(n1.fx).toBeNull()
    expect(n1.fy).toBeNull()
  })

  it('有 initialPositions → 用缓存坐标 + fx/fy 固定点', () => {
    const handle = createGraphSimulation(nodes, edges, {
      width: 800,
      height: 600,
      initialPositions: {
        n1: { x: 100, y: 200, fx: 100, fy: 200 },
        n2: { x: 300, y: 400 },
      },
    })
    const n1 = handle.nodes.find((n) => n.id === 'n1')!
    const n2 = handle.nodes.find((n) => n.id === 'n2')!
    expect(n1.x).toBe(100)
    expect(n1.y).toBe(200)
    expect(n1.fx).toBe(100)
    expect(n1.fy).toBe(200)
    expect(n2.x).toBe(300)
    expect(n2.y).toBe(400)
    expect(n2.fx).toBeNull() // 无 fx → 不固定
  })

  it('initialPositions 部分节点有缓存,缺失节点 fallback 抖动', () => {
    const handle = createGraphSimulation(nodes, edges, {
      width: 800,
      height: 600,
      initialPositions: { n1: { x: 100, y: 200 } },
    })
    const n1 = handle.nodes.find((n) => n.id === 'n1')!
    const n2 = handle.nodes.find((n) => n.id === 'n2')!
    expect(n1.x).toBe(100)
    expect(n1.y).toBe(200)
    // n2 无缓存 → 中心抖动
    expect(Math.abs(n2.x - 400)).toBeLessThanOrEqual(60)
  })
})
