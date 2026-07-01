'use client'

/**
 * CanvasOverviewModal — 画布全局缩略图视图(功能期批 3)。
 *
 * 空间鸟瞰第三态,互补 Minimap(角落局部视口)与 Outline(文字结构树):
 * 大尺寸整画布缩略,所有元素 fit 进 ~640×440 canvas,viewport 框标当前可见区。
 * 点击缩略图任意位置 → 居中视口到该页坐标(同 Minimap 的 centerOnMiniPoint)。
 *
 * 复用 minimac 的纯函数(computeMinimapProjection / viewportRect / minimapClickToPage)
 * + drawElementMark(从 minimap-component 导出)。只读 host,不碰引擎逻辑。
 */
import { useEffect, useRef, useState } from 'react'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { readToken } from '@cys-stift/canvas-engine'
import { Modal } from '@cys-stift/ui'
import { useI18n } from '@/lib/i18n'
import {
  computeMinimapProjection,
  viewportRect,
  minimapClickToPage,
} from './minimap'
import { drawElementMark } from './minimap-component'

const OVERVIEW_W = 640
const OVERVIEW_H = 440

export function CanvasOverviewModal({
  open,
  onClose,
  host,
  canvasEl,
}: {
  open: boolean
  onClose: () => void
  host: CanvasHost | null
  /** 主画布 canvas(读 css 尺寸算 viewport)。null → 空态。 */
  canvasEl: HTMLCanvasElement | null
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [, force] = useState(0)

  // 订阅 host 变更重绘(同 Minimap)。
  useEffect(() => {
    if (!host || !open) return
    const bump = () => force((n) => n + 1)
    const unsubs = [
      host.onViewChange(bump),
      host.onUserChange(bump),
      host.onSelectionChange(bump),
    ]
    return () => {
      for (const u of unsubs) u()
    }
  }, [host, open])

  // open 时画一帧(modal 挂载后 canvas 才在 DOM)。
  useEffect(() => {
    if (!open) return
    force((n) => n + 1)
  }, [open])

  const draw = () => {
    const cvs = canvasRef.current
    const ctx = cvs?.getContext('2d')
    if (!host || !cvs || !ctx) return
    const hostSize = canvasEl
      ? { w: canvasEl.clientWidth, h: canvasEl.clientHeight }
      : { w: 0, h: 0 }
    const elements = host.getElements()
    const view = host.getView()
    const proj = computeMinimapProjection(elements, { w: OVERVIEW_W, h: OVERVIEW_H })

    ctx.clearRect(0, 0, OVERVIEW_W, OVERVIEW_H)
    ctx.fillStyle = readToken('--color-white', '#ffffff')
    ctx.fillRect(0, 0, OVERVIEW_W, OVERVIEW_H)

    for (const el of elements) drawElementMark(ctx, el, proj, elements)

    // 视口框(dashed,同 Minimap)。
    if (hostSize.w > 0 && hostSize.h > 0) {
      const vp = viewportRect(view, hostSize)
      const vx = vp.x * proj.scale + proj.offsetX
      const vy = vp.y * proj.scale + proj.offsetY
      const vw = vp.w * proj.scale
      const vh = vp.h * proj.scale
      ctx.save()
      ctx.strokeStyle = readToken('--color-black', '#0a0a0a')
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 3])
      ctx.strokeRect(vx, vy, vw, vh)
      ctx.restore()
    }
  }

  // 每渲染画一帧(canvas ref 就绪后)。
  if (open) draw()

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!host || !canvasEl) return
    const cvs = canvasRef.current
    const rect = cvs?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const clickMini = {
      x: (sx / rect.width) * OVERVIEW_W,
      y: (sy / rect.height) * OVERVIEW_H,
    }
    const elements = host.getElements()
    const proj = computeMinimapProjection(elements, { w: OVERVIEW_W, h: OVERVIEW_H })
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
  }

  const empty = host === null

  return (
    <Modal open={open} onClose={onClose} title={t('canvas.overview')}>
      <p className="cv-overview__lede">{t('canvas.overviewLede')}</p>
      {empty ? (
        <p className="cv-overview__empty">{t('canvas.overviewEmpty')}</p>
      ) : (
        <canvas
          ref={canvasRef}
          width={OVERVIEW_W}
          height={OVERVIEW_H}
          onClick={onClick}
          aria-label={t('canvas.overview')}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: OVERVIEW_W,
            height: 'auto',
            cursor: 'pointer',
            touchAction: 'none',
            border: '2px solid var(--color-black)',
            boxShadow: '4px 4px 0 0 var(--color-black)',
          }}
        />
      )}
      <style>{styles}</style>
    </Modal>
  )
}

const styles = `
.cv-overview__lede {
  margin: 0 0 var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-black-soft);
}
.cv-overview__empty {
  margin: 0;
  padding: var(--space-4);
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-black-soft);
}
`
