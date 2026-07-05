'use client'

/**
 * MinimapPreview —— 工作台专注编辑态的画布预览(独立组件,**不复用** Minimap)。
 *
 * 与右下原 Minimap 区分:更大(~240×180)/ 默认右上角 / 收起剩一个小角(不条状)。
 * 复用 `minimap.ts` 投影纯函数 + `minimap-component` 的 `drawElementMark`;组件壳
 * + 收起/拖拽逻辑自建。**被动参考**:不响应 click-to-center(专注态画布隐,无 canvas
 * 可 recenter);退出专注走 dock 头部按钮。
 *
 * 数据源:host(elements + view)订阅 onViewChange/onUserChange/onSelectionChange 触发重绘。
 * 专注态 .cv-host 是 display:none 不卸载,host 仍存活 → 预览照常渲染。
 *
 * 颜色走 token(readToken 读 CSS 变量,fallback hex),与 minimap-component 同源。
 * 拖拽位置 + 持久(独立 key,不污染右下原 Minimap)。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import { readToken } from '@cys-stift/canvas-engine'
import { computeMinimapProjection } from './minimap'
import { drawElementMark } from './minimap-component'

const PREVIEW_W = 240
const PREVIEW_H = 180
const COLLAPSED_KEY = 'cys-stift.workbench-preview-collapsed.v1'
// 拖拽位置持久 key(独立于右下原 Minimap 的 cys-stift.minimap-pos.v1,不污染它)。
const POSITION_KEY = 'cys-stift.workbench-preview-pos.v1'

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(COLLAPSED_KEY) === '1'
}

/** 拖拽位置:left/top 二选一锚定(双 null = 用默认右上角)。镜像 minimap-component 的 MinimapPos。 */
interface PreviewPos {
  left: number | null
  top: number | null
}

const DEFAULT_POS: PreviewPos = { left: null, top: null }

/** 读 localStorage 还原位置。校验同 minimap-component:48-58(任一字段是 number 才接受)。 */
function loadPos(): PreviewPos {
  if (typeof window === 'undefined') return DEFAULT_POS
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (!raw) return DEFAULT_POS
    const p = JSON.parse(raw) as Partial<PreviewPos>
    if (typeof p.left === 'number' || typeof p.top === 'number') {
      return {
        left: typeof p.left === 'number' ? p.left : null,
        top: typeof p.top === 'number' ? p.top : null,
      }
    }
  } catch { /* ignore corrupt JSON */ }
  return DEFAULT_POS
}

function savePos(p: PreviewPos): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(p)) } catch { /* quota */ }
}

export function MinimapPreview({ host }: { host: CanvasHost | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed)
  // 拖拽位置:默认 null(null = 用 CSS 默认右上角 var(--space-2))。
  // mount 后从 localStorage 还原;拖拽中实时 setPos + 持久化。
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<PreviewPos>(DEFAULT_POS)
  // 跳过首次 effect 写入(避免初始化 DEFAULT_POS 也写一次 localStorage)。
  // 同 minimap-component.tsx:242 的 wroteInitialRef 范式。
  const wroteInitialPosRef = useRef(false)
  // 拖拽刚结束(pointerup 后浏览器仍 fire click)→ 吞掉,不折叠。
  // 镜像 minimap-component.tsx:239 的 justDraggedRef 范式。
  // 必要性:collapse 按钮是 header div 的 CHILD(不是兄弟),pointerdown 在按钮上
  // 冒泡到 header → 一旦 >3px 触发拖拽 → pointerup 后浏览器在按钮上合成 click →
  // toggleCollapse 误折叠。3px dead zone 只防 click→drag 误判,不防 drag→click 反向。
  const justDraggedRef = useRef(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !host) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const elements = host.getElements()
    const proj = computeMinimapProjection(elements, { w: PREVIEW_W, h: PREVIEW_H })
    const dpr = window.devicePixelRatio || 1
    canvas.width = PREVIEW_W * dpr
    canvas.height = PREVIEW_H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H)
    // Canvas 2D 不解析 CSS var —— 用 readToken 解析(同 minimap-component.tsx:109)。
    ctx.fillStyle = readToken('--color-canvas', '#ffffff')
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H)
    for (const el of elements) drawElementMark(ctx, el as CanvasElement, proj, elements as CanvasElement[])
  }, [host])

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
    scheduleDraw()
    return () => {
      for (const u of unsubs) u()
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
  }, [host, scheduleDraw])

  // 展开后画布是新挂载的空 canvas,host 事件不会自动触发重绘——这里补一帧。
  // (订阅 effect 的 deps 是 [host, scheduleDraw],collapsed 翻转两者都不变 →
  // 没有这一帧,展开后画布会一直空白到下一次 host 事件。同 minimap-component.tsx:162)
  useEffect(() => {
    if (!host || collapsed) return
    scheduleDraw()
  }, [host, collapsed, scheduleDraw])

  // mount 读 localStorage 还原位置。同 minimap-component.tsx:83 范式(SSR 安全)。
  useEffect(() => { setPos(loadPos()) }, [])

  // pos 变化 → 持久化(跳过首次 DEFAULT_POS,避免初始化也写一次)。
  // 同 minimap-component.tsx:243-246 的 wroteInitialRef 范式。
  useEffect(() => {
    if (!wroteInitialPosRef.current) { wroteInitialPosRef.current = true; return }
    savePos(pos)
  }, [pos])

  // 拖拽 header 移动整个预览。镜像 minimap-component.tsx:253-287 的 onTitlePointerDown:
  //   - window 级 pointermove/up/cancel(拖出预览也跟随)
  //   - 3px dead zone 区分 click vs drag(避免点击折叠按钮被误判拖)
  //   - clamp 到 parentElement 内(不超出 dock panel)
  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const container = containerRef.current?.parentElement
    if (!container) return
    // 新一轮 pointerdown:重置 justDraggedRef,确保非拖拽 click 仍能折叠。
    // (上一轮拖拽若因 pointerup 在按钮外未触发 click,ref 会残留 true。)
    justDraggedRef.current = false
    const startClientX = e.clientX
    const startClientY = e.clientY
    const box = containerRef.current!.getBoundingClientRect()
    const startLeft = box.left
    const startTop = box.top
    let moved = false
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      moved = true
      justDraggedRef.current = true
      const contRect = container.getBoundingClientRect()
      // clamp:left ∈ [0, contW - PREVIEW_W - 4], top ∈ [0, contH - boxH]
      // box.height 是展开/收起实际高度(展开 ~204 = header 24 + canvas 180),
      // 不写死 40 否则展开态能被拖出容器底(minimap-component.tsx:272 同款注释)。
      const maxLeft = Math.max(0, contRect.width - PREVIEW_W - 4)
      const maxTop = Math.max(0, contRect.height - box.height)
      const newLeft = Math.min(Math.max(0, startLeft - contRect.left + dx), maxLeft)
      const newTop = Math.min(Math.max(0, startTop - contRect.top + dy), maxTop)
      setPos({ left: newLeft, top: newTop })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // 收起态切换 + 持久(独立 key,不污染正常 minimap)
  const toggleCollapse = () => {
    // 拖拽刚结束(pointerup 后浏览器仍 fire click)→ 吞掉,不折叠。
    // 同 minimap-component.tsx:341 的守卫。
    if (justDraggedRef.current) { justDraggedRef.current = false; return }
    const next = !collapsed
    setCollapsed(next)
    try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* quota */ }
  }

  if (!host) return null

  // 定位:有用户位置用 left/top,否则默认右上角 var(--space-2)。
  // 同 minimap-component.tsx:291-294 的 positionStyle 范式。
  const positioned = pos.left !== null && pos.top !== null
  const positionStyle: React.CSSProperties = positioned
    ? { left: pos.left!, top: pos.top!, right: 'auto', bottom: 'auto' }
    : { right: 'var(--space-2)', top: 'var(--space-2)', left: 'auto', bottom: 'auto' }

  if (collapsed) {
    // 收起剩一个小角(~32×32 chip 贴右上),不占整条边
    return (
      <div
        ref={containerRef}
        data-testid="mp-chip"
        style={{
          position: 'absolute', ...positionStyle, zIndex: 30,
          width: '32px', height: '32px',
          background: 'var(--color-white)', border: '2px solid var(--color-black)',
          boxShadow: '4px 4px 0 0 var(--color-black)', borderRadius: 'var(--radius-sm)',
          display: 'grid', placeItems: 'center', cursor: 'pointer',
        }}
        role="button" tabIndex={0} aria-label="展开画布预览"
        onClick={toggleCollapse}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse() } }}
      >▸</div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute', ...positionStyle, zIndex: 30,
        width: PREVIEW_W,
        background: 'var(--color-white)', border: '2px solid var(--color-black)',
        boxShadow: '4px 4px 0 0 var(--color-black)', borderRadius: 'var(--radius-sm)',
      }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-1)', borderBottom: 'var(--border-hairline)',
          cursor: 'move', touchAction: 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-black-soft)',
        }}>canvas</span>
        <button
          type="button" data-testid="mp-collapse"
          className="cv-chrome-toggle"
          onClick={toggleCollapse}
          aria-label="收起画布预览" aria-expanded={!collapsed} title="收起"
        >▾</button>
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: PREVIEW_W, height: PREVIEW_H }}
      />
    </div>
  )
}
