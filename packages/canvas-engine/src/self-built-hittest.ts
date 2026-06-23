
import type { CanvasElement, CanvasView } from './canvas-host'
import { normalizeBox } from './bounds'

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
    const b = normalizeBox(el) // 负 bbox(自由箭头方向编码)归一化,否则区间为空命不中
    if (pageX >= b.x && pageX <= b.x + b.w && pageY >= b.y && pageY <= b.y + b.h) {
      return el.id
    }
  }
  return null
}
