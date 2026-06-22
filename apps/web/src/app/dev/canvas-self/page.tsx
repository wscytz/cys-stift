'use client'

/**
 * Phase 1 dev 挂载页 — SelfBuiltAdapter(Canvas 2D)与主画布(tldraw)并存验证。
 * 复用 Phase 0 的 canvas-binding(host 无关):卡片从 CardService 加载、拖拽回写。
 * freedraw(本计划):Select/Draw 工具切换;Draw 模式手绘 → 向量点序列。
 * 不碰主路由 /canvas;Phase 2 真正替换 tldraw 才动 /canvas。
 */
import { useEffect, useRef, useState } from 'react'
import { useDb } from '@/lib/db-client'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { loadCardsIntoEditor, bindCardWriteback } from '@/features/canvas/canvas-binding'
import { SelfBuiltAdapter } from '@/features/canvas/host/self-built-adapter'

type Tool = 'select' | 'freedraw'

export default function CanvasSelfPage() {
  const { service } = useDb()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const adapterRef = useRef<SelfBuiltAdapter | null>(null)
  const [tool, setTool] = useState<Tool>('select')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardLabel: (id) => service.get(id as never)?.title ?? '',
    })
    adapterRef.current = adapter
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __selfAdapter?: SelfBuiltAdapter }).__selfAdapter = adapter
    }
    loadCardsIntoEditor(adapter, service, DEFAULT_CANVAS_ID)
    const unbind = bindCardWriteback(adapter, service, DEFAULT_CANVAS_ID)
    return () => {
      unbind()
      adapter.detach()
      adapterRef.current = null
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __selfAdapter?: SelfBuiltAdapter }).__selfAdapter
      }
    }
  }, [service])

  const switchTool = (t: Tool) => {
    setTool(t)
    adapterRef.current?.setTool(t)
  }

  const btn = (t: Tool, label: string) => (
    <button
      onClick={() => switchTool(t)}
      style={{
        padding: 'var(--space-1) var(--space-2)',
        border: 'var(--border-hairline)',
        background: tool === t ? 'var(--color-black)' : 'var(--color-white)',
        color: tool === t ? 'var(--color-white)' : 'var(--color-black)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 'var(--space-2)', left: 'var(--space-2)', display: 'flex', gap: 'var(--space-1)', zIndex: 10 }}>
        {btn('select', 'Select')}
        {btn('freedraw', 'Draw')}
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
    </div>
  )
}
