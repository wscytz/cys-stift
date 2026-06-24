
/**
 * $1 手势识别器(Wobbrock et al., UIST 2007)—— 本地模板匹配,认具体手绘形状。
 *
 * 论文:《Gestures without Libraries, Toolkits or Training: A $1 Recognizer for
 * User Interface Prototypes》。~100 行纯几何+三角,零依赖零训练,旋转/缩放/平移不变。
 *
 * ## 为什么是 $1(而非 AI)
 *
 * 手绘点序列是 **R2 隐私**(笔迹不外发,见 privacy-design.md)。$1 全程本地:重采样/
 * 旋转/缩放/比对都在本地,**点序列绝不外发任何 AI**。在守隐私的前提下,仍把识别从
 * 「猜类别」(classifyFreedraw 的启发式)升级到「认具体形状」(圈/三角/框/对勾…)。
 *
 * ## 算法(论文 Appendix A,4 步)
 *
 *  1. RESAMPLE:等距重采样到 N=64 点(路径长/N-1 步进,线性插值)。
 *  2. ROTATE-TO-ZERO:按「指示角」(质心→首点)旋到 0°。
 *  3. SCALE-TO-SQUARE + TRANSLATE-TO-ORIGIN:非均匀缩放到参考方块 + 质心移到原点。
 *  4. RECOGNIZE:对每个模板 GSS(黄金分割)搜最佳角,最小路径距离 → 结果 + [0..1] score。
 *
 * ## 已知限制(论文 §Limitations,诚实记进代码)
 *
 *  - 旋转/缩放/平移不变 → **无法区分朝向/比例**(正方形 vs 长方形、圆 vs 椭圆、
 *    上箭头 vs 下箭头)。模板只放「形状本质不同」的手势,避开需区分朝向/比例的。
 *  - **1D 手势**(纯水平/竖线)被非均匀缩放破坏 → 调用方对细长笔画先判 elongation,
 *    走专门分支(如 freedrawToArrow),不进 $1。本模块对 1D 安全(短边 0 不除零),
 *    但结果无意义,由调用方规避。
 */

export interface Point {
  x: number
  y: number
}

export interface GestureTemplate {
  name: string
  /** 归一化后的 N 点(已 resample+rotate+scale+translate)。 */
  points: Point[]
}

export interface RecognitionResult {
  /** 最匹配的模板名;无模板/置信度低 → 'unknown'。 */
  name: string
  /** [0..1] 置信度(score)。 */
  score: number
}

const NUM_POINTS = 64 // 论文:N=64 adequate(32~256 均可)
const SQUARE_SIZE = 250 // 参考方块边长(论文实践值)
const HALF_DIAGONAL = 0.5 * Math.SQRT2 * SQUARE_SIZE // = score 分母:对角线一半
/** GSS 黄金分割搜角参数(论文)。φ = ½(-1+√5)。 */
const PHI = 0.5 * (-1 + Math.sqrt(5))
const ANGLE_RANGE = deg2rad(45) // θ = ±45°
const ANGLE_PRECISION = deg2rad(2) // θ∆ = 2°

// ── 基础几何 ─────────────────────────────────────────────────────────────────

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pathLength(points: Point[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) d += distance(points[i - 1]!, points[i]!)
  return d
}

function centroid(points: Point[]): Point {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}

function boundingBox(points: Point[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

// ── Step 1: RESAMPLE ─────────────────────────────────────────────────────────

/**
 * 等距重采样到 n 点。路径长/(n-1) 为步进,线性插值补点。
 * 少于 2 点 → 直接复制(无法重采样,调用方应规避)。
 */
export function resamplePath(points: Point[], n: number = NUM_POINTS): Point[] {
  if (points.length === 0) return []
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0]! }))
  const len = pathLength(points)
  // 路径长 0(所有点重合)→ 复制首点 n 次。
  if (len === 0) return Array.from({ length: n }, () => ({ ...points[0]! }))
  const interval = len / (n - 1)
  const out: Point[] = [points[0]!]
  let accumulated = 0
  // 论文用 INSERT 原地改;这里用游标遍历,等价且不 mutate 输入。
  let prev = points[0]!
  for (let i = 1; i < points.length; i++) {
    const cur = points[i]!
    let d = distance(prev, cur)
    if (d === 0) {
      prev = cur
      continue
    }
    while (accumulated + d >= interval && out.length < n) {
      const t = (interval - accumulated) / d
      const q: Point = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) }
      out.push(q)
      prev = q
      d = distance(prev, cur)
      accumulated = 0
    }
    accumulated += d
    prev = cur
  }
  // 浮点误差可能导致最后一点没填满 → 补首/末点对齐。
  while (out.length < n) out.push({ ...points[points.length - 1]! })
  return out
}

// ── Step 2: ROTATE-TO-ZERO ───────────────────────────────────────────────────

/** 旋转 points 使「指示角」(质心→首点)归 0°。
 *
 * 注:论文伪代码写 atan2(cy−p0y, cx−p0x)(首点→质心),但配 rotate-by(−θ) 会让指示角
 * 落到 180° 而非 0°(首点→质心 与 质心→首点 差 180°)。这里用 atan2(p0−c)(质心→首点)
 * 使旋转后首点真在质心正右方(指示角=0),GSS 在 ±45° 搜角才有效。多版 $1 实现此处
 * 写法不一,以「指示角真归 0」为准。 */
export function rotateToZero(points: Point[]): Point[] {
  const c = centroid(points)
  const theta = Math.atan2(points[0]!.y - c.y, points[0]!.x - c.x)
  return rotateBy(points, -theta, c)
}

function rotateBy(points: Point[], theta: number, c: Point): Point[] {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return points.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }))
}

// ── Step 3: SCALE-TO-SQUARE + TRANSLATE-TO-ORIGIN ────────────────────────────

/** 非均匀缩放到 size×size 方块(短边为 0 → 该轴不缩放,防除零)。 */
export function scaleToSquare(points: Point[], size: number = SQUARE_SIZE): Point[] {
  const b = boundingBox(points)
  const sx = b.w === 0 ? 1 : size / b.w
  const sy = b.h === 0 ? 1 : size / b.h
  return points.map((p) => ({ x: p.x * sx, y: p.y * sy }))
}

/** 平移使质心到原点。 */
export function translateToOrigin(points: Point[]): Point[] {
  const c = centroid(points)
  return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }))
}

/** 候选/模板的统一归一化:resample → rotate → scale → translate。 */
export function normalizeGesture(points: Point[]): Point[] {
  return translateToOrigin(scaleToSquare(rotateToZero(resamplePath(points))))
}

// ── Step 4: RECOGNIZE ────────────────────────────────────────────────────────

/** 两段等长点序列的平均逐点距离(论文 PATH-DISTANCE)。 */
function pathDistance(a: Point[], b: Point[]): number {
  let d = 0
  for (let i = 0; i < a.length; i++) d += distance(a[i]!, b[i]!)
  return d / a.length
}

function distanceAtAngle(points: Point[], template: Point[], theta: number): number {
  const c = centroid(points)
  return pathDistance(rotateBy(points, theta, c), template)
}

/** GSS 黄金分割搜最佳角,返回最小距离(论文 DISTANCE-AT-BEST-ANGLE)。 */
function distanceAtBestAngle(
  points: Point[],
  template: Point[],
  thetaA: number,
  thetaB: number,
  threshold: number,
): number {
  let x1 = PHI * thetaA + (1 - PHI) * thetaB
  let f1 = distanceAtAngle(points, template, x1)
  let x2 = (1 - PHI) * thetaA + PHI * thetaB
  let f2 = distanceAtAngle(points, template, x2)
  while (Math.abs(thetaB - thetaA) > threshold) {
    if (f1 < f2) {
      thetaB = x2
      x2 = x1
      f2 = f1
      x1 = PHI * thetaA + (1 - PHI) * thetaB
      f1 = distanceAtAngle(points, template, x1)
    } else {
      thetaA = x1
      x1 = x2
      f1 = f2
      x2 = (1 - PHI) * thetaA + PHI * thetaB
      f2 = distanceAtAngle(points, template, x2)
    }
  }
  return Math.min(f1, f2)
}

/**
 * 识别候选手势:对每个模板 GSS 搜最佳角,最小路径距离者胜出。
 * 返回 {name, score}。空候选/无模板 → unknown@0。
 *
 * score = 1 − (最佳路径距离) / (0.5·√(size²+size²)),分母=参考方块对角线一半(论文 Eq.2)。
 */
export function recognizeGesture(
  candidate: Point[],
  templates: GestureTemplate[],
): RecognitionResult {
  if (candidate.length < 2 || templates.length === 0) {
    return { name: 'unknown', score: 0 }
  }
  const normalized = normalizeGesture(candidate)
  let best = Infinity
  let bestName = 'unknown'
  for (const t of templates) {
    const d = distanceAtBestAngle(normalized, t.points, -ANGLE_RANGE, ANGLE_RANGE, ANGLE_PRECISION)
    if (d < best) {
      best = d
      bestName = t.name
    }
  }
  const score = Math.max(0, 1 - best / HALF_DIAGONAL)
  return { name: bestName, score }
}
