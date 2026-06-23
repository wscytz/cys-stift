// apps/web/src/features/canvas/host/self-built-marquee.ts

import type { CanvasElement } from './canvas-host'

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

/** 框选:返回与 rect 相交的元素 id。空框(0 尺寸)→ 空。 */
export function marqueeSelect(rect: Rect, elements: CanvasElement[]): string[] {
  if (rect.w === 0 || rect.h === 0) return []
  return elements.filter((el) => rectsIntersect(rect, { x: el.x, y: el.y, w: el.w, h: el.h })).map((el) => el.id)
}
