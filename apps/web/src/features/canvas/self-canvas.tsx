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
}: {
  canvasId: CanvasId
  service: CardService
  onOpenCard: (card: Card) => void
  adapterRef: React.MutableRefObject<SelfCanvasHandle>
}) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const adapterInner = useRef<SelfBuiltAdapter | null>(null)

  useEffect(() => {
    const canvas = canvasElRef.current
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardLabel: (id) => service.get(id as never)?.title ?? '',
    })
    adapterInner.current = adapter
    adapterRef.current = { adapter }

    // 视图持久化:先应用存的 view,再订阅变更写回。
    const view = canvasViewStore.get(canvasId)
    adapter.setView({ panX: view.panX, panY: view.panY, zoom: view.zoom, gridMode: view.gridMode })

    loadCardsIntoEditor(adapter, service, canvasId)
    const unbind = bindCardWriteback(adapter, service, canvasId)

    // 视图变更写回 canvasViewStore(debounce 500ms,同 tldraw 版)。
    let timer: ReturnType<typeof setTimeout> | null = null
    const writeView = () => {
      const v = adapter.getView()
      canvasViewStore.update(canvasId, {
        zoom: v.zoom,
        panX: v.panX,
        panY: v.panY,
        gridMode: v.gridMode,
      })
    }
    const interval = window.setInterval(() => {
      // SelfBuiltAdapter 无 onViewChange;轮询视图(pan/zoom 时 setView 改了 view)。
      // 轻量:每 500ms 查一次,有变才写。子项目 2 接 toolbar 时再优化成事件。
      writeView()
    }, 500)

    return () => {
      if (timer) clearTimeout(timer)
      window.clearInterval(interval)
      writeView() // 卸载前 flush
      unbind()
      adapter.detach()
      adapterInner.current = null
      adapterRef.current = { adapter: null }
    }
  }, [canvasId, service, adapterRef])

  // 双击开卡:select 模式下 dblclick 命中卡元素 → onOpenCard。
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const adapter = adapterInner.current
    const canvas = canvasElRef.current
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
      ref={canvasElRef}
      onDoubleClick={onDoubleClick}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  )
}
