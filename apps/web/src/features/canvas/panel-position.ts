/**
 * clamp-panel-position — 共享小工具:把浮出面板(relation / freedraw)的
 * `position: fixed` + `translateX(-50%)` 锚点(left/top)夹在视口内,避免面板
 * 在元素贴近视口右/上边时被裁切或半截跑到屏外。
 *
 * 测量策略:不写死尺寸,用 useLayoutEffect 读已渲染 DOM 的 offsetWidth/
 * offsetHeight,首次渲染用 fallback(稍后 effect 跑完会带正确尺寸再夹一次)。
 *
 * `left` 是中心 x(translateX(-50%) 以它居中),夹到 [w/2+m, vw - w/2 - m]。
 * `top` 是面板顶边 y,夹到 [TOOLBAR_OFFSET, vh - h - m](顶部留出画布工具栏空间)。
 */

import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

const MARGIN = 8
/** 画布顶部工具栏的大致高度,面板顶边不能压到它上面。 */
export const TOOLBAR_OFFSET = 72
/** 浮动面板(relation/freedraw)在目标元素上方的偏移(= 面板高度估计 + 间距)。
 *  让面板出现在元素上方而非遮挡。改面板 padding/内容行数要同步此估计;
 *  clamp hook(useClampedPanelPosition)会实测 offsetHeight 修正视口内的夹紧,
 *  此值只影响面板相对元素的垂直位置(偏高/偏低),不影响是否在屏内。 */
export const FLOATING_PANEL_OFFSET = 56

export interface PanelAnchor {
  /** 中心 x(pre-translateX 的居中锚点)。 */
  left: number
  /** 面板顶边 y。 */
  top: number
}

/**
 * 给一个浮出面板的 ref + 理想锚点,返回夹在视口内的锚点。
 * 首次测量前用 fallback 尺寸,避免首帧错位。
 */
export function useClampedPanelPosition(
  ref: RefObject<HTMLElement | null>,
  ideal: PanelAnchor | null,
  fallback: { width: number; height: number },
): PanelAnchor | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  // Track the viewport so a re-clamp fires when the window shrinks (a panel
  // clamped inside a wide window would otherwise overflow / sit off-screen
  // after the window is made smaller — the regression from the J/K/L round).
  const [viewport, setViewport] = useState<{ vw: number; vh: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    // Read + track viewport size (also feeds the initial value).
    if (typeof window !== 'undefined') {
      setViewport({ vw: window.innerWidth, vh: window.innerHeight })
    }
    const onResize = () => {
      if (typeof window === 'undefined') return
      setViewport((prev) => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        if (prev && prev.vw === vw && prev.vh === vh) return prev
        return { vw, vh }
      })
    }
    window.addEventListener('resize', onResize)
    if (!el) return () => window.removeEventListener('resize', onResize)
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w > 0 && h > 0) setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    // 尺寸可能随内容/语言变(RelationPanel 按钮文案长度变化),用 ResizeObserver 跟。
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [ref])

  if (!ideal) return null
  const w = size?.w ?? fallback.width
  const h = size?.h ?? fallback.height
  const vw = viewport?.vw ?? (typeof window !== 'undefined' ? window.innerWidth : 1280)
  const vh = viewport?.vh ?? (typeof window !== 'undefined' ? window.innerHeight : 720)

  // left(中心 x):左/右半宽 + margin 都要在屏内。
  const minLeft = w / 2 + MARGIN
  const maxLeft = Math.max(minLeft, vw - w / 2 - MARGIN)
  const left = Math.min(Math.max(ideal.left, minLeft), maxLeft)

  // top(面板顶边):不压工具栏,不溢出底部。面板比可用区高时(矮视口),
  // maxTop 会回落到 minTop,面板从 TOOLBAR_OFFSET 起(顶部对齐,底部溢出可接受)。
  const minTop = TOOLBAR_OFFSET
  const maxTop = Math.max(minTop, vh - h - MARGIN)
  const top = Math.min(Math.max(ideal.top, minTop), maxTop)

  return { left, top }
}
