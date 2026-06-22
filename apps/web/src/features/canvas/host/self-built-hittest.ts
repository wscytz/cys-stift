'use client'

import type { CanvasElement, CanvasView } from './canvas-host'

/** 屏幕坐标(CSS px)→ 页坐标(扣 pan、除 zoom)。 */
export function screenToPage(
  view: CanvasView,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom }
}

/**
 * 命中测试:返回包含页坐标 (pageX,pageY) 的最上层元素 id,无则 null。
 * 「最上层」= 数组末尾(后画的盖先画的)。
 */
export function hitTest(
  elements: CanvasElement[],
  pageX: number,
  pageY: number,
): string | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!
    if (pageX >= el.x && pageX <= el.x + el.w && pageY >= el.y && pageY <= el.y + el.h) {
      return el.id
    }
  }
  return null
}
