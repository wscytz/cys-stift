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
 * view(zoom/panX/panY)、drag 上下文用 ref(高频,不走 state);zoom 单独镜像到
 * React state 供父组件(GraphZoomBar)读取/显示 —— 走 applyView 统一更新。
 * 坐标系:screen → graph 为 graphX = (screenX - panX) / zoom。
 *
 * 暴露 imperative 句柄(GraphCanvasHandle):zoomBy / zoomTo / resetView,
 * 供 GraphZoomBar 的按钮/滑块调用。zoom 变化也通过 onZoomChange 回调上报。
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { readToken } from '@cys-stift/canvas-engine'
import type { CardType } from '@cys-stift/domain'
import { graphViewStore } from '@/lib/graph-view-store'
import type { GraphEdge, GraphNode } from './aggregate-edges'
import { createGraphSimulation, type PositionedNode, type SimulationHandle } from './graph-layout'
import {
  clampZoom,
  clampDelta,
  normalizeWheelDelta,
  zoomFactor,
  MIN_ZOOM,
  MAX_ZOOM,
} from './wheel-math'

const NODE_R = 10
const EDGE_WIDTH = 1.5

/** 视图变换(高频,走 ref;zoom 另镜像到 state)。 */
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

/** 暴露给 GraphZoomBar / 父组件的 imperative 句柄。 */
export interface GraphCanvasHandle {
  /** 按因子缩放(以画布中心为锚点)。factor>1 放大,<1 缩小。 */
  zoomBy: (factor: number) => void
  /** 缩放到指定 zoom(以画布中心为锚点)。 */
  zoomTo: (z: number) => void
  /** 重置视口:zoom=1,pan 居中于画布中心。 */
  resetView: () => void
}

interface GraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick?: (id: string) => void
  /** zoom 变化时回调(供父组件镜像 zoom state 给 GraphZoomBar)。 */
  onZoomChange?: (zoom: number) => void
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  { nodes, edges, onNodeClick, onZoomChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<SimulationHandle | null>(null)
  // mount 时从 store 恢复上次视口(无则默认)。
  const viewRef = useRef<View>(graphViewStore.getView())
  const dragRef = useRef<DragState | null>(null)
  /** 平移(空白拖)上下文,与节点拖拽互斥。 */
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  // zoom 镜像到 React state:供父组件读 + GraphZoomBar 显示。applyView 内同步。
  const [zoom, setZoomState] = useState(viewRef.current.zoom)
  // onZoomChange 闭包最新引用(避免 effect 依赖它导致事件监听重建)。
  const onZoomChangeRef = useRef(onZoomChange)
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange
  })

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

  /**
   * 统一 view 更新:改 viewRef → 同步 zoom state → 重绘 → 回写 store。
   * 所有改 view 的路径(wheel / pan / imperative zoom)都走这里,保证 zoom state
   * 与 GraphZoomBar 同步。patch 可含 zoom/panX/panY 任意子集。
   */
  const applyView = useCallback(
    (patch: Partial<View>) => {
      if (patch.zoom !== undefined) viewRef.current.zoom = patch.zoom
      if (patch.panX !== undefined) viewRef.current.panX = patch.panX
      if (patch.panY !== undefined) viewRef.current.panY = patch.panY
      setZoomState(viewRef.current.zoom)
      onZoomChangeRef.current?.(viewRef.current.zoom)
      render()
      writeView()
    },
    [render, writeView],
  )

  /** 以指定 screen 锚点为中心按 factor 缩放(锚点 graph 坐标缩放前后不变)。 */
  const zoomAt = useCallback(
    (factor: number, screenX: number, screenY: number) => {
      const view = viewRef.current
      const nextZoom = clampZoom(view.zoom * factor)
      view.panX = screenX - ((screenX - view.panX) / view.zoom) * nextZoom
      view.panY = screenY - ((screenY - view.panY) / view.zoom) * nextZoom
      view.zoom = nextZoom
      applyView({})
    },
    [applyView],
  )

  // ── imperative 句柄:zoomBy / zoomTo / resetView(供 GraphZoomBar)──
  useImperativeHandle(
    ref,
    () => ({
      /** 以画布中心为锚点按 factor 缩放。 */
      zoomBy: (factor: number) => {
        const canvas = canvasRef.current
        const cx = canvas ? canvas.clientWidth / 2 : 0
        const cy = canvas ? canvas.clientHeight / 2 : 0
        zoomAt(factor, cx, cy)
      },
      /** 缩放到指定 zoom(画布中心锚点)。 */
      zoomTo: (z: number) => {
        const canvas = canvasRef.current
        const cx = canvas ? canvas.clientWidth / 2 : 0
        const cy = canvas ? canvas.clientHeight / 2 : 0
        const target = clampZoom(z)
        const view = viewRef.current
        const factor = target / view.zoom
        zoomAt(factor, cx, cy)
      },
      /** 重置:zoom=1,pan 居中于画布中心(graph 原点对中)。 */
      resetView: () => {
        const canvas = canvasRef.current
        const cx = canvas ? canvas.clientWidth / 2 : 0
        const cy = canvas ? canvas.clientHeight / 2 : 0
        applyView({ zoom: 1, panX: cx, panY: cy })
      },
    }),
    [applyView, zoomAt],
  )

  // ── useEffect 1:建/重建 simulation(nodes/edges 依赖)──
  // BUG-2a 修复:effect cleanup 不再清空 handleRef.current。React 在跑新 effect body 前
  // 先跑旧 effect 的 cleanup —— 若 cleanup 把 handleRef 置 null,这窗口里任何 render()
  // 调用都因 `if (!handle) return` 早退 → 画布灰掉,直到下次交互触发重绘(切屏恢复的现象)。
  // 现在让 handleRef 始终指向一个有效(可能已 stop 的)handle;effect body 直接覆盖赋值。
  // 组件整体卸载时组件本身已销毁,stale ref 无害。
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
    // BUG-2a 兜底:下一帧再绘一次,确保新 simulation 首帧一定落下(防 render 与布局竞态)。
    requestAnimationFrame(render)
    // 清掉已不存在的节点缓存(节点删除后淘汰旧坐标)。
    graphViewStore.prunePositions(new Set(nodes.map((n) => n.id)))
    return () => {
      // 注意:不碰 handleRef.current —— 见上面 BUG-2a 注释。只 stop 捕获到的局部 handle。
      handle.stop()
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
        // 空白拖平移:走 applyView 同步 zoom state(虽然 pan 不改 zoom,保持一致路径)。
        applyView({
          panX: pan.panX + (screenX - pan.startX),
          panY: pan.panY + (screenY - pan.startY),
        })
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

    // 滚轮:分支 ctrlKey(触摸板 pinch / Ctrl+滚轮 → 缩放)vs 普通(触摸板两指拖 / 鼠标滚轮 → 平移)。
    // BUG-2b:此前所有 wheel 都缩放,触摸板两指平移被误当缩放,体感很差。
    // 现在分两条路径,且 pinch 流做 delta 钳位避免巨大跳变。
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const screenX = ev.clientX - rect.left
      const screenY = ev.clientY - rect.top
      if (ev.ctrlKey) {
        // pinch-to-zoom(触摸板捏合)或 Ctrl+滚轮:缩放。以光标为锚点。
        const dy = clampDelta(ev.deltaY)
        zoomAt(zoomFactor(dy), screenX, screenY)
      } else {
        // 触摸板两指拖 / 鼠标滚轮:平移。按 deltaMode 归一(deltaMode=1 行 ×16)。
        const sx = normalizeWheelDelta(ev.deltaX, ev.deltaMode)
        const sy = normalizeWheelDelta(ev.deltaY, ev.deltaMode)
        const view = viewRef.current
        applyView({ panX: view.panX - sx, panY: view.panY - sy })
      }
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
  }, [render, onNodeClick, applyView])

  // zoom 镜像对外(供父组件 GraphZoomBar 读);初始 mount 也上报一次。
  useEffect(() => {
    onZoomChangeRef.current?.(zoom)
  }, [zoom])

  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
    />
  )
})

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
  if (!raw) return '#666666'
  const m = /^var\((--[\w-]+)\)$/.exec(raw.trim())
  const name = m?.[1] ?? (raw.startsWith('--') ? raw : mapDslName(raw))
  return readToken(name, '#666666')
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
  ctx.strokeStyle = node.archived ? readToken('--color-gray', '#666666') : fill
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

// re-export 常量供外部(GraphZoomBar 的 range min/max)引用,避免硬编码漂移。
export { MIN_ZOOM, MAX_ZOOM }
