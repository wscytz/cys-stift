'use client'

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
