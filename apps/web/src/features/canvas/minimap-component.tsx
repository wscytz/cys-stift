'use client'

/**
 * Minimap (component) — 鸟瞰导航(画布角落小地图)。
 *
 * 浮在画布右下角(Bauhaus 白底 + 黑边 + 硬阴影,与 RelationPanel 一致)。每帧重绘:
 *   1. 算 projection(全部元素 bbox fit 进 minimap)+ viewportRect(当前可见页矩形)
 *   2. 画元素:card=填色矩形、arrow=线、rect=描边方框、text=横条、freedraw=点折线、其他=小点
 *   3. 画视口框(dashed)
 * 点击 minimap → 把对应页坐标居中;按住拖拽 → 连续平移跟随光标。
 *
 * 只读 host(getElements/getView/setView/onViewChange/onUserChange),不碰引擎逻辑。
 * 颜色走 token(readToken 读 CSS 变量,fallback hex)。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import { readToken, colorOf, arrowEndpoints, freedrawPointsOf } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import {
  computeMinimapProjection,
  viewportRect,
  minimapClickToPage,
} from './minimap'
import { useDraggablePanelPos } from './use-draggable-panel-pos'

const MINIMAP_W = 180
const MINIMAP_H = 135

/** minimap 位置持久化 key。null = 用默认(右下偏左避让右栏)。 */
const POSITION_KEY = 'cys-stift.minimap-pos.v1'
// #19 折叠态持久化(reload 后保留用户折叠/展开)。
const COLLAPSED_KEY = 'cys-stift.minimap-collapsed.v1'
function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(COLLAPSED_KEY) === '1'
}

export function Minimap({
  host,
  canvasEl,
}: {
  host: CanvasHost | null
  /** 主画布 canvas 元素(读 css 尺寸算 viewport)。null → 不渲染。 */
  canvasEl: HTMLCanvasElement | null
}) {
  const miniRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  // 拖拽态:pointer down 后挂 window move/up 监听,使拖拽不离开 minimap 也连续。
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const draggingRef = useRef(false)
  // minimap 位置(可拖拽,持久化到 localStorage)。null left/right = 默认右下避让右栏。
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    pos,
    onPointerDown: onTitlePointerDown,
    positioned,
    justDraggedRef,
  } = useDraggablePanelPos(containerRef, POSITION_KEY)
  const { t } = useI18n()

  /** 绘制一帧。 */
  const draw = useCallback(() => {
    const mini = miniRef.current
    const ctx = mini?.getContext('2d')
    if (!host || !mini || !ctx) return
    const hostSize = canvasEl
      ? { w: canvasEl.clientWidth, h: canvasEl.clientHeight }
      : { w: 0, h: 0 }
    if (hostSize.w <= 0 || hostSize.h <= 0) return

    // DPR 适配(照搬 graph-canvas:110-118):物理像素按 dpr 放大,setTransform 缩回,绘制用 MINIMAP_W/H 逻辑坐标(retina 防糊)。setTransform 在最外层一次设,save/restore 视口框包裹不变。
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const pw = Math.round(MINIMAP_W * dpr)
    const ph = Math.round(MINIMAP_H * dpr)
    if (mini.width !== pw || mini.height !== ph) { mini.width = pw; mini.height = ph }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const elements = host.getElements()
    const view = host.getView()
    const proj = computeMinimapProjection(elements, { w: MINIMAP_W, h: MINIMAP_H })

    // 清空。
    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H)
    ctx.fillStyle = readToken('--color-white', '#ffffff')
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H)

    // 画元素。
    for (const el of elements) {
      drawElementMark(ctx, el, proj, elements)
    }

    // 画视口框。
    const vp = viewportRect(view, hostSize)
    const vx = vp.x * proj.scale + proj.offsetX
    const vy = vp.y * proj.scale + proj.offsetY
    const vw = vp.w * proj.scale
    const vh = vp.h * proj.scale
    ctx.save()
    ctx.strokeStyle = readToken('--color-black', '#0a0a0a')
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    ctx.strokeRect(vx, vy, vw, vh)
    ctx.restore()
  }, [host, canvasEl])

  /** rAF 防抖重绘。 */
  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      draw()
    })
  }, [draw])

  // 订阅 host 变更(视图/用户改动/选区)触发重绘。host 变化时重订阅。
  useEffect(() => {
    if (!host) return
    const unsubs = [
      host.onViewChange(scheduleDraw),
      host.onUserChange(scheduleDraw),
      host.onSelectionChange(scheduleDraw),
    ]
    // 初始一帧 + layout 完成后的几帧重绘。首次挂载时主 canvas 常还没有
    // clientWidth，draw 会安全返回；没有重试的话小地图会一直白到下一次
    // 用户缩放/平移才出现内容。
    // Use the DOM timer id explicitly. `ReturnType<typeof window.setTimeout>`
    // resolves to NodeJS.Timeout when the app's mixed Node/DOM typings are
    // loaded, while browser `window.clearTimeout` expects a number.
    const retryTimers: number[] = []
    const retry = (remaining: number) => {
      scheduleDraw()
      if (remaining > 0) {
        retryTimers.push(window.setTimeout(() => retry(remaining - 1), 40))
      }
    }
    retry(4)
    const onResize = () => scheduleDraw()
    window.addEventListener('resize', onResize)
    let observer: ResizeObserver | null = null
    if (canvasEl && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(onResize)
      observer.observe(canvasEl)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
      for (const timer of retryTimers) window.clearTimeout(timer)
      for (const u of unsubs) u()
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [canvasEl, host, scheduleDraw])

  // 展开后画布是新挂载的空 canvas,host 事件不会自动触发重绘——这里补一帧。
  useEffect(() => {
    if (!collapsed) scheduleDraw()
  }, [collapsed, scheduleDraw])

  // 把点击/光标所在的 minimap 坐标 → 居中视口(click & drag-mousemove 共用)。
  // 屏幕 中心 = pan + pageP*zoom → pan = screenCenter - pageP*zoom。
  const centerOnMiniPoint = useCallback(
    (clickMini: { x: number; y: number }) => {
      if (!host || !canvasEl) return
      const elements = host.getElements()
      const proj = computeMinimapProjection(elements, { w: MINIMAP_W, h: MINIMAP_H })
      const pageP = minimapClickToPage(clickMini, proj)
      const view = host.getView()
      const zoom = view.zoom || 1
      const cx = canvasEl.clientWidth / 2
      const cy = canvasEl.clientHeight / 2
      host.setView({
        ...view,
        panX: cx - pageP.x * zoom,
        panY: cy - pageP.y * zoom,
      })
    },
    [host, canvasEl],
  )

  // 把鼠标事件 client 坐标 → minimap 内坐标(canvas 物理尺寸 = CSS 尺寸,不 DPR 放大)。
  const miniCoordsFromEvent = (clientX: number, clientY: number) => {
    const mini = miniRef.current
    const rect = mini?.getBoundingClientRect()
    if (!rect) return null
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return {
      x: (sx / rect.width) * MINIMAP_W,
      y: (sy / rect.height) * MINIMAP_H,
    }
  }

  // 点击 minimap → 该页坐标居中(单次点击仍生效;拖拽走 onPointerDown)。
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) return // 拖拽刚结束,不重复 center
    if (!host || !canvasEl) return
    const click = miniCoordsFromEvent(e.clientX, e.clientY)
    if (!click) return
    centerOnMiniPoint(click)
  }

  // 拖拽到平移:down → 连续 move center → up 结束。用 window 级监听,拖出 minimap 也跟随。
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!host || !canvasEl) return
    const mini = miniRef.current
    if (!mini) return
    const click = miniCoordsFromEvent(e.clientX, e.clientY)
    if (!click) return
    // 立即居中一次(给用户即时反馈),进入拖拽态。
    centerOnMiniPoint(click)
    draggingRef.current = true
    mini.setPointerCapture?.(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      const p = miniCoordsFromEvent(ev.clientX, ev.clientY)
      if (p) centerOnMiniPoint(p)
    }
    const onUp = (ev: PointerEvent) => {
      draggingRef.current = false
      mini.releasePointerCapture?.(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // 拖拽标题栏移动 minimap。用绝对 left/top 定位(脱离默认右下),拖完持久化。
  // 拖拽中阻止点击折叠(避免拖完误折叠)。clamp 在画布容器内,不超出。
  // 拖动逻辑 + 持久化由共享 hook(useDraggablePanelPos)提供,这里只挂 onPointerDown。

  if (!host || !canvasEl) return null

  const title = t('canvas.minimap')
  const collapseLabel = collapsed ? t('canvas.minimapExpand') : t('canvas.minimapCollapse')


  // 定位:有用户位置用 left/top,否则默认右下避让右栏。
  const positionStyle: React.CSSProperties = positioned && pos
    ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
    : { right: 'calc(78px + var(--space-2))', bottom: 'var(--space-1)', left: 'auto', top: 'auto' }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        ...positionStyle,
        width: MINIMAP_W,
        zIndex: 10,
        background: 'var(--color-white)',
        border: '2px solid var(--color-black)',
        boxShadow: '4px 4px 0 0 var(--color-black)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {/* 标题栏:mono small-caps 标题 + 折叠开关。可拖拽(cursor: move)。group landmark。 */}
      <div
        role="group"
        aria-label={title}
        onPointerDown={onTitlePointerDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-1)',
          borderBottom: collapsed ? 'none' : 'var(--border-hairline)',
          cursor: 'move',
          touchAction: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-black)',
          }}
        >
          {title}
        </span>
        <button
          type="button"
          className="cv-chrome-toggle"
          onClick={() => {
            // 拖拽刚结束(pointerup 后浏览器仍 fire click)→ 吞掉,不折叠
            if (justDraggedRef.current) { justDraggedRef.current = false; return }
            const next = !collapsed
            setCollapsed(next)
            try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* quota */ }
          }}
          aria-label={collapseLabel}
          aria-expanded={!collapsed}
          title={collapseLabel}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      {!collapsed && (
        <canvas
          ref={miniRef}
          width={MINIMAP_W}
          height={MINIMAP_H}
          onClick={onClick}
          onPointerDown={onPointerDown}
          aria-label={title}
          style={{
            display: 'block',
            width: MINIMAP_W,
            height: MINIMAP_H,
            cursor: 'pointer',
            touchAction: 'none',
          }}
        />
      )}
    </div>
  )
}

/** 画单个元素的简化标记(不画内容,只占位/形状)。
 *  card=填色矩形、arrow=连线、rect=描边方框、text=横条、
 *  freedraw=点序列折线、legacy/其他=小圆点。颜色走 token(colorOf)。
 *  导出供 CanvasOverviewModal 复用(整画布缩略图视图,功能期批 3)。 */
export function drawElementMark(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  proj: { scale: number; offsetX: number; offsetY: number },
  /** 全部元素(用于解析关系箭头 from/to 端点)。可选:不传则 arrow 退化用 bbox。 */
  allElements?: CanvasElement[],
) {
  // 通用 bbox 投影(arrow / card / rect / text 复用)。
  const px = (pageX: number) => pageX * proj.scale + proj.offsetX
  const py = (pageY: number) => pageY * proj.scale + proj.offsetY

  if (el.kind === 'arrow') {
    // 关系箭头 bbox w=h=0(端点由 from/to 引用算),用 bbox 对角线画出来是一个点 — 看不见。
    // 必须解析 from/to 真实端点画线。curve/elbow 在 minimap 鸟瞰简化为直线(足够表达连接)。
    // 自由箭头(无 from/to)arrowEndpoints 返回 bbox 两角,w/h 非零,也是正确的线段。
    let from: { x: number; y: number } | null = null
    let to: { x: number; y: number } | null = null
    if (allElements) {
      const ends = arrowEndpoints(el, allElements)
      from = ends.from
      to = ends.to
    }
    // 无 elements 或端点解析失败 → 退化用 bbox 对角线(自由箭头 / 兜底)。
    if (!from || !to) {
      from = { x: el.x, y: el.y }
      to = { x: el.x + el.w, y: el.y + el.h }
    }
    // 端点重合(关系箭头指向自身 / 零尺寸)→ 画小圆点而非不可见的退化线。
    if (from.x === to.x && from.y === to.y) {
      ctx.save()
      ctx.fillStyle = colorOf(el.color)
      ctx.beginPath()
      ctx.arc(px(from.x), py(from.y), 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return
    }
    ctx.save()
    ctx.strokeStyle = colorOf(el.color)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px(from.x), py(from.y))
    ctx.lineTo(px(to.x), py(to.y))
    ctx.stroke()
    ctx.restore()
    return
  }

  if (el.kind === 'card') {
    const x = px(el.x)
    const y = py(el.y)
    const w = el.w * proj.scale
    const h = el.h * proj.scale
    ctx.save()
    ctx.fillStyle = el.color
      ? colorOf(el.color)
      : readToken('--color-gray-soft', '#e5e5e5')
    ctx.fillRect(x, y, Math.max(w, 2), Math.max(h, 2))
    ctx.strokeStyle = readToken('--color-black', '#0a0a0a')
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, Math.max(w, 2), Math.max(h, 2))
    ctx.restore()
    return
  }

  // rect(自由矩形):描边方框,与填色 card 区分。
  if (el.kind === 'rect') {
    const x = px(el.x)
    const y = py(el.y)
    const w = el.w * proj.scale
    const h = el.h * proj.scale
    ctx.save()
    ctx.strokeStyle = colorOf(el.color)
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, Math.max(w, 2), Math.max(h, 2))
    ctx.restore()
    return
  }

  // frame(主题分区):虚线描边方框 + 半透明填充,与实线 rect 区分(对齐实时渲染语义)。
  // frame 是最底层容器(z=-1),鸟瞰里要能看到分区结构,不能落 fallback 小圆点。
  if (el.kind === 'frame') {
    const x = px(el.x)
    const y = py(el.y)
    const w = el.w * proj.scale
    const h = el.h * proj.scale
    ctx.save()
    ctx.fillStyle = colorOf(el.color)
    ctx.globalAlpha = 0.12
    ctx.fillRect(x, y, Math.max(w, 4), Math.max(h, 4))
    ctx.globalAlpha = 1
    ctx.strokeStyle = colorOf(el.color)
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    ctx.strokeRect(x, y, Math.max(w, 4), Math.max(h, 4))
    ctx.restore()
    return
  }

  // text:又宽又矮 → 短宽横条描边(高度补足到 ≥2px 才看得见)。
  if (el.kind === 'text') {
    const x = px(el.x)
    const y = py(el.y)
    const w = el.w * proj.scale
    const h = Math.max(el.h * proj.scale, 2)
    ctx.save()
    ctx.strokeStyle = colorOf(el.color)
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, Math.max(w, 4), h)
    ctx.restore()
    return
  }

  // freedraw:真实点序列(绝对页坐标)→ 折线(与 elements-to-svg.ts:111 同源访问)。
  // 纯本地渲染(画用户自己的点在自己的小地图),不进任何 AI/snapshot 路径。
  if (el.kind === 'freedraw') {
    const pts = freedrawPointsOf(el) ?? []
    if (pts.length >= 2) {
      ctx.save()
      ctx.strokeStyle = colorOf(el.color)
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const X = px(pts[i]![0])
        const Y = py(pts[i]![1])
        if (i === 0) ctx.moveTo(X, Y)
        else ctx.lineTo(X, Y)
      }
      ctx.stroke()
      ctx.restore()
      return
    }
    if (pts.length === 1) {
      // 单点 freedraw:小圆点(与实时渲染/elements-to-svg 单点一致)。
      const X = px(pts[0]![0])
      const Y = py(pts[0]![1])
      ctx.save()
      ctx.fillStyle = colorOf(el.color)
      ctx.beginPath()
      ctx.arc(X, Y, 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return
    }
    // 无点 → 落回中心点(下方 fallback)。
  }

  // legacy / 无点 freedraw / 其他:小圆点(bbox 中心)。
  const cx = px(el.x + el.w / 2)
  const cy = py(el.y + el.h / 2)
  ctx.save()
  ctx.fillStyle = colorOf(el.color)
  ctx.beginPath()
  ctx.arc(cx, cy, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
