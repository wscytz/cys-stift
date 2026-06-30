'use client'

/**
 * GraphCanvas — 图谱核心渲染/交互组件。
 *
 * d3-force tick (~60fps) 直接驱动 Canvas 2D 重绘(走 handle.onTick → render),
 * 不经 React setState,避免每 tick 触发 reconciliation。React 只负责:
 *  - 挂载/卸载(建 simulation + 事件监听)
 *  - nodes/edges props 变化时重建 simulation
 *  - hover 状态变化触发一次重绘(淡化非邻居)
 *
 * view(zoom/panX/panY)、drag 上下文用 ref(高频变化,不走 state)。
 * 坐标系:screen → graph 为 graphX = (screenX - panX) / zoom。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { readToken } from '@cys-stift/canvas-engine'
import type { CardType } from '@cys-stift/domain'
import { graphViewStore } from '@/lib/graph-view-store'
import type { GraphEdge, GraphNode } from './aggregate-edges'
import { createGraphSimulation, type PositionedNode, type SimulationHandle } from './graph-layout'

const NODE_R = 10
const EDGE_WIDTH = 1.5
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4

/** 视图变换(高频,走 ref)。 */
interface View {
  zoom: number
  panX: number
  panY: number
}

/** 拖拽上下文(走 ref)。 */
interface DragState {
  nodeId: string
  /** pointerdown 时的 screen 坐标,用于区分点击 vs 拖拽。 */
  startX: number
  startY: number
  moved: boolean
}

interface GraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick?: (id: string) => void
}

export function GraphCanvas({ nodes, edges, onNodeClick }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<SimulationHandle | null>(null)
  // mount 时从 store 恢复上次视口(无则默认)。
  const viewRef = useRef<View>(graphViewStore.getView())
  const dragRef = useRef<DragState | null>(null)
  /** 平移(空白拖)上下文,与节点拖拽互斥。 */
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  /**
   * 绘一帧:模块级纯函数读 canvas/nodes/edges/view/hover。
   * 用 useCallback 稳定引用(事件监听里闭包调用,且作为 onTick 的回调)。
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const handle = handleRef.current
    if (!canvas || !ctx || !handle) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    // dpr 适配:物理像素按 dpr 放大,setTransform 缩回,逻辑坐标用 clientWidth/Height。
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = readToken('--color-white', '#ffffff')
    ctx.fillRect(0, 0, w, h)

    const view = viewRef.current
    const positioned = handle.nodes
    const byId = new Map(positioned.map((n) => [n.id, n]))

    // hover 时计算邻居集(含自身),非邻居淡化。
    let faded = false
    const neighborIds = new Set<string>()
    if (hover) {
      neighborIds.add(hover)
      for (const e of edges) {
        if (e.from === hover) neighborIds.add(e.to)
        if (e.to === hover) neighborIds.add(e.from)
      }
      faded = true
    }

    // screen = graph * zoom + pan
    const sx = (x: number) => x * view.zoom + view.panX
    const sy = (y: number) => y * view.zoom + view.panY

    // ── 边 ──
    for (const e of edges) {
      const a = byId.get(e.from)
      const b = byId.get(e.to)
      if (!a || !b) continue
      const dim = faded && !neighborIds.has(e.from) && !neighborIds.has(e.to)
      ctx.save()
      ctx.globalAlpha = dim ? 0.12 : 1
      ctx.strokeStyle = resolveColor(e.signature.color)
      ctx.lineWidth = EDGE_WIDTH
      if (e.signature.dash === 'dashed') ctx.setLineDash([6, 4])
      else if (e.signature.dash === 'dotted') ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(sx(a.x), sy(a.y))
      ctx.lineTo(sx(b.x), sy(b.y))
      ctx.stroke()
      // arrowhead:简化为在线段终点画一个小三角(三角形/箭头都画,none 不画)。
      if (e.signature.arrowhead !== 'none') {
        drawArrowhead(ctx, sx(a.x), sy(a.y), sx(b.x), sy(b.y))
      }
      ctx.restore()
    }

    // ── 节点(逆序不影响,逐个画)──
    for (const n of positioned) {
      const dim = faded && !neighborIds.has(n.id)
      drawNode(ctx, n, view.zoom, sx(n.x), sy(n.y), n.id === hover, dim)
    }
  }, [edges, hover])

  /** view 回写 throttle 句柄。 */
  const viewWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writeView = useCallback(() => {
    if (viewWriteRef.current) return
    viewWriteRef.current = setTimeout(() => {
      viewWriteRef.current = null
      const v = viewRef.current
      graphViewStore.updateView({ zoom: v.zoom, panX: v.panX, panY: v.panY })
    }, 200)
  }, [])

  // ── useEffect 1:建/重建 simulation(nodes/edges 依赖)──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.clientWidth || 800
    const h = canvas.clientHeight || 600
    // 从 store 恢复节点坐标(含 fx/fy 固定点);新节点 fallback 抖动。
    const handle = createGraphSimulation(nodes, edges, {
      width: w,
      height: h,
      initialPositions: graphViewStore.getAllPositions(),
    })
    handleRef.current = handle
    let writeTickTimer: ReturnType<typeof setTimeout> | null = null
    handle.onTick(() => {
      render()
      // tick 稳定后 throttle 回写所有节点坐标(200ms)。
      if (writeTickTimer) return
      writeTickTimer = setTimeout(() => {
        writeTickTimer = null
        const positions: Record<string, { x: number; y: number; fx?: number; fy?: number }> = {}
        for (const n of handle.nodes) {
          positions[n.id] = { x: n.x, y: n.y, fx: n.fx ?? undefined, fy: n.fy ?? undefined }
        }
        graphViewStore.setPositions(positions)
      }, 200)
    })
    handle.restart()
    render() // 首帧
    // 清掉已不存在的节点缓存(节点删除后淘汰旧坐标)。
    graphViewStore.prunePositions(new Set(nodes.map((n) => n.id)))
    return () => {
      handle.stop()
      handleRef.current = null
      if (writeTickTimer) clearTimeout(writeTickTimer)
    }
    // nodes/edges 是数组引用;父组件换实例即重建。render 闭包随 edges/hover 更新由 onTick 间接读到最新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  // ── useEffect 2:hover 变化重绘 ──
  useEffect(() => {
    render()
  }, [hover, render])

  // ── useEffect 3:指针/滚轮交互 ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const toGraph = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const view = viewRef.current
      const screenX = clientX - rect.left
      const screenY = clientY - rect.top
      return { x: (screenX - view.panX) / view.zoom, y: (screenY - view.panY) / view.zoom, screenX, screenY }
    }

    // 逆序命中:靠后绘制(上层)优先。所有形状用圆判定(YAGNI 精确形状)。
    const hitTest = (gx: number, gy: number): string | null => {
      const positioned = handleRef.current?.nodes
      if (!positioned) return null
      for (let i = positioned.length - 1; i >= 0; i--) {
        const n = positioned[i]!
        const dx = n.x - gx
        const dy = n.y - gy
        if (dx * dx + dy * dy <= NODE_R * NODE_R) return n.id
      }
      return null
    }

    const onPointerDown = (ev: PointerEvent) => {
      const { x, y, screenX, screenY } = toGraph(ev.clientX, ev.clientY)
      const hit = hitTest(x, y)
      if (hit) {
        handleRef.current?.fixNode(hit, x, y)
        handleRef.current?.restart()
        dragRef.current = { nodeId: hit, startX: screenX, startY: screenY, moved: false }
        canvas.setPointerCapture(ev.pointerId)
      } else {
        // 空白拖 = 平移。
        const view = viewRef.current
        panRef.current = { startX: screenX, startY: screenY, panX: view.panX, panY: view.panY }
        canvas.setPointerCapture(ev.pointerId)
      }
    }

    const onPointerMove = (ev: PointerEvent) => {
      const { x, y, screenX, screenY } = toGraph(ev.clientX, ev.clientY)
      const drag = dragRef.current
      if (drag) {
        // 超过阈值算拖拽(避免微动误判点击)。
        const moved =
          Math.abs(screenX - drag.startX) > 3 || Math.abs(screenY - drag.startY) > 3
        if (moved) drag.moved = true
        handleRef.current?.fixNode(drag.nodeId, x, y)
        return
      }
      const pan = panRef.current
      if (pan) {
        viewRef.current.panX = pan.panX + (screenX - pan.startX)
        viewRef.current.panY = pan.panY + (screenY - pan.startY)
        render()
        writeView()
        return
      }
      // 无拖拽:更新 hover。
      const hit = hitTest(x, y)
      setHover((prev) => (prev === hit ? prev : hit))
    }

    const onPointerUp = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (drag) {
        const { x, y } = toGraph(ev.clientX, ev.clientY)
        // 未移动且松手仍在节点范围内 = 点击。
        const stillOnNode = hitTest(x, y) === drag.nodeId
        if (!drag.moved && stillOnNode) {
          onNodeClick?.(drag.nodeId)
        }
        // 松手释放固定点 → 回弹到力平衡。
        handleRef.current?.releaseNode(drag.nodeId)
        // 回写拖拽后位置(普通坐标,非固定点 — releaseNode 已松固定)。
        const dragged = handleRef.current?.nodes.find((n) => n.id === drag.nodeId)
        if (dragged) {
          graphViewStore.setPosition(drag.nodeId, { x: dragged.x, y: dragged.y })
        }
        handleRef.current?.restart()
        dragRef.current = null
        try {
          canvas.releasePointerCapture(ev.pointerId)
        } catch {
          // pointerId 可能已释放,忽略。
        }
        return
      }
      if (panRef.current) {
        panRef.current = null
        try {
          canvas.releasePointerCapture(ev.pointerId)
        } catch {
          // 忽略。
        }
      }
    }

    // 滚轮缩放:以鼠标位置为锚点(锚点 screen 坐标缩放后不变)。
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const screenX = ev.clientX - rect.left
      const screenY = ev.clientY - rect.top
      const view = viewRef.current
      // graph 坐标在缩放前后保持:graphX = (screenX - panX') / zoom' = (screenX - panX) / zoom。
      const factor = Math.exp(-ev.deltaY * 0.001)
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor))
      view.panX = screenX - ((screenX - view.panX) / view.zoom) * nextZoom
      view.panY = screenY - ((screenY - view.panY) / view.zoom) * nextZoom
      view.zoom = nextZoom
      render()
      writeView()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render, onNodeClick, writeView])

  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
    />
  )
}

// ── 模块级绘制工具 ──────────────────────────────────────────────────────────

/**
 * 把 token 形态的颜色解析成 Canvas 2D 可用的实际色值。
 *
 * 输入来源两路:
 *  - GraphNode.tagColor / GraphEdge.signature.color 可能是 'var(--color-teal)' 完整 CSS var(剥 var() 取 token 名)
 *  - 也可能是裸 token 名 '--color-red' 或 DSL 名 'red'
 * Canvas 2D fillStyle/strokeStyle 不能直接吃 'var(...)',故用 readToken 读 computed value,
 * 解析失败回退中性灰(YAGNI:不引额外映射表,readToken 已是项目标准)。
 */
function resolveColor(raw: string | null | undefined): string {
  if (!raw) return '#9ca3af'
  const m = /^var\((--[\w-]+)\)$/.exec(raw.trim())
  const name = m?.[1] ?? (raw.startsWith('--') ? raw : mapDslName(raw))
  return readToken(name, '#9ca3af')
}

/** DSL/关系 color 名(6 原色口径)→ token 名。仅兜底裸名输入;var(...) 形式已剥壳。 */
function mapDslName(name: string): string {
  const map: Record<string, string> = {
    red: '--color-red',
    blue: '--color-blue',
    yellow: '--color-yellow',
    gray: '--color-gray',
    grey: '--color-gray',
    white: '--color-white',
    black: '--color-black',
  }
  return map[name.toLowerCase()] ?? '--color-gray'
}

/** 按 card type 画形状:note=圆/code=矩形/link=菱形/quote=矩形圆角/image=方。 */
function drawNode(
  ctx: CanvasRenderingContext2D,
  node: PositionedNode,
  zoom: number,
  cx: number,
  cy: number,
  isHover: boolean,
  dim: boolean,
): void {
  ctx.save()
  ctx.globalAlpha = dim ? 0.2 : 1
  const fill = node.tagColor ? resolveColor(node.tagColor) : readToken('--color-black', '#0a0a0a')
  ctx.fillStyle = fill
  ctx.strokeStyle = node.archived ? readToken('--color-gray', '#9ca3af') : fill
  ctx.lineWidth = isHover ? 2.5 : 1

  drawShape(ctx, node.type, cx, cy)

  // hover 描边圈(高亮)。
  if (isHover) {
    ctx.beginPath()
    ctx.arc(cx, cy, NODE_R + 4, 0, Math.PI * 2)
    ctx.strokeStyle = readToken('--color-red', '#dc2626')
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()

  // 标题:zoom 足够大时画前若干字(等宽字体,不走 CSS var,Canvas 2D font 吃字面值)。
  if (zoom > 0.6 && node.title) {
    const max = 10
    const title = node.title.length > max ? node.title.slice(0, max) + '…' : node.title
    ctx.save()
    ctx.globalAlpha = dim ? 0.3 : 1
    ctx.fillStyle = readToken('--color-black', '#0a0a0a')
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(title, cx, cy + NODE_R + 3)
    ctx.restore()
  }
}

/** 绘形状路径并 fill+stroke。所有形状外接圆半径 = NODE_R(保证 hitTest 圆判定近似一致)。 */
function drawShape(ctx: CanvasRenderingContext2D, type: CardType, cx: number, cy: number): void {
  const r = NODE_R
  ctx.beginPath()
  switch (type) {
    case 'note':
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      break
    case 'code':
      ctx.rect(cx - r, cy - r * 0.7, r * 2, r * 1.4)
      break
    case 'link':
      // 菱形。
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      break
    case 'quote':
      ctx.rect(cx - r, cy - r * 0.7, r * 2, r * 1.4)
      break
    case 'image':
      // 方(正方形外接)。
      const s = r * Math.SQRT1_2
      ctx.rect(cx - s, cy - s, s * 2, s * 2)
      break
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
}

/** 在线段终点画小三角箭头(arrow/triangle 同形态,YAGNI 不细分)。 */
function drawArrowhead(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number): void {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  const size = 6
  ctx.save()
  ctx.fillStyle = ctx.strokeStyle as string
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
