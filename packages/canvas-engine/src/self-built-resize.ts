
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
  const tol = HANDLE_HIT_PX / zoom
  const corners: Record<Handle, { x: number; y: number }> = {
    nw: { x: el.x, y: el.y },
    ne: { x: el.x + el.w, y: el.y },
    sw: { x: el.x, y: el.y + el.h },
    se: { x: el.x + el.w, y: el.y + el.h },
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
  const right = start.x + start.w
  const bottom = start.y + start.h
  let x = start.x
  let y = start.y
  let w = start.w
  let h = start.h
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
