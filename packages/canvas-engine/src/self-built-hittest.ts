
import type { CanvasElement, CanvasView } from './canvas-host'
import { normalizeBox } from './bounds'
import { arrowEndpoints, arrowRoute, elbowSegments, autoElbowPath, cardObstacles } from './self-built-arrow'

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
      if (from && to) {
        const route = arrowRoute(el)
        if (route === 'elbow') {
          // 折线箭头:点到每段折线距离取 min。
          // 手设 elbow → elbowSegments [from, ...elbow, to];
          // 空 elbow → autoElbowPath 自动绕障(obstacles 排除 from/to 卡),路径与渲染一致。
          const hasManual = !!(el.elbow && el.elbow.length > 0)
          const segs = hasManual
            ? elbowSegments(el, from, to)
            : autoElbowPath(
                el,
                from,
                to,
                cardObstacles(elements, new Set([el.from, el.to].filter((v): v is string => !!v))),
              )
          if (segs && segs.length >= 2) {
            for (let i = 1; i < segs.length; i++) {
              if (pointToSegmentDistance(pageX, pageY, segs[i - 1]!.x, segs[i - 1]!.y, segs[i]!.x, segs[i]!.y) <= tol) {
                return el.id
              }
            }
          }
          continue
        }
        if (route === 'curve' && el.curve) {
          // 弯曲箭头:沿二次贝塞尔采样,点到每段距离取 min。
          const ctrl = { x: el.curve.cx, y: el.curve.cy }
          const N = 16
          let prev = from
          let hit = false
          for (let s = 1; s <= N; s++) {
            const t = s / N
            // 二次贝塞尔点:B(t) = (1-t)²P0 + 2(1-t)t·C + t²·P1
            const u = 1 - t
            const pt = {
              x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
              y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
            }
            if (pointToSegmentDistance(pageX, pageY, prev.x, prev.y, pt.x, pt.y) <= tol) {
              hit = true
              break
            }
            prev = pt
          }
          if (hit) return el.id
        } else if (pointToSegmentDistance(pageX, pageY, from.x, from.y, to.x, to.y) <= tol) {
          return el.id
        }
      } else {
        // 悬空关系箭头(端点卡片已删 + bbox w=h=0):线段命中分支因 from/to null 跳过。
        // 用 bbox + 容差兜底(w=h=0 退化为点容差 tol),让用户能选中删除这类幽灵元素。
        const b = normalizeBox(el)
        if (pageX >= b.x - tol && pageX <= b.x + b.w + tol && pageY >= b.y - tol && pageY <= b.y + b.h + tol) {
          return el.id
        }
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
