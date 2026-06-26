
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

// ── 智能 elbow 路由避让(F4)─────────────────────────────────────────────────
// 启发式(非 A*,YAGNI):优先 L 形 1 折点,两向都被穿时加第 2 折点做阶梯绕障。
// 三个纯函数被 routeElbowAroundObstacles / autoElbowPath / segmentIntersectsBox
// 统一收口,render / hitTest / SVG 三视图共用同一份绕障逻辑。

/**
 * 线段 (a→b) 与 AABB box 的相交判定(开区间严格语义)。
 *
 * 用 Liang-Barsky 参数化裁剪:把线段写成 P(t)=a+t·(b−a), t∈[0,1];
 * 与 box 的开区间 [x0,x1)×[y0,y1) 求交集的 t 范围 [t0,t1]。
 * - t0 < t1 且 t0 ≤ 1 且 t1 ≥ 0 → 线段确实穿入 box 内部 → true。
 * - 仅相切(端点贴边 / 沿边线滑过)→ t0 === t1(退化到一点),不算相交 → false。
 *
 * 与 intersectsBounds 一致用严格比较(<、>)而非 ≤、≥,故相切不算穿过——
 * 上边线相切(y 恰在 box 上边)返回 false,与 hitTest「命中」语义对齐。
 * axis-aligned 段(水平/垂直)与对角斜线都通用。纯函数。
 */
export function segmentIntersectsBox(
  a: Point,
  b: Point,
  box: { x: number; y: number; w: number; h: number },
): boolean {
  // normalizeBox 防御性归一化(调用方传负 w/h 也能正确判定)。
  const bx0 = box.x
  const by0 = box.y
  const bx1 = box.x + box.w
  const by1 = box.y + box.h
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  // 对每条边界裁剪 [t0,t1]:p=−d 时进入,q=远边−起点。
  const clip = (p: number, q: number): boolean => {
    if (p === 0) {
      // 线段平行于此轴:起点必须严格在区间内,否则整段在区间外 → 不相交。
      return q > 0
    }
    const r = q / p
    if (p < 0) {
      // 进入边界:t0 取大。
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      // 离开边界:t1 取小。
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  // x 轴:左边界(进入,进入方向 p<0 → q = a.x − x0)、右边界(离开)。
  if (!clip(-dx, a.x - bx0)) return false
  if (!clip(dx, bx1 - a.x)) return false
  // y 轴同理。
  if (!clip(-dy, a.y - by0)) return false
  if (!clip(dy, by1 - a.y)) return false
  // t0<t1(严格)→ 有真实内部重叠;=== 时仅相切(退化)→ 不算。
  return t0 < t1
}

/**
 * 检查路径 [from, ...elbows, to] 中任意一段是否穿过任一 obstacle。
 * 任一段相交 → 返 true(被穿)。obstacles 空 → 返 false。
 */
function pathIntersectsAny(
  from: Point,
  elbows: Point[],
  to: Point,
  obstacles: { x: number; y: number; w: number; h: number }[],
): boolean {
  if (obstacles.length === 0) return false
  const pts = [from, ...elbows, to]
  for (let i = 1; i < pts.length; i++) {
    for (const ob of obstacles) {
      if (segmentIntersectsBox(pts[i - 1]!, pts[i]!, ob)) return true
    }
  }
  return false
}

/**
 * 智能 elbow 路由:返回折点数组(不含起终点),让 [from, ...elbows, to]
 * 每段正交且不穿任何 obstacle。最多 2 折点。启发式(非 A*,YAGNI)。
 *
 * 策略:
 * 1. from==to 退化 → [](无路径)。
 * 2. 候选 L 形(1 折点),逐个试是否每段都不穿 obstacle:
 *    - H-first: [{x: to.x, y: from.y}](先水平后垂直)
 *    - V-first: [{x: from.x, y: to.y}](先垂直后水平)
 *    任一不穿 → 返回该(1 折点)。H-first 优先(视觉上更常见)。
 * 3. 两个 L 都被穿 → 加第 2 折点做阶梯:把转折段整体偏移到 obstacle 上/下/左/右
 *    边外。生成形如 [{x: mx, y: from.y}, {x: mx, y: to.y}](垂直阶梯,绕上下)
 *    或 [{x: from.x, y: my}, {x: to.x, y: my}](水平阶梯,绕左右),mx/my 选
 *    obstacle 边外(上边/下边/左边/右边四候选取第一个不穿的)。
 * 4. 仍找不到 ≤2 折点的避障路径(罕见:多 obstacle 死锁)→ 退回 H-first
 *    L 形(至少保证正交 + 到达 to;避障不是硬约束,渲染优先正确连线)。
 *
 * 无 obstacle 时(策略 2 必中)→ 返回 1 折点 L 形,与测试契约一致。
 */
export function routeElbowAroundObstacles(
  from: Point,
  to: Point,
  obstacles: { x: number; y: number; w: number; h: number }[],
): Point[] {
  // 1. 退化:同点不画路径。
  if (from.x === to.x && from.y === to.y) return []

  // 2. 候选 L 形(1 折点)。
  const hFirst: Point[] = [{ x: to.x, y: from.y }] // from→(to.x,from.y)→to
  const vFirst: Point[] = [{ x: from.x, y: to.y }] // from→(from.x,to.y)→to
  if (!pathIntersectsAny(from, hFirst, to, obstacles)) return hFirst
  if (!pathIntersectsAny(from, vFirst, to, obstacles)) return vFirst

  // 3. 阶梯绕障(2 折点)。先试垂直阶梯(转折段是垂直的,mx 避开 obstacle x 区间),
  //    再试水平阶梯(my 避开 obstacle y 区间)。
  // 垂直阶梯 candidates:mx 选每个 obstacle 的左边外 / 右边外。需 from.y ≠ to.y(否则
  // 两折点 y 相同 = 退化为 L,已在 2 试过);但即使 from.y===to.y,垂直阶梯会让中间段
  // 变成 from.y→to.y 的水平段(=原直线),仍可能被穿 → 此时跳过,交水平阶梯处理。
  if (from.y !== to.y) {
    for (const ob of obstacles) {
      for (const mx of [ob.x - 1, ob.x + ob.w + 1]) {
        const step: Point[] = [
          { x: mx, y: from.y },
          { x: mx, y: to.y },
        ]
        if (!pathIntersectsAny(from, step, to, obstacles)) return step
      }
    }
  }
  // 水平阶梯 candidates:my 选每个 obstacle 的上边外 / 下边外。from.x≠to.x 才有意义。
  if (from.x !== to.x) {
    for (const ob of obstacles) {
      for (const my of [ob.y - 1, ob.y + ob.h + 1]) {
        const step: Point[] = [
          { x: from.x, y: my },
          { x: to.x, y: my },
        ]
        if (!pathIntersectsAny(from, step, to, obstacles)) return step
      }
    }
  }

  // 4. 退路:实在绕不开(多 obstacle 死锁 / from 与 to 同行同列且被堵),
  //    返回 H-first L 形保证正交连线。避障不是硬约束。
  return hFirst
}

/**
 * 从当前画布元素算 obstacle bbox(用于 route='elbow' 且 elbow 空的自动绕障)。
 * filter kind==='card'(关系箭头主要绕卡)+ normalizeBox(负 bbox 归一化)+
 * 排除 from/to 端点指向的 card(起终点卡不绕,否则箭头绕开自己连的卡,视觉怪异)。
 * 纯函数。
 */
export function cardObstacles(
  elements: CanvasElement[],
  excludeIds: Set<string>,
): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = []
  for (const el of elements) {
    if (el.kind !== 'card') continue
    if (excludeIds.has(el.id)) continue
    out.push(normalizeBox(el))
  }
  return out
}

/**
 * 接线辅助:route='elbow' 箭头的实际渲染路径(含端点 from/to)。
 * - elbow 空(用户未手设)→ routeElbowAroundObstacles 自动绕障,返回 [from, ...elbows, to]。
 * - elbow 非空(用户手设)→ 尊重手设,返回 [from, ...elbow, to](不自动,手动 elbow 行为不变)。
 * obstacles 由调用方传入(cardObstacles(elements, excludeIds) 的产物)。
 * 纯函数;route≠'elbow' 时调用方不应调此函数(走 straight/curve 分支)。
 */
export function autoElbowPath(
  arrow: CanvasElement,
  from: Point,
  to: Point,
  obstacles: { x: number; y: number; w: number; h: number }[],
): Point[] {
  // 用户手设 elbow → 原样拼路径(手动 elbow 行为,elbowSegments 等价)。
  if (arrow.elbow && arrow.elbow.length > 0) {
    return [from, ...arrow.elbow, to]
  }
  // 空 elbow → 自动绕障。
  const elbows = routeElbowAroundObstacles(from, to, obstacles)
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
