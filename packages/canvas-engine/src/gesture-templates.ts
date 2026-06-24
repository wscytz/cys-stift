
/**
 * 手绘形状模板 + recognizeShape(2026-06-23)。
 *
 * 把 \$1 识别器(gesture-recognizer.ts)包成「认具体装饰形状」的高层 API:$1 匹配内置
 * 模板(circle/rect/triangle/check…),低置信回退 unknown。与 classifyFreedraw(启发式
 * 粗判 arrow/decoration)互补——后者管 1D 细长(箭头),前者管 2D 闭合/复杂装饰。
 *
 * 模板 = 预归一化的 N=64 点(已 resample+rotate+scale+translate),存引擎层(纯数据,
 * 零依赖)。形状点序列程序生成(圆/方/三角/对勾),保证可复现 + 可单测。
 *
 * 守 R2 隐私:全程本地,点序列不外发。
 */

import {
  normalizeGesture,
  recognizeGesture,
  type GestureTemplate,
  type Point,
} from './gesture-recognizer'

// ── 形状生成(纯函数,程序造点序列) ──────────────────────────────────────────

/** 圆(闭合,n 段)。 */
function circlePoints(r: number, n = 48): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  return pts
}

/** 正方形描边(闭合)。 */
function rectPoints(s: number): Point[] {
  const h = s / 2
  const per = s / 4 // 每边 5 点(含角),保证 resample 前有足够采样
  const pts: Point[] = []
  for (let i = 0; i <= 4; i++) pts.push({ x: -h + (i / 4) * s, y: -h }) // 上边
  for (let i = 1; i <= 4; i++) pts.push({ x: h, y: -h + (i / 4) * s }) // 右边
  for (let i = 1; i <= 4; i++) pts.push({ x: h - (i / 4) * s, y: h }) // 下边
  for (let i = 1; i <= 4; i++) pts.push({ x: -h, y: h - (i / 4) * s }) // 左边
  return pts
}

/** 等边三角形描边(闭合)。 */
function trianglePoints(r: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  pts.push(pts[0]!) // 闭合
  return pts
}

/** 对勾(check,不闭合)。 */
function checkPoints(s: number): Point[] {
  const h = s / 2
  // 从左上 → 下中 → 右上 的 V 形(对勾)
  return [
    { x: -h, y: 0 },
    { x: -h / 3, y: h },
    { x: h, y: -h },
  ]
}

// ── 内置模板(预归一化) ─────────────────────────────────────────────────────

/**
 * 内置装饰形状模板。只放「形状本质不同」的手势——避开 \$1 无法区分的朝向/比例对
 * (方 vs 长方、圆 vs 椭圆)。箭头不进此处(1D 细长踩非均匀缩放坑,走 classifyFreedraw)。
 */
export const BUILTIN_SHAPE_TEMPLATES: GestureTemplate[] = [
  { name: 'circle', points: normalizeGesture(circlePoints(50)) },
  { name: 'rect', points: normalizeGesture(rectPoints(80)) },
  { name: 'triangle', points: normalizeGesture(trianglePoints(50)) },
  { name: 'check', points: normalizeGesture(checkPoints(60)) },
]

/** 模板名 → 用户可读 key(由调用方转 i18n;unknown 不在此列)。 */
export type ShapeName = 'circle' | 'rect' | 'triangle' | 'check' | 'unknown'

// ── 高层 API ─────────────────────────────────────────────────────────────────

export interface ShapeRecognition {
  shape: ShapeName
  /** [0..1] 置信度。 */
  confidence: number
}

/** recognizeShape 认为可信的最低置信度(低于 → unknown,避免硬猜)。 */
const SHAPE_CONFIDENCE_THRESHOLD = 0.7

/**
 * 认一条手绘的具体装饰形状。内部跑 \$1 对内置模板匹配。
 *
 * - 点序列 <2 / 空 → unknown@0。
 * - 最佳匹配 score ≥ 阈值 → 该形状;否则 unknown(诚实:低置信不硬猜)。
 *
 * 注意:本函数只管 2D 装饰形状。1D 细长(箭头/线)应由调用方先判 classifyFreedraw 走
 * arrow 分支,不进此处(非均匀缩放对 1D 无意义)。全程本地,点序列不外发。
 */
export function recognizeShape(points: Point[]): ShapeRecognition {
  if (points.length < 2) return { shape: 'unknown', confidence: 0 }
  const { name, score } = recognizeGesture(points, BUILTIN_SHAPE_TEMPLATES)
  if (score < SHAPE_CONFIDENCE_THRESHOLD) return { shape: 'unknown', confidence: score }
  return { shape: name as ShapeName, confidence: score }
}
