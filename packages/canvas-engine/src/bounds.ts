
import type { CanvasView } from './canvas-host'

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
 * 纯函数 — 归一化 box:保证 w/h ≥ 0。负 w/h(如自由箭头用 bbox 编码方向、或 resize
 * 拖过对角)翻转 x/y 到左上角。
 *
 * 为什么需要:hitTest / handleAtPoint / 选中框 都按 `x..x+w` 取范围,假设 w≥0;
 * 负 bbox 会让范围为空(命中失败)或角算错(选不中/无法 resize)。几何函数应对
 * 「任意符号 bbox」鲁棒——引擎不假设调用方只传正 bbox。正 bbox 原样返回。
 */
export function normalizeBox(b: Bounds): Bounds {
  return {
    x: b.w < 0 ? b.x + b.w : b.x,
    y: b.h < 0 ? b.y + b.h : b.y,
    w: Math.abs(b.w),
    h: Math.abs(b.h),
  }
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

/**
 * 纯函数 — 标准 AABB 重叠判定(含 viewport 视锥剔除用)。
 *
 * 两 box 重叠 ⟺ x 区间相交 && y 区间相交。区间 [a.x, a.x+a.w) 与 [b.x, b.x+b.w)
 * 相交 ⟺ a.x < b.x+b.w && a.x+a.w > b.x。**边相切不算**(a.x+a.w === b.x → false,
 * 无可见重叠)——与 hitTest「命中」语义一致。
 *
 * 防御性归一化:开头 normalizeBox 两个入参(便宜,与现有用法对齐),调用方传负
 * w/h(自由箭头 bbox 编码方向 / resize 拖过对角)也能正确判定。调用方传正 bbox 时
 * 归一化为恒等,无开销差异。
 */
export function intersectsBounds(a: Bounds, b: Bounds): boolean {
  const na = normalizeBox(a)
  const nb = normalizeBox(b)
  return na.x < nb.x + nb.w && na.x + na.w > nb.x && na.y < nb.y + nb.h && na.y + na.h > nb.y
}

/**
 * 纯函数 — 由当前相机(view: pan/zoom)与画布 CSS 尺寸,算出页坐标系下可见的矩形。
 *
 * 渲染变换是 `ctx.translate(panX,panY); ctx.scale(zoom,zoom)`,其逆变换为
 * `page = (screen - pan) / zoom`。故可见页矩形左上 = (-panX/zoom, -panY/zoom),
 * 宽高 = cssWidth/zoom、cssHeight/zoom。供 renderNow 的视锥剔除算视口框用。
 *
 * 注:这里不调 sanitizeView——调用方(adapter.setView)已净化过 view;此处假设
 * zoom 是有限正值(否则除出 Infinity/NaN,intersectsBounds 会得到 false 即「全剔除」,
 * 是安全的退化,不会崩)。
 */
export function viewportBounds(view: CanvasView, cssWidth: number, cssHeight: number): Bounds {
  const z = view.zoom
  // `-panX / z` 在 panX===0 时产生 -0(带符号零);+0 归一化避免 -0/+0 在 toEqual 里被
  // 视为不等(数学上 -0===0,但测试断言区分符号)。对真实几何无影响。
  const x = -view.panX / z + 0
  const y = -view.panY / z + 0
  return { x, y, w: cssWidth / z, h: cssHeight / z }
}
