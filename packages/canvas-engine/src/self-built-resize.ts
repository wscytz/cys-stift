
import { normalizeBox } from './bounds'

/** resize handle:四角。 */
export type Handle = 'nw' | 'ne' | 'sw' | 'se'

const HANDLE_HIT_PX = 6 // 屏幕 px;页坐标里 /zoom
const MIN_SIZE = 10

/** 点是否落在元素某角(handle)上;容差 6 屏幕px。无则 null。 */
export function handleAtPoint(
  el: { x: number; y: number; w: number; h: number },
  point: { x: number; y: number },
  zoom: number,
): Handle | null {
  const b = normalizeBox(el) // 负 bbox 归一化,四角才算对
  // 小元素(10×10)在 6px 容差下中心点会同时命中四角，导致整块无法拖动。
  // 容差封顶到短边的 1/4，保证中心区仍可拖动。
  const tol = Math.min(HANDLE_HIT_PX / zoom, 0.25 * Math.min(b.w, b.h))
  const corners: Record<Handle, { x: number; y: number }> = {
    nw: { x: b.x, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    sw: { x: b.x, y: b.y + b.h },
    se: { x: b.x + b.w, y: b.y + b.h },
  }
  for (const k of Object.keys(corners) as Handle[]) {
    const c = corners[k]
    if (Math.abs(point.x - c.x) <= tol && Math.abs(point.y - c.y) <= tol) return k
  }
  return null
}

/**
 * 拖 handle 到 point 的新 bbox。对角固定,MIN_SIZE=10 clamp。
 * se:fixed=nw;nw:fixed=se;ne:fixed=sw;sw:fixed=ne。
 */
export function resizeGeometry(
  handle: Handle,
  start: { x: number; y: number; w: number; h: number },
  point: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  // 归一化起始 box(负 w/h → 翻到左上角,尺寸取正)。否则 right=x+w 会因负 w 变小,
  // bottom 同理,resize 输出尺寸 / clamp 全错。输出恒为正 box(resize 目标就是可视 box)。
  const ns = normalizeBox(start)
  const right = ns.x + ns.w
  const bottom = ns.y + ns.h
  let x = ns.x
  let y = ns.y
  let w = ns.w
  let h = ns.h
  switch (handle) {
    case 'se':
      w = point.x - x
      h = point.y - y
      break
    case 'ne':
      w = point.x - x
      y = point.y
      h = bottom - point.y
      break
    case 'sw':
      x = point.x
      w = right - point.x
      h = point.y - y
      break
    case 'nw':
      x = point.x
      y = point.y
      w = right - point.x
      h = bottom - point.y
      break
  }
  if (w < MIN_SIZE) {
    if (handle === 'nw' || handle === 'sw') x = right - MIN_SIZE
    w = MIN_SIZE
  }
  if (h < MIN_SIZE) {
    if (handle === 'nw' || handle === 'ne') y = bottom - MIN_SIZE
    h = MIN_SIZE
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}
