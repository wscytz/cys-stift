'use client'

/**
 * SelfCanvas — SelfBuiltAdapter 主路由版(Phase 2 子项目 1)。
 * 接 CardService(经 Phase 0 host 无关的 canvas-binding)+ 多画布(key=canvasId 重建)
 * + 视图持久化(canvasViewStore,经 host.getView/setView)+ 双击开卡(select 模式命中)。
 * 零 tldraw。卡片用 SelfBuiltAdapter 现有简化渲染(只 title)——完整渲染留子项目 2。
 *
 * 暂不接 toolbar/导出/关系(子项目 2/3/4)。双击开卡靠 select 模式 dblclick;
 * shape 增删(发回/归档/删除)由 page 经 adapterRef 调 canvas-binding。
 */
import { useEffect, useRef } from 'react'
import type { CanvasId, Card, CardService } from '@cys-stift/domain'
import {
  loadCardsIntoEditor,
  bindCardWriteback,
} from './canvas-binding'
import { SelfBuiltAdapter } from './host/self-built-adapter'
import { canvasViewStore } from '@/lib/canvas-view-store'
import { screenToPage } from './host/self-built-hittest'

export interface SelfCanvasHandle {
  adapter: SelfBuiltAdapter | null
}

export function SelfCanvas({
  canvasId,
  service,
  onOpenCard,
  adapterRef,
  canvasElRef,
}: {
  canvasId: CanvasId
  service: CardService
  onOpenCard: (card: Card) => void
  adapterRef: React.MutableRefObject<SelfCanvasHandle>
  /** Page-supplied ref so the RelationPanel can read the canvas rect for
   *  positioning (子4: panel floats above selected arrow, needs screen coords). */
  canvasElRef?: React.MutableRefObject<HTMLCanvasElement | null>
}) {
  const innerCanvasRef = useRef<HTMLCanvasElement>(null)
  const adapterInner = useRef<SelfBuiltAdapter | null>(null)

  useEffect(() => {
    const canvas = innerCanvasRef.current
    if (canvas) {
      if (canvasElRef) canvasElRef.current = canvas
    }
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardInfo: (id) => {
        const c = service.get(id as never)
        return c ? { title: c.title, body: c.body ?? '', type: c.type, pinned: c.pinned } : null
      },
    })
    adapterInner.current = adapter
    adapterRef.current = { adapter }

    // 视图持久化:先应用存的 view,再订阅变更写回。
    const view = canvasViewStore.get(canvasId)
    adapter.setView({ panX: view.panX, panY: view.panY, zoom: view.zoom, gridMode: view.gridMode })

    loadCardsIntoEditor(adapter, service, canvasId)
    const unbind = bindCardWriteback(adapter, service, canvasId)

    // 视图持久化:onViewChange + 500ms debounce 写 canvasViewStore(替代轮询)。
    let viewTimer: ReturnType<typeof setTimeout> | null = null
    const unbindView = adapter.onViewChange(() => {
      if (viewTimer) clearTimeout(viewTimer)
      viewTimer = setTimeout(() => {
        const v = adapter.getView()
        canvasViewStore.update(canvasId, {
          zoom: v.zoom,
          panX: v.panX,
          panY: v.panY,
          gridMode: v.gridMode,
        })
      }, 500)
    })

    return () => {
      if (viewTimer) {
        clearTimeout(viewTimer)
        const v = adapter.getView()
        canvasViewStore.update(canvasId, {
          zoom: v.zoom,
          panX: v.panX,
          panY: v.panY,
          gridMode: v.gridMode,
        })
      }
      unbindView()
      unbind()
      adapter.detach()
      adapterInner.current = null
      adapterRef.current = { adapter: null }
      if (canvasElRef) canvasElRef.current = null
    }
  }, [canvasId, service, adapterRef])

  // 双击开卡:select 模式下 dblclick 命中卡元素 → onOpenCard。
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const adapter = adapterInner.current
    const canvas = innerCanvasRef.current
    if (!adapter || !canvas) return
    if (adapter.getTool() !== 'select') return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const view = adapter.getView()
    const p = screenToPage(view, sx, sy)
    // 命中测试:SelfBuiltAdapter 的 hitTest 是纯函数,这里复用元素查找。
    // adapter 没暴露 hitTest,用 getElements 遍历(简化;子项目 2 加 host.hitTest)。
    const els = adapter.getElements()
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]!
      if (el.kind === 'card' && p.x >= el.x && p.x <= el.x + el.w && p.y >= el.y && p.y <= el.y + el.h) {
        const card = service.get(el.id as never)
        if (card) onOpenCard(card)
        return
      }
    }
  }

  return (
    <canvas
      ref={innerCanvasRef}
      onDoubleClick={onDoubleClick}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  )
}
