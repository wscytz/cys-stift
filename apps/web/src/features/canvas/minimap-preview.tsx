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
 * 拖拽位置 = Task 3 的活,本组件仅 render + 收起剩角。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import { readToken } from '@cys-stift/canvas-engine'
import { computeMinimapProjection } from './minimap'
import { drawElementMark } from './minimap-component'

const PREVIEW_W = 240
const PREVIEW_H = 180
const COLLAPSED_KEY = 'cys-stift.workbench-preview-collapsed.v1'

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(COLLAPSED_KEY) === '1'
}

export function MinimapPreview({ host }: { host: CanvasHost | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed)

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

  // 收起态切换 + 持久(独立 key,不污染正常 minimap)
  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* quota */ }
  }

  if (!host) return null

  if (collapsed) {
    // 收起剩一个小角(~32×32 chip 贴右上),不占整条边
    return (
      <div
        data-testid="mp-chip"
        style={{
          position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', zIndex: 30,
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
      style={{
        position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', zIndex: 30,
        width: PREVIEW_W,
        background: 'var(--color-white)', border: '2px solid var(--color-black)',
        boxShadow: '4px 4px 0 0 var(--color-black)', borderRadius: 'var(--radius-sm)',
      }}
    >
      <div
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
