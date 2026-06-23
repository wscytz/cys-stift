'use client'

import type { CanvasElement } from './canvas-host'

interface Point {
  x: number
  y: number
}

/** 元素中心点。 */
export function elementCenter(el: CanvasElement): Point {
  return { x: el.x + el.w / 2, y: el.y + el.h / 2 }
}

/**
 * 从 rect 的中心朝 target 方向,求线段交到 rect 边框的出口点。
 * rect 由 center + 半宽半高(hw,hh)描述;target 是外部点。
 * 数学:沿 (target-center) 方向,param t = min(hw/|dx|, hh/|dy|),出口 = center + t·(dx,dy)。
 * 退化(目标=中心)→ 中心。
 */
export function borderPoint(
  center: Point,
  hw: number,
  hh: number,
  target: Point,
): Point {
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (dx === 0 && dy === 0) return { x: center.x, y: center.y }
  const tX = dx !== 0 ? hw / Math.abs(dx) : Infinity
  const tY = dy !== 0 ? hh / Math.abs(dy) : Infinity
  const t = Math.min(tX, tY)
  return { x: center.x + t * dx, y: center.y + t * dy }
}

/**
 * 解析 arrow 的 from/to 端点(各自指向对方元素的边框交点)。
 * 任一端元素找不到 → 都返 null(渲染时不画半截箭头)。
 */
export function arrowEndpoints(
  arrow: CanvasElement,
  elements: CanvasElement[],
): { from: Point | null; to: Point | null } {
  const fromEl = arrow.from ? elements.find((e) => e.id === arrow.from) : undefined
  const toEl = arrow.to ? elements.find((e) => e.id === arrow.to) : undefined
  if (!fromEl || !toEl) return { from: null, to: null }
  const fc = elementCenter(fromEl)
  const tc = elementCenter(toEl)
  return {
    from: borderPoint(fc, fromEl.w / 2, fromEl.h / 2, tc),
    to: borderPoint(tc, toEl.w / 2, toEl.h / 2, fc),
  }
}

/**
 * 连接预览端点:from = fromEl 朝 pointer 的边框交点;to = pointer(预览时指针当临时 to)。
 * 纯函数。pointer 在元素内 → from = 中心(退化)。
 */
export function arrowPreviewEndpoints(
  fromEl: CanvasElement,
  pointer: { x: number; y: number },
): { from: Point; to: Point } {
  const fc = elementCenter(fromEl)
  return {
    from: borderPoint(fc, fromEl.w / 2, fromEl.h / 2, pointer),
    to: { x: pointer.x, y: pointer.y },
  }
}
