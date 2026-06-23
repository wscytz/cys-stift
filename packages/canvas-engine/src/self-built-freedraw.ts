
import type { CanvasElement } from './canvas-host'

/**
 * freedraw(手绘)纯函数:点序列 → bbox + CanvasElement。
 * 点序列是页坐标绝对值 [x,y][](向量,R2);x/y/w/h 为 bbox(commit 时算)。
 * 这些函数不挂 DOM、无引擎副作用,可独立单测。
 */

/** 点序列的最小包围盒(最小角 + 尺寸)。空集 → 0 bbox。 */
export function bboxOf(points: [number, number][]): {
  x: number
  y: number
  w: number
  h: number
} {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** 把一条笔画 commit 成 freedraw CanvasElement(bbox 由点序列算,点进 meta.points)。 */
export function commitFreedraw(
  id: string,
  points: [number, number][],
  color?: string,
): CanvasElement {
  const { x, y, w, h } = bboxOf(points)
  const el: CanvasElement = {
    id,
    kind: 'freedraw',
    x,
    y,
    w,
    h,
    rotation: 0,
    meta: { points },
  }
  if (color !== undefined) el.color = color
  return el
}

/**
 * 平移一条 freedraw:点序列整体偏移 (dx,dy),bbox 跟随。drag 用。
 *
 * freedraw 的 meta.points 是**绝对页坐标**,渲染用 points 不用 bbox——所以移动时
 * 只改 bbox 无效(笔画原地不动),必须同时平移点序列。非 freedraw / 无点 → null
 * (调用方回退现有 bbox-only 逻辑)。纯函数,不改原元素。
 */
export function translateFreedraw(
  el: CanvasElement,
  dx: number,
  dy: number,
): CanvasElement | null {
  const pts = freedrawPointsOf(el)
  if (!pts) return null
  return {
    ...el,
    x: el.x + dx,
    y: el.y + dy,
    meta: { ...el.meta, points: pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) },
  }
}

/**
 * 把一条 freedraw 的点序列从当前 bbox 线性映射到 newBox(resize 用)。每个点按
 * 旧 bbox→新 box 的比例缩放 + 平移。退化轴(旧 w 或 h 为 0:单点 / 纯水平 / 纯垂直
 * 笔画)→ 该轴不缩放只平移(防除零)。非 freedraw / 无点 → null。纯函数。
 */
export function scaleFreedrawToBox(
  el: CanvasElement,
  newBox: { x: number; y: number; w: number; h: number },
): CanvasElement | null {
  const pts = freedrawPointsOf(el)
  if (!pts) return null
  const sx = el.w === 0 ? 1 : newBox.w / el.w
  const sy = el.h === 0 ? 1 : newBox.h / el.h
  const mapped = pts.map(([x, y]) => {
    const nx = el.w === 0 ? x + (newBox.x - el.x) : newBox.x + (x - el.x) * sx
    const ny = el.h === 0 ? y + (newBox.y - el.y) : newBox.y + (y - el.y) * sy
    return [nx, ny] as [number, number]
  })
  return {
    ...el,
    x: newBox.x,
    y: newBox.y,
    w: newBox.w,
    h: newBox.h,
    meta: { ...el.meta, points: mapped },
  }
}

/** 取 freedraw 的点序列;非 freedraw / 无点 → null。 */
function freedrawPointsOf(el: CanvasElement): [number, number][] | null {
  if (el.kind !== 'freedraw') return null
  const pts = (el.meta as { points?: unknown } | undefined)?.points
  if (!Array.isArray(pts) || pts.length === 0) return null
  return pts as [number, number][]
}
