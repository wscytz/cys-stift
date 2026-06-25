
import type { CanvasElement } from './canvas-host'
import { normalizeBox } from './bounds'

interface Point {
  x: number
  y: number
}

/**
 * 元素中心点。用 normalizeBox 先归一化(负 w/h 时左上角会翻到正确位置),
 * 否则 `el.x + el.w/2` 对负 w 给出可视 box 外的中心 —— 箭头端点 / 旋转中心全偏。
 */
export function elementCenter(el: CanvasElement): Point {
  const b = normalizeBox(el)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/**
 * 从 rect 的中心朝 target 方向,求线段交到 rect 边框的出口点。
 * rect 由 center + 半宽半高(hw,hh)描述;target 是外部点。
 * 数学:沿 (target-center) 方向,param t = min(hw/|dx|, hh/|dy|),出口 = center + t·(dx,dy)。
 * 退化(目标=中心)→ 中心。hw/hh 取绝对值:调用方(arrowEndpoints)传 el.w/2,
 * 负 w 时为负,会让 t 反号、出口跑到错侧 —— abs 保证半宽半高恒为正。
 */
export function borderPoint(
  center: Point,
  hw: number,
  hh: number,
  target: Point,
): Point {
  const aw = Math.abs(hw)
  const ah = Math.abs(hh)
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (dx === 0 && dy === 0) return { x: center.x, y: center.y }
  const tX = dx !== 0 ? aw / Math.abs(dx) : Infinity
  const tY = dy !== 0 ? ah / Math.abs(dy) : Infinity
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

// ── 箭头路由形态(straight / curve / elbow)共享几何 ──────────────────────────
// 三种 route 的几何统一收口在这里,让 render / hitTest / SVG / 手柄交互全走同一份。
// route 决定路径形状;curve/elbow 数据保留但 route='straight' 时不渲染(切回方便)。

/**
 * 解析箭头当前 route:无 route 字段 → 看 curve/elbow 数据反推(向后兼容旧箭头:
 * commit a708eb1 落地 curve 时还没 route 字段,渲染只看 curve 存不存在)。有 route
 * 字段 → 直接用。
 */
export function arrowRoute(arrow: CanvasElement): 'straight' | 'curve' | 'elbow' {
  // 显式 route 总是优先(切回 straight 时 curve 数据仍在但 route 指明走直线)。
  if (arrow.route === 'curve' || arrow.route === 'elbow' || arrow.route === 'straight') {
    return arrow.route
  }
  // 向后兼容:无 route 字段(旧箭头),但有 curve 数据 → 当 curve。
  if (arrow.curve) return 'curve'
  return 'straight'
}

/**
 * 箭头路径的折点序列(页坐标),用于 elbow 渲染(moveTo→lineTo×)与 hitTest(逐段距离)。
 * route='elbow':from → elbow[] → to。无折点时退化为 [from, to](直线段)。
 * route≠'elbow' 返 null(调用方走直线/曲线分支)。
 */
export function elbowSegments(
  arrow: CanvasElement,
  from: Point,
  to: Point,
): Point[] | null {
  if (arrowRoute(arrow) !== 'elbow') return null
  const elbows = arrow.elbow ?? []
  return [from, ...elbows, to]
}

/**
 * 箭头头角度:终点处的切线方向(to 的来向角)。route 决定取哪段方向。
 * - straight: to - from
 * - curve: to - ctrl(贝塞尔终点切线)
 * - elbow: 最后一段方向 = to - lastElbow(无折点则 to - from)
 */
export function arrowHeadAngle(
  arrow: CanvasElement,
  from: Point,
  to: Point,
): number {
  const route = arrowRoute(arrow)
  if (route === 'curve' && arrow.curve) {
    return Math.atan2(to.y - arrow.curve.cy, to.x - arrow.curve.cx)
  }
  if (route === 'elbow') {
    const segs = elbowSegments(arrow, from, to)
    if (segs && segs.length >= 2) {
      const prev = segs[segs.length - 2]!
      return Math.atan2(to.y - prev.y, to.x - prev.x)
    }
  }
  return Math.atan2(to.y - from.y, to.x - from.x)
}
