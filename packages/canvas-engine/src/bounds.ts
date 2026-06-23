
/**
 * 通用 AABB(axis-aligned bounding box)几何纯函数。
 *
 * 这是**引擎层**的通用几何:不依赖任何 cys-stift 业务概念。供 elements-to-svg
 * (导出 bbox 计算)与未来其它视图复用。apps/web 的 export-bounds.ts 从此 re-export,
 * 保持其现有 public API(unionBounds/expandBounds/Bounds 名字不变)。
 */

/** Axis-aligned box in page coordinates(x/y/w/h)。 */
export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 纯函数 — 轴对齐 box 的并集。空列表 → null。
 * 用来算一组 shape 的内容包围盒 + 推导导出尺寸。
 */
export function unionBounds(boxes: Bounds[]): Bounds | null {
  if (boxes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.w > maxX) maxX = b.x + b.w
    if (b.y + b.h > maxY) maxY = b.y + b.h
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * 纯函数 — 把 box 四边各扩 border。shadow 开启且 border=0 时加小 slack(+5,
 * drawio 行为)避免 drop-shadow 被画布边裁掉。
 */
export function expandBounds(b: Bounds, border: number, shadow = false): Bounds {
  const slack = shadow && border === 0 ? 5 : 0
  const t = border + slack
  return { x: b.x - t, y: b.y - t, w: b.w + 2 * t, h: b.h + 2 * t }
}
