'use client'

/**
 * Phase 1 dev 挂载页 — SelfBuiltAdapter(Canvas 2D)与主画布(tldraw)并存验证。
 * 复用 Phase 0 的 canvas-binding(host 无关):卡片从 CardService 加载、拖拽回写。
 * 不碰主路由 /canvas;Phase 2 真正替换 tldraw 才动 /canvas。
 */
import { useEffect, useRef } from 'react'
import { useDb } from '@/lib/db-client'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { loadCardsIntoEditor, bindCardWriteback } from '@/features/canvas/canvas-binding'
import { SelfBuiltAdapter } from '@/features/canvas/host/self-built-adapter'

export default function CanvasSelfPage() {
  const { service } = useDb()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardLabel: (id) => service.get(id as never)?.title ?? '',
    })
    loadCardsIntoEditor(adapter, service, DEFAULT_CANVAS_ID)
    const unbind = bindCardWriteback(adapter, service, DEFAULT_CANVAS_ID)
    return () => {
      unbind()
      adapter.detach()
    }
  }, [service])

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
    </div>
  )
}
