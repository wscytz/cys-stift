
import type { CanvasElement } from './canvas-host'
import { bboxOf } from './self-built-freedraw'

/**
 * freedraw 语义识别(本地几何启发式,2026-06-23)。
 *
 * ## 为什么是本地启发式,不是 AI
 *
 * 手绘点序列是 **R2 隐私**(笔迹不外泄,见 privacy-design.md)——绝不发外部模型。
 * 且「手绘像不像箭头」纯几何就能粗判,不需要模型。所以这是一套**确定性、零依赖、
 * 可单测**的几何分类器:输入点序列,输出「像箭头 / 像装饰 / 说不准」+ 置信度。
 *
 * ## 诚实:这是辅助,不是精确判断
 *
 * 手绘千变万化,几何启发式只能给**倾向**,不可能准。所以:
 *  - 永远返回 confidence(0~1),低置信时 kind='unknown',UI 据此弱化措辞(「看起来像」)。
 *  - 不做任何破坏性动作(不自动改 / 不自动转箭头)——只给提示 + 让用户决定。
 *
 * ## 特征(全部 scale-invariant,纯几何)
 *
 *  - **直线度** straightness = 端点直线距离 / 路径总长。1=完美直线,→0=越绕。
 *  - **闭合度** closure = 端点间距 / bbox 对角线。小=首尾相接(闭合形,如圈/框)。
 *  - **细长比** elongation = bbox 长边 / 短边。大=细长(线/箭头),≈1=方/圆。
 *
 * ## 判定(粗规则,可调)
 *
 *  - 闭合(closure 小)+ 不太细长 → decoration(圈/框/涂鸦,装饰可复制)
 *  - 不闭合 + 直(straightness 高)+ 细长 → arrow(画的是箭头/连线)
 *  - 其余 → unknown(说不准)
 */

export type FreedrawKind = 'arrow' | 'decoration' | 'unknown'

export interface FreedrawClassification {
  kind: FreedrawKind
  /** 置信度 0~1。低置信(<0.5)时 kind 回退 unknown。 */
  confidence: number
  /** 原始几何特征(供 UI 调试 / 进阶展示;都是 scale-invariant 比值)。 */
  features: {
    straightness: number // 端点距 / 路径长,1=直线
    closure: number       // 端点间距 / 对角线,小=闭合
    elongation: number    // 长边/短边,大=细长
    pointCount: number
  }
}

const CLOSED_THRESHOLD = 0.18 // 端点间距 < 对角线的 18% → 视为闭合
const STRAIGHT_THRESHOLD = 0.92 // straightness ≥ 0.92 → 视为直
const ELONGATED_THRESHOLD = 3 // 长边 ≥ 短边 3 倍 → 细长

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

/** 路径总长(相邻点距离之和)。 */
function pathLength(points: [number, number][]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1]!, points[i]!)
  }
  return total
}

/**
 * 提取点序列(freedraw 的 meta.points)。非 freedraw / 无点 → null。
 */
export function freedrawPoints(el: CanvasElement): [number, number][] | null {
  if (el.kind !== 'freedraw') return null
  const pts = (el.meta as { points?: unknown } | undefined)?.points
  if (!Array.isArray(pts) || pts.length === 0) return null
  return pts as [number, number][]
}

/**
 * 分类一条手绘笔画。点序列是页坐标绝对值 [x,y][]。
 *
 * 少于 2 点 / 退化(路径长 0)→ unknown@0。
 */
export function classifyFreedraw(points: [number, number][]): FreedrawClassification {
  const pointCount = points.length
  const degenerate: FreedrawClassification = {
    kind: 'unknown',
    confidence: 0,
    features: { straightness: 0, closure: 0, elongation: 1, pointCount },
  }
  if (pointCount < 2) return degenerate

  const first = points[0]!
  const last = points[points.length - 1]!
  const len = pathLength(points)
  if (len === 0) return degenerate

  const { w, h } = bboxOf(points)
  const diag = Math.hypot(w, h) || 1
  const endpointGap = dist(first, last)

  const straightness = dist(first, last) / len // 1=直线
  const closure = endpointGap / diag           // 小=闭合
  const longSide = Math.max(w, h)
  const shortSide = Math.max(Math.min(w, h), 1) // 防 0 除
  const elongation = longSide / shortSide

  const features = { straightness, closure, elongation, pointCount }

  const isClosed = closure < CLOSED_THRESHOLD
  const isStraight = straightness >= STRAIGHT_THRESHOLD
  const isElongated = elongation >= ELONGATED_THRESHOLD

  // arrow:不闭合 + 直 + 细长。confidence 由「有多直」驱动。
  if (!isClosed && isStraight && isElongated) {
    // straightness 0.92→1 映射到 0.6→1 的置信度。
    const confidence = clamp01(0.6 + (straightness - STRAIGHT_THRESHOLD) / (1 - STRAIGHT_THRESHOLD) * 0.4)
    return { kind: 'arrow', confidence, features }
  }

  // decoration:闭合(圈/框)→ 越闭合越自信。
  if (isClosed) {
    // closure 0→0.18 映射到 0.9→0.5 的置信度(越小越闭合越自信)。
    const confidence = clamp01(0.9 - (closure / CLOSED_THRESHOLD) * 0.4)
    return { kind: 'decoration', confidence, features }
  }

  // 不闭合但很绕(不直)且不细长 → 也偏装饰(随手涂),但低置信。
  if (!isStraight && !isElongated) {
    return { kind: 'decoration', confidence: 0.4, features }
  }

  // 说不准。
  return { kind: 'unknown', confidence: 0.3, features }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/**
 * 复制一条手绘元素(装饰可复用——用户「画一次,到处盖」)。平移 (dx,dy),点序列
 * 整体偏移,bbox 跟着移。新 id 由调用方给(引擎不造 id)。
 *
 * 非 freedraw / 无点 → 返回 null(调用方跳过)。
 */
export function duplicateFreedraw(
  el: CanvasElement,
  newId: string,
  dx: number,
  dy: number,
): CanvasElement | null {
  const pts = freedrawPoints(el)
  if (!pts) return null
  const moved = pts.map(([x, y]) => [x + dx, y + dy] as [number, number])
  return {
    ...el,
    id: newId,
    x: el.x + dx,
    y: el.y + dy,
    meta: { ...el.meta, points: moved },
  }
}

/**
 * 把一条手绘转成**自由箭头**(③ 特殊互动:本地猜是箭头 → 一键转真 arrow)。
 *
 * 端点取点序列的首尾点(用户画箭头通常一笔从尾扫到头)。arrow 用 bbox 编码线段:
 * x,y = 起点(首点),w,h = 终点-起点(可负表方向)——见 arrowEndpoints 的自由箭头分支。
 *
 * **形态识别**:跑 {@link detectArrowRoute} 判笔画是直/弯/折,给箭头设对应 route。
 *  - 直线 → straight(默认)
 *  - 平滑弯曲 → curve(控制点 = 笔画最大偏移点,让曲线贴合笔画)
 *  - 明确折角(1-2 个)→ elbow(折点 = 折角位置)
 *
 * 这是「自由箭头」:无 from/to(不连卡片),与卡片间的**语义关系箭头**不同(后者有
 * from/to + 关系签名)。默认签名 solid + 开口V(中性箭头);不带 color(走默认描边)。
 *
 * 非 freedraw / 点序列 <2 → null。纯函数,不改原元素。点序列是 R2 隐私,全程本地。
 */
export function freedrawToArrow(el: CanvasElement, newId: string): CanvasElement | null {
  const pts = freedrawPoints(el)
  if (!pts || pts.length < 2) return null
  const start = pts[0]!
  const end = pts[pts.length - 1]!
  const base = {
    id: newId,
    kind: 'arrow' as const,
    x: start[0],
    y: start[1],
    w: end[0] - start[0],
    h: end[1] - start[1],
    rotation: 0,
    dash: 'solid' as const,
    arrowhead: 'arrow' as const,
  }
  const route = detectArrowRoute(pts)
  if (route.kind === 'curve' && route.curve) return { ...base, route: 'curve', curve: route.curve }
  if (route.kind === 'elbow' && route.elbow && route.elbow.length > 0)
    return { ...base, route: 'elbow', elbow: route.elbow }
  return base
}

/**
 * 手绘笔画形态识别:判一条笔画该转成 straight / curve / elbow 箭头。
 *
 * 本地几何启发式(点序列是 R2 隐私,不外发;确定性、可单测):
 *  - **折角检测**:沿笔画走,相邻段方向角突变 > CORNER_ANGLE 的点 = 折角。
 *    检出 1-2 个折角 → elbow(折点 = 折角位置;超过 2 个当没检出,笔画太抖)。
 *  - **弯曲检测**:无明确折角,但笔画明显偏离首尾直线(最大垂距 / 线长 > CURVE_DEVIATION)
 *    → curve(控制点 = 最大偏移点的镜像反算,让二次贝塞尔贴合笔画)。
 *  - 其余(近似直线)→ straight。
 *
 * 返回 kind + 对应数据(curve/elbow)。straight 时数据为空。
 */
export function detectArrowRoute(
  points: [number, number][],
): {
  kind: 'straight' | 'curve' | 'elbow'
  curve?: { cx: number; cy: number }
  elbow?: { x: number; y: number }[]
} {
  if (points.length < 3) return { kind: 'straight' }
  const first = points[0]!
  const last = points[points.length - 1]!

  // 1. 折角检测:相邻点构成的方向角突变。
  const CORNER_ANGLE = Math.PI / 4 // 45°:方向急转算折角
  const MIN_SEGMENT = 4 // 段长 < 此值视为抖动,跳过(避免密集点造成假折角)
  const dirs: { idx: number; angle: number }[] = []
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]![0] - points[i - 1]![0]
    const dy = points[i]![1] - points[i - 1]![1]
    if (Math.hypot(dx, dy) < MIN_SEGMENT) continue
    dirs.push({ idx: i, angle: Math.atan2(dy, dx) })
  }
  const corners: { x: number; y: number }[] = []
  for (let i = 1; i < dirs.length; i++) {
    let delta = Math.abs(dirs[i]!.angle - dirs[i - 1]!.angle)
    if (delta > Math.PI) delta = 2 * Math.PI - delta // 折到 [0,π]
    if (delta > CORNER_ANGLE) {
      const cp = points[dirs[i]!.idx]!
      // 合并相邻折角(< 8px 视为同一个)
      if (corners.length === 0 || Math.hypot(corners[corners.length - 1]!.x - cp[0], corners[corners.length - 1]!.y - cp[1]) > 8) {
        corners.push({ x: cp[0], y: cp[1] })
      }
    }
  }
  // 1-2 个明确折角 → elbow(超过 2 个 = 笔画太抖,不认折线)。
  if (corners.length >= 1 && corners.length <= 2) {
    return { kind: 'elbow', elbow: corners }
  }

  // 2. 弯曲检测:无折角时,看笔画偏离首尾直线的最大垂距。
  const lineLen = Math.hypot(last[0] - first[0], last[1] - first[1])
  if (lineLen < 1) return { kind: 'straight' }
  let maxDev = 0
  let maxDevPt = first
  for (const p of points) {
    // 点到首尾直线的距离(叉积 / 线长)
    const dev = Math.abs((last[0] - first[0]) * (first[1] - p[1]) - (first[0] - p[0]) * (last[1] - first[1])) / lineLen
    if (dev > maxDev) {
      maxDev = dev
      maxDevPt = p
    }
  }
  const CURVE_DEVIATION = 0.15 // 最大垂距 > 线长 15% → 视为弯曲
  if (maxDev / lineLen > CURVE_DEVIATION) {
    // 控制点反算:让二次贝塞尔在 t=0.5 经过最大偏移点。
    // B(0.5) = 0.25·from + 0.5·C + 0.25·to = M → C = 2M - 0.5(from+to)
    const cx = 2 * maxDevPt[0] - 0.5 * (first[0] + last[0])
    const cy = 2 * maxDevPt[1] - 0.5 * (first[1] + last[1])
    return { kind: 'curve', curve: { cx: Math.round(cx), cy: Math.round(cy) } }
  }

  return { kind: 'straight' }
}
