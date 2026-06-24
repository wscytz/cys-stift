
import type { CanvasElement, CanvasView } from './canvas-host'
import { normalizeBox } from './bounds'
import { arrowEndpoints } from './self-built-arrow'

/** 命中容差:屏幕 6px,页坐标里 /zoom(由调用方传入)。 */
const HIT_TOLERANCE_PX = 6

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
 *
 * - **arrow**:按**线段距离**命中(点到 from→to 线段距离 < 容差)。关系箭头 bbox 是
 *   w=h=0(端点由 from/to 算),bbox 命中只有单点 → 选不中;线段命中才对。自由箭头
 *   (bbox 非零)也走线段,一致。端点解析失败(from/to 指向不存在元素且 bbox 零)→ 跳过。
 * - 其它 kind:bbox 命中(已 normalizeBox 归一化负 bbox)。
 *
 * `zoom` 用于把屏幕容差(6px)换算成页坐标(页坐标容差 = 6/zoom);默认 1(纯函数测试)。
 */
export function hitTest(
  elements: CanvasElement[],
  pageX: number,
  pageY: number,
  zoom: number = 1,
): string | null {
  const tol = HIT_TOLERANCE_PX / zoom
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!
    if (el.kind === 'arrow') {
      const { from, to } = arrowEndpoints(el, elements)
      if (from && to && pointToSegmentDistance(pageX, pageY, from.x, from.y, to.x, to.y) <= tol) {
        return el.id
      }
      continue
    }
    const b = normalizeBox(el) // 负 bbox(自由箭头方向编码)归一化,否则区间为空命不中
    if (pageX >= b.x && pageX <= b.x + b.w && pageY >= b.y && pageY <= b.y + b.h) {
      return el.id
    }
  }
  return null
}

/** 点 (px,py) 到线段 (ax,ay)-(bx,by) 的最短距离。 */
function pointToSegmentDistance(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay) // 退化:线段是点
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t)) // 钳到线段上
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
