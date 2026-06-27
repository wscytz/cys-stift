/**
 * Minimap 纯函数(鸟瞰导航核心)— P4 增值首个。
 *
 * 把全部元素 bbox fit 进小画布、算当前视口的页坐标可见矩形、把 minimap 点击逆投影
 * 回页坐标(导航)。所有几何都在页坐标 ↔ minimap 坐标之间转换,不碰渲染细节。
 * 不依赖引擎逻辑,只用 CanvasElement 的 {x,y,w,h}(通用 AABB)。
 */
import type { CanvasElement, CanvasView } from '@cys-stift/canvas-engine'
import { elementCenter, normalizeBox } from '@cys-stift/canvas-engine'

export interface MinimapProjection {
  /** 页坐标 → minimap 坐标的缩放(minimap px / 页 px)。 */
  scale: number
  /** minimap 画布上的平移(页原点 → minimap 原点的偏移)。 */
  offsetX: number
  offsetY: number
}

/** 默认 projection(无元素 / 退化时):scale=1,原点对齐 minimap 左上角。 */
const DEFAULT_PROJECTION: MinimapProjection = { scale: 1, offsetX: 0, offsetY: 0 }

/** 算单个元素的 bbox(忽略 rotation,简化;minimap 比例小,旋转视觉差忽略)。
 *  normalizeBox 归一化负 bbox(自由箭头 w/h 可负表方向),否则 maxX = x+w < minX 算反。 */
function elementBBox(el: CanvasElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const b = normalizeBox(el)
  return { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }
}

/**
 * 算 minimap 投影:把全部元素 bbox union 后 fit 进 minimapSize(留 padding)。
 * 无元素 / 退化(零宽零高的 bbox)→ 返回默认 projection(原点对齐,scale=1)。
 *
 * fit 策略:取 union bbox 的宽高,算 scale 使其在 minimap 内容区(padding 后)内
 * 完整显示;取 min(scaleX, scaleY) 保持比例。元素会被居中放置在 minimap 内容区。
 */
export function computeMinimapProjection(
  elements: CanvasElement[],
  minimapSize: { w: number; h: number },
  padding = 8,
): MinimapProjection {
  if (elements.length === 0) return { ...DEFAULT_PROJECTION }
  if (minimapSize.w <= 0 || minimapSize.h <= 0) return { ...DEFAULT_PROJECTION }

  // union bbox。
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    const b = elementBBox(el)
    if (b.minX < minX) minX = b.minX
    if (b.minY < minY) minY = b.minY
    if (b.maxX > maxX) maxX = b.maxX
    if (b.maxY > maxY) maxY = b.maxY
  }
  const bw = maxX - minX
  const bh = maxY - minY
  // 退化:所有元素共点(零宽或零高)。给一个 1px 的最小尺寸避免除零。
  const effW = bw <= 0 ? 1 : bw
  const effH = bh <= 0 ? 1 : bh

  const innerW = minimapSize.w - padding * 2
  const innerH = minimapSize.h - padding * 2
  if (innerW <= 0 || innerH <= 0) return { ...DEFAULT_PROJECTION }

  const scale = Math.min(innerW / effW, innerH / effH)
  if (!Number.isFinite(scale) || scale <= 0) return { ...DEFAULT_PROJECTION }

  // 居中:bbox 中心映射到 minimap 内容区中心。
  const bboxCenterX = (minX + maxX) / 2
  const bboxCenterY = (minY + maxY) / 2
  const innerCenterX = padding + innerW / 2
  const innerCenterY = padding + innerH / 2
  return {
    scale,
    offsetX: innerCenterX - bboxCenterX * scale,
    offsetY: innerCenterY - bboxCenterY * scale,
  }
}

/**
 * 当前视口(view + host canvas css 尺寸)→ 页坐标可见矩形。
 * 视口左上角屏幕坐标 = (panX, panY);页坐标 = screen / zoom。
 * 宽高 = hostSize / zoom。
 */
export function viewportRect(
  view: CanvasView,
  hostSize: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const zoom = view.zoom || 1
  return {
    x: view.panX / zoom,
    y: view.panY / zoom,
    w: hostSize.w / zoom,
    h: hostSize.h / zoom,
  }
}

/**
 * minimap 上点击坐标 → 应该 center 到的页坐标(导航用)。
 * 逆投影:page = (minimapClick - offset) / scale。
 * 调用方据此算 panX/panY 使该页点居中。
 */
export function minimapClickToPage(
  click: { x: number; y: number },
  proj: MinimapProjection,
): { x: number; y: number } {
  if (proj.scale === 0) return { x: 0, y: 0 }
  return {
    x: (click.x - proj.offsetX) / proj.scale,
    y: (click.y - proj.offsetY) / proj.scale,
  }
}

/** 元素中心(供 minimap 画简化标记时复用引擎导出)。重导出便于组件单点 import。 */
export { elementCenter }
