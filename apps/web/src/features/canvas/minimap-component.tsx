'use client'

/**
 * Minimap (component) — 鸟瞰导航(画布角落小地图)。
 *
 * 浮在画布右下角(Bauhaus 白底 + 黑边 + 硬阴影,与 RelationPanel 一致)。每帧重绘:
 *   1. 算 projection(全部元素 bbox fit 进 minimap)+ viewportRect(当前可见页矩形)
 *   2. 画元素:card=矩形、arrow=线、其他(freedraw/rect/text)= 小点
 *   3. 画视口框(dashed)
 * 点击 minimap → 把对应页坐标居中(setView 调 pan)。
 *
 * 只读 host(getElements/getView/setView/onViewChange/onUserChange),不碰引擎逻辑。
 * 颜色走 token(readToken 读 CSS 变量,fallback hex)。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import { readToken, colorOf } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import {
  computeMinimapProjection,
  viewportRect,
  minimapClickToPage,
} from './minimap'

const MINIMAP_W = 160
const MINIMAP_H = 120

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
  const [collapsed, setCollapsed] = useState(false)
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

    const elements = host.getElements()
    const view = host.getView()
    const proj = computeMinimapProjection(elements, { w: MINIMAP_W, h: MINIMAP_H })

    // 清空。
    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H)
    ctx.fillStyle = readToken('--color-white', '#ffffff')
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H)

    // 画元素。
    for (const el of elements) {
      drawElementMark(ctx, el, proj)
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
    // 初始一帧 + resize 时重绘。
    scheduleDraw()
    const onResize = () => scheduleDraw()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      for (const u of unsubs) u()
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [host, scheduleDraw])

  // 展开后画布是新挂载的空 canvas,host 事件不会自动触发重绘——这里补一帧。
  useEffect(() => {
    if (!collapsed) scheduleDraw()
  }, [collapsed, scheduleDraw])

  // 点击 minimap → 该页坐标居中。
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!host || !canvasEl) return
    const mini = miniRef.current
    if (!mini) return
    const rect = mini.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    // minimap 内坐标(canvas 物理尺寸 = CSS 尺寸,不 DPR 放大,简化)。
    const clickMini = {
      x: (sx / rect.width) * MINIMAP_W,
      y: (sy / rect.height) * MINIMAP_H,
    }
    const elements = host.getElements()
    const proj = computeMinimapProjection(elements, { w: MINIMAP_W, h: MINIMAP_H })
    const pageP = minimapClickToPage(clickMini, proj)
    // 算 pan 使 pageP 居中:屏幕中心 = pan + pageP*zoom → pan = screenCenter - pageP*zoom。
    const view = host.getView()
    const zoom = view.zoom || 1
    const cx = canvasEl.clientWidth / 2
    const cy = canvasEl.clientHeight / 2
    host.setView({
      ...view,
      panX: cx - pageP.x * zoom,
      panY: cy - pageP.y * zoom,
    })
  }

  if (!host || !canvasEl) return null

  const title = t('canvas.minimap')

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: MINIMAP_W,
        zIndex: 15,
        background: 'var(--color-white)',
        border: '2px solid var(--color-black)',
        boxShadow: '4px 4px 0 0 var(--color-black)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {/* 标题栏:mono small-caps 标题 + 折叠开关。 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-1)',
          borderBottom: collapsed ? 'none' : 'var(--border-hairline)',
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
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? `${title} expand` : `${title} collapse`}
          aria-expanded={!collapsed}
          title={collapsed ? `${title} expand` : `${title} collapse`}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1,
            padding: '0 4px',
            background: 'transparent',
            color: 'var(--color-black)',
            border: 'none',
            cursor: 'pointer',
          }}
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
          aria-label={title}
          style={{
            display: 'block',
            width: MINIMAP_W,
            height: MINIMAP_H,
            cursor: 'pointer',
          }}
        />
      )}
    </div>
  )
}

/** 画单个元素的简化标记(不画内容,只占位/形状)。
 *  card=填色矩形、arrow=连线、其他=小圆点。颜色走 token(colorOf)。 */
function drawElementMark(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  proj: { scale: number; offsetX: number; offsetY: number },
) {
  if (el.kind === 'arrow') {
    // arrow 几何:from/to 端点未解析时用 bbox 对角线端点。
    const x1 = el.x * proj.scale + proj.offsetX
    const y1 = el.y * proj.scale + proj.offsetY
    const x2 = (el.x + el.w) * proj.scale + proj.offsetX
    const y2 = (el.y + el.h) * proj.scale + proj.offsetY
    ctx.save()
    ctx.strokeStyle = colorOf(el.color)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.restore()
    return
  }
  if (el.kind === 'card') {
    const x = el.x * proj.scale + proj.offsetX
    const y = el.y * proj.scale + proj.offsetY
    const w = el.w * proj.scale
    const h = el.h * proj.scale
    ctx.save()
    ctx.fillStyle = colorOf(el.color)
    ctx.fillRect(x, y, Math.max(w, 2), Math.max(h, 2))
    ctx.strokeStyle = readToken('--color-black', '#0a0a0a')
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, Math.max(w, 2), Math.max(h, 2))
    ctx.restore()
    return
  }
  // freedraw / rect / text / legacy:小圆点(中心)。
  const cx = (el.x + el.w / 2) * proj.scale + proj.offsetX
  const cy = (el.y + el.h / 2) * proj.scale + proj.offsetY
  ctx.save()
  ctx.fillStyle = colorOf(el.color)
  ctx.beginPath()
  ctx.arc(cx, cy, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
