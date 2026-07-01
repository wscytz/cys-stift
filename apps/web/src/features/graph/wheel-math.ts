/**
 * wheel-math — 触摸板/鼠标滚轮缩放相关纯函数。
 *
 * 从 graph-canvas.tsx 抽出,便于单测(graph-canvas 是 Canvas-based,难以单测)。
 *
 * - clampZoom(z):把 zoom 钳到 [MIN_ZOOM, MAX_ZOOM]。缩放手势 / 缩放条 / reset 共用。
 * - normalizeWheelDelta(delta, deltaMode):把 WheelEvent 的 delta 按 deltaMode 归一到像素。
 *   mode 0(像素)原样;mode 1(行)× 16(典型行高);mode 2(页)× 视口高(这里给 600 兜底,
 *   纯函数拿不到真实视口;canvas 侧 pan 时已按 mode 缩放,这里只用于 pan 标量)。
 *   返回带符号(deltaY 正负方向保留)。
 * - clampDelta(delta, limit):钳单次 wheel delta 避免触摸板高频流 / 触控板弹一下产生巨大跳跃。
 * - zoomFactor(deltaY):Math.exp 系数,触摸板 pinch 体验(高频小步,而非一次性大跳)。
 *
 * 这些函数只算「下一步该怎么变」,不碰 DOM / ref / render —— 可直接断言。
 */

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 4

/** 典型行高(像素)。deltaMode===1(lines)按此换算。 */
export const LINE_HEIGHT = 16
/** deltaMode===2(pages)的兜底视口高(纯函数拿不到真实 canvas 尺寸)。 */
export const PAGE_HEIGHT_FALLBACK = 600

/** 单次 wheel delta 绝对值上限,避免巨大跳跃(触摸板弹一下 / 鼠标猛滚)。 */
export const DELTA_CLAMP = 300

/** pinch 缩放系数:exp 系数小 → 高频流里每步变化温和。 */
export const ZOOM_COEFF = 0.0015

/**
 * 把 zoom 钳到 [MIN_ZOOM, MAX_ZOOM]。MIN/MAX 与缩放条 range 一致。
 */
export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

/**
 * 按 deltaMode 把 wheel delta 归一到像素值,带符号。
 * - mode 0(像素,deltaMode 默认 / 触摸板):原样。
 * - mode 1(行):× LINE_HEIGHT。
 * - mode 2(页):× PAGE_HEIGHT_FALLBACK(纯函数兜底;canvas 侧用 mode 判定即可)。
 * - 未知 mode:按像素处理(安全默认)。
 */
export function normalizeWheelDelta(delta: number, deltaMode: number): number {
  switch (deltaMode) {
    case 1:
      return delta * LINE_HEIGHT
    case 2:
      return delta * PAGE_HEIGHT_FALLBACK
    default:
      return delta
  }
}

/**
 * 钳单次 wheel delta 到 ±DELTA_CLAMP,保留方向。
 * 避免触摸板/惯性滚动产生超大单步跳变。
 */
export function clampDelta(delta: number, limit: number = DELTA_CLAMP): number {
  return Math.max(-limit, Math.min(limit, delta))
}

/**
 * pinch 缩放因子:deltaY 负(向上滚 / 外捏)放大,正(向下滚 / 内捏)缩小。
 * exp 系数小 → 高频流里每步温和(触摸板体验)。
 */
export function zoomFactor(deltaY: number, coeff: number = ZOOM_COEFF): number {
  return Math.exp(-deltaY * coeff)
}
