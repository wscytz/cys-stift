// apps/web/src/features/canvas/host/self-built-marquee.ts

import type { CanvasElement } from './canvas-host'
import { arrowEndpoints } from './self-built-arrow'

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
 * - **arrow**:按**线段-框相交**判定(arrowEndpoints 的 from→to 线段穿过/落在框内即
 *   选中)。关系箭头 bbox w=h=0,rectsIntersect 框不中;框住线的一段也该选中(用户
 *   直觉),所以用线段相交而非仅端点。端点解析失败 → 跳过。
 * - 其它 kind:bbox 相交。
 */
export function marqueeSelect(rect: Rect, elements: CanvasElement[]): string[] {
  if (rect.w === 0 || rect.h === 0) return []
  const out: string[] = []
  for (const el of elements) {
    if (el.kind === 'arrow') {
      const { from, to } = arrowEndpoints(el, elements)
      if (from && to && segmentIntersectsRect(from.x, from.y, to.x, to.y, rect)) {
        out.push(el.id)
      }
      continue
    }
    if (rectsIntersect(rect, { x: el.x, y: el.y, w: el.w, h: el.h })) out.push(el.id)
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

/** 两线段是否相交(标准跨立判定)。 */
function segSeg(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = cross(ax, ay, bx, by, cx, cy)
  const d2 = cross(ax, ay, bx, by, dx, dy)
  const d3 = cross(cx, cy, dx, dy, ax, ay)
  const d4 = cross(cx, cy, dx, dy, bx, by)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return false
}

/** 叉积 (p1→p2) × (p1→p3) 的 z 分量。 */
function cross(p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number): number {
  return (p2x - p1x) * (p3y - p1y) - (p3x - p1x) * (p2y - p1y)
}
