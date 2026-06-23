
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
 * 解析 arrow 的 from/to 端点。
 *
 * 两种 arrow:
 *  - **关系箭头**:有 from/to 指向元素 id → 端点 = 各自朝对方的边框交点。
 *  - **自由箭头**:无 from/to(或指向的元素已不存在)→ 端点 = arrow 自身 bbox 的
 *    两个角(起点 (x,y),终点 (x+w, y+h);w/h 可负表方向)。手绘转箭头用这种。
 *
 * 关系箭头任一端元素找不到、且 arrow 自身无尺寸(w=h=0)→ 返 null(不画半截)。
 */
export function arrowEndpoints(
  arrow: CanvasElement,
  elements: CanvasElement[],
): { from: Point | null; to: Point | null } {
  const fromEl = arrow.from ? elements.find((e) => e.id === arrow.from) : undefined
  const toEl = arrow.to ? elements.find((e) => e.id === arrow.to) : undefined
  if (fromEl && toEl) {
    const fc = elementCenter(fromEl)
    const tc = elementCenter(toEl)
    return {
      from: borderPoint(fc, fromEl.w / 2, fromEl.h / 2, tc),
      to: borderPoint(tc, toEl.w / 2, toEl.h / 2, fc),
    }
  }
  // 自由箭头:无有效 from/to 端元素,但自身 bbox 描述一条线段(w/h 非零)。
  if (arrow.w !== 0 || arrow.h !== 0) {
    return {
      from: { x: arrow.x, y: arrow.y },
      to: { x: arrow.x + arrow.w, y: arrow.y + arrow.h },
    }
  }
  return { from: null, to: null }
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

// ── 语义关系签名:线型(dash)+ 箭头形(arrowhead)纯几何 ────────────────────
// 这是 cy's Stift 区别于 tldraw/excalidraw 的特色:箭头不是「用户手选样式的几何
// 箭头」,而是「每种语义关系一个固定三维视觉签名」(线型+箭头形+颜色)。下面的
// 纯函数被实时渲染(Canvas 2D)与 SVG 导出共用,保证两处签名一致。

/** dash 线型 → dash 段长数组(基准宽度 2px)。solid → [](实线)。lineWidth 缩放由调用方处理。 */
export function dashPattern(dash: CanvasElement['dash']): number[] {
  switch (dash) {
    case 'dashed':
      return [8, 6]
    case 'dotted':
      return [1.5, 5]
    case 'solid':
    default:
      return []
  }
}

/**
 * 箭头头几何:给定线段终点 tip 与来向角 angle,返回构成箭头的点。
 * - 'arrow' = 开口 V(两条边线,不闭合)→ 返回 [left, tip, right]
 * - 'triangle' = 实心三角(闭合填充)→ 返回 [left, tip, right](调用方 closePath+fill)
 * - 'none' = 无箭头 → 返回 []
 * size = 箭头边长(默认 10);spread = 半张角(默认 π/6)。纯函数。
 */
export function arrowheadPoints(
  kind: CanvasElement['arrowhead'],
  tip: Point,
  angle: number,
  size = 10,
  spread = Math.PI / 6,
): Point[] {
  if (kind === 'none') return []
  const left: Point = {
    x: tip.x - size * Math.cos(angle - spread),
    y: tip.y - size * Math.sin(angle - spread),
  }
  const right: Point = {
    x: tip.x - size * Math.cos(angle + spread),
    y: tip.y - size * Math.sin(angle + spread),
  }
  return [left, tip, right]
}
