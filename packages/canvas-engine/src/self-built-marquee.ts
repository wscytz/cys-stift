// apps/web/src/features/canvas/host/self-built-marquee.ts

import type { CanvasElement } from './canvas-host'
import { normalizeBox } from './bounds'
import { arrowPathPoints } from './self-built-arrow'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 两矩形是否相交(含边接触)。 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  )
}

/** 点是否在矩形内(含边)。 */
function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
}

/**
 * 框选:返回与 rect 相交的元素 id。空框(0 尺寸)→ 空。
 *
 * - **arrow**:按真实 route 的折线近似与框相交判定。curve/elbow 不退化成直线弦。
 * - 其它 kind:bbox 相交。
 */
export function marqueeSelect(rect: Rect, elements: CanvasElement[]): string[] {
  if (rect.w === 0 || rect.h === 0) return []
  const out: string[] = []
  for (const el of elements) {
    if (el.kind === 'arrow') {
      const points = arrowPathPoints(el, elements)
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!
        const b = points[i]!
        if (segmentIntersectsRect(a.x, a.y, b.x, b.y, rect)) {
          out.push(el.id)
          break
        }
      }
      continue
    }
    // R1.3:归一化后再判相交——负 w/h(如 .cystift 导入用负 bbox 编码方向)必须先翻到
    // 左上原点 + abs,否则 rectsIntersect 把负 w/h 当空范围 → 漏选。与 hitTest/视锥剔除一致。
    if (rectsIntersect(rect, normalizeBox(el))) out.push(el.id)
  }
  return out
}

/** 线段 (ax,ay)-(bx,by) 是否与轴对齐矩形 rect 相交(含端点在内、边接触)。 */
function segmentIntersectsRect(
  ax: number, ay: number, bx: number, by: number, r: Rect,
): boolean {
  // 任一端点在框内 → 相交。
  if (pointInRect(ax, ay, r) || pointInRect(bx, by, r)) return true
  // 否则:线段是否穿过框的任一边(Cohen-Sutherland 风格简化 —— 检测与四边相交)。
  return (
    segSeg(ax, ay, bx, by, r.x, r.y, r.x + r.w, r.y) || // 上边
    segSeg(ax, ay, bx, by, r.x, r.y + r.h, r.x + r.w, r.y + r.h) || // 下边
    segSeg(ax, ay, bx, by, r.x, r.y, r.x, r.y + r.h) || // 左边
    segSeg(ax, ay, bx, by, r.x + r.w, r.y, r.x + r.w, r.y + r.h) // 右边
  )
}

/** 两线段是否相交,含端点、共线重叠和数值误差内的边接触。 */
function segSeg(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = cross(ax, ay, bx, by, cx, cy)
  const d2 = cross(ax, ay, bx, by, dx, dy)
  const d3 = cross(cx, cy, dx, dy, ax, ay)
  const d4 = cross(cx, cy, dx, dy, bx, by)
  const eps = 1e-9
  const opposite = (a: number, b: number) =>
    (a > eps && b < -eps) || (a < -eps && b > eps)
  if (opposite(d1, d2) && opposite(d3, d4)) return true
  if (Math.abs(d1) <= eps && onSegment(ax, ay, bx, by, cx, cy, eps)) return true
  if (Math.abs(d2) <= eps && onSegment(ax, ay, bx, by, dx, dy, eps)) return true
  if (Math.abs(d3) <= eps && onSegment(cx, cy, dx, dy, ax, ay, eps)) return true
  if (Math.abs(d4) <= eps && onSegment(cx, cy, dx, dy, bx, by, eps)) return true
  return false
}

function onSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
  eps: number,
): boolean {
  return (
    px >= Math.min(ax, bx) - eps &&
    px <= Math.max(ax, bx) + eps &&
    py >= Math.min(ay, by) - eps &&
    py <= Math.max(ay, by) + eps
  )
}

/** 叉积 (p1→p2) × (p1→p3) 的 z 分量。 */
function cross(p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number): number {
  return (p2x - p1x) * (p3y - p1y) - (p3x - p1x) * (p2y - p1y)
}
