
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
 * 点 (x,y) 到 arrow 元素的几何最短距离(页坐标)。
 *
 * 路由分派(与渲染/DSL 一致):
 * - **straight**:from→to 单线段距离。
 * - **curve**:沿二次贝塞尔(控制点 el.curve)采样 16 段,取点到每段距离的 min。
 *   采样法对强弯箭头也精确(修正旧 eraser 用直线简化导致擦不掉的 B6)。
 * - **elbow**:手设 elbow → elbowSegments [from,...elbow,to];空 elbow → autoElbowPath
 *   自动绕障(obstacles 排除 from/to 卡)。点到每段折线距离取 min。
 *
 * 端点解析失败(悬空 arrow,from/to null)→ 返回 Infinity(调用方走 bbox 兜底)。
 */
function pointToArrowDistance(
  el: CanvasElement,
  elements: CanvasElement[],
  x: number,
  y: number,
): number {
  const { from, to } = arrowEndpoints(el, elements)
  if (!from || !to) return Infinity // 悬空:由调用方 bbox 兜底

  const route = arrowRoute(el)

  if (route === 'elbow') {
    // 手设 elbow → elbowSegments;空 elbow → autoElbowPath 自动绕障(路径与渲染一致)。
    const hasManual = !!(el.elbow && el.elbow.length > 0)
    const segs = hasManual
      ? elbowSegments(el, from, to)
      : autoElbowPath(
          el,
          from,
          to,
          cardObstacles(elements, new Set([el.from, el.to].filter((v): v is string => !!v))),
        )
    if (!segs || segs.length < 2) return Infinity
    let best = Infinity
    for (let i = 1; i < segs.length; i++) {
      const d = pointToSegmentDistance(x, y, segs[i - 1]!.x, segs[i - 1]!.y, segs[i]!.x, segs[i]!.y)
      if (d < best) best = d
    }
    return best
  }

  if (route === 'curve' && el.curve) {
    // 沿二次贝塞尔(控制点 ctrl)采样 N 段,点到每段距离取 min。
    const ctrl = { x: el.curve.cx, y: el.curve.cy }
    const N = 16
    let prev = from
    let best = Infinity
    for (let s = 1; s <= N; s++) {
      const t = s / N
      // 二次贝塞尔点:B(t) = (1-t)²P0 + 2(1-t)t·C + t²·P1
      const u = 1 - t
      const pt = {
        x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
        y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
      }
      const d = pointToSegmentDistance(x, y, prev.x, prev.y, pt.x, pt.y)
      if (d < best) best = d
      prev = pt
    }
    return best
  }

  // straight(含 curve 标了 route 但无 curve 数据的退化):直线距离
  return pointToSegmentDistance(x, y, from.x, from.y, to.x, to.y)
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
      if (pointToArrowDistance(el, elements, pageX, pageY) <= tol) {
        return el.id
      }
      // 悬空关系箭头(端点卡片已删 + bbox w=h=0):pointToArrowDistance 返回 Infinity 跳过线段命中。
      // 仅对悬空 arrow(from/to 都解析不出)走 bbox+容差兜底(w=h=0 退化为点容差 tol),
      // 让用户能选中删除这类幽灵元素;有端点的 arrow 保持纯线段命中(行为不变)。
      if (!from || !to) {
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

/** connect 松手用的 card 宽松命中:bbox 外扩 CARD_HIT_TOLERANCE_PX(屏幕)容差。
 *  比严格 hitTest(线段 6px)更适合"拖到卡片附近松手" — 偏几像素仍连上。
 *  只命中非 arrow 元素(card/rect/text/frame),arrow 不作 connect 目标。 */
const CARD_HIT_TOLERANCE_PX = 6

export function hitTestCardWithTolerance(
  elements: CanvasElement[],
  pageX: number,
  pageY: number,
  zoom: number = 1,
): string | null {
  const tol = CARD_HIT_TOLERANCE_PX / zoom
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!
    if (el.kind === 'arrow') continue
    const b = normalizeBox(el)
    if (
      pageX >= b.x - tol &&
      pageX <= b.x + b.w + tol &&
      pageY >= b.y - tol &&
      pageY <= b.y + b.h + tol
    ) {
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

/**
 * 橡皮专属宽松命中:比 hitTest(6px)宽松得多,确保细线/箭头在缩小视图下也能擦到。
 *
 * - 线类(arrow/freedraw):点到线段距离 ≤ 16px 屏幕(页坐标 16/zoom)即命中。
 *   arrow 走 arrowEndpoints 解析端点(悬空 arrow 用 bbox 兜底);freedraw 走点序列。
 * - bbox 类(card/rect/text/frame):bbox 扩展 4px 命中(卡片面积大,不需要大距离)。
 *
 * 橡皮语义本就是"擦到附近",16px 屏幕距离让用户点偏也能擦中细线。
 * 纯函数,不依赖 adapter 状态。
 */
export function eraserHitTest(
  elements: CanvasElement[],
  pageX: number,
  pageY: number,
  zoom: number = 1,
): string | null {
  const lineTol = 16 / zoom // 线类:16px 屏幕
  const bboxPad = 4 / zoom   // bbox 类:扩展 4px
  // 复用 hitTest 的线段距离逻辑,但用更大 tol。先尝试线类宽松,再 bbox 扩展。
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!
    if (el.kind === 'arrow') {
      const { from, to } = arrowEndpoints(el, elements)
      // 复用与 hitTest 同源的精确距离(straight/curve 采样/elbow 折线)。
      // lineTol(16px 屏幕)比 hitTest 的 6px 宽松,但几何不再简化 —— 修正旧版
      // 「curve/elbow 用直线近似」导致强弯箭头擦不掉的 B6。
      if (pointToArrowDistance(el, elements, pageX, pageY) <= lineTol) return el.id
      // 悬空 arrow:bbox+pad 兜底(pointToArrowDistance 对悬空返回 Infinity)
      if (!from || !to) {
        const b = normalizeBox(el)
        if (pageX >= b.x - bboxPad && pageX <= b.x + b.w + bboxPad && pageY >= b.y - bboxPad && pageY <= b.y + b.h + bboxPad) return el.id
      }
      continue
    }
    if (el.kind === 'freedraw') {
      const pts = (el.meta?.points as [number, number][] | undefined) ?? []
      for (let j = 1; j < pts.length; j++) {
        if (pointToSegmentDistance(pageX, pageY, pts[j-1]![0], pts[j-1]![1], pts[j]![0], pts[j]![1]) <= lineTol) return el.id
      }
      continue
    }
    // bbox 类
    const b = normalizeBox(el)
    if (pageX >= b.x - bboxPad && pageX <= b.x + b.w + bboxPad && pageY >= b.y - bboxPad && pageY <= b.y + b.h + bboxPad) return el.id
  }
  return null
}
