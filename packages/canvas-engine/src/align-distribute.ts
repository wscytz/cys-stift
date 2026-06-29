import type { CanvasElement } from './canvas-host'

export type AlignOp = 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v' | 'distribute-h' | 'distribute-v' | 'equalize'

export type AlignPatch = { x?: number; y?: number; w?: number; h?: number }

/** 对齐/分布/等大。返回每个元素的 patch Map(元素数不足返回空)。 */
export function applyAlign(elements: CanvasElement[], op: AlignOp): Map<string, AlignPatch> {
  const out = new Map<string, AlignPatch>()
  if (elements.length < 2) return out

  // 边界框
  const minX = Math.min(...elements.map((e) => e.x))
  const maxX = Math.max(...elements.map((e) => e.x + e.w))
  const minY = Math.min(...elements.map((e) => e.y))
  const maxY = Math.max(...elements.map((e) => e.y + e.h))

  if (op === 'left') {
    for (const e of elements) out.set(e.id, { x: minX })
  } else if (op === 'right') {
    for (const e of elements) out.set(e.id, { x: maxX - e.w })
  } else if (op === 'top') {
    for (const e of elements) out.set(e.id, { y: minY })
  } else if (op === 'bottom') {
    for (const e of elements) out.set(e.id, { y: maxY - e.h })
  } else if (op === 'center-h') {
    const cx = (minX + maxX) / 2
    for (const e of elements) out.set(e.id, { x: Math.round(cx - e.w / 2) })
  } else if (op === 'center-v') {
    const cy = (minY + maxY) / 2
    for (const e of elements) out.set(e.id, { y: Math.round(cy - e.h / 2) })
  } else if (op === 'distribute-h') {
    if (elements.length < 3) return out
    const sorted = [...elements].sort((a, b) => a.x - b.x)
    const first = sorted[0]!, last = sorted[sorted.length - 1]!
    const totalSpan = (last.x + last.w) - first.x
    const totalWidth = sorted.reduce((s, e) => s + e.w, 0)
    const gap = (totalSpan - totalWidth) / (sorted.length - 1)
    let cursor = first.x
    for (const e of sorted) {
      out.set(e.id, { x: Math.round(cursor) })
      cursor += e.w + gap
    }
  } else if (op === 'distribute-v') {
    if (elements.length < 3) return out
    const sorted = [...elements].sort((a, b) => a.y - b.y)
    const first = sorted[0]!, last = sorted[sorted.length - 1]!
    const totalSpan = (last.y + last.h) - first.y
    const totalHeight = sorted.reduce((s, e) => s + e.h, 0)
    const gap = (totalSpan - totalHeight) / (sorted.length - 1)
    let cursor = first.y
    for (const e of sorted) {
      out.set(e.id, { y: Math.round(cursor) })
      cursor += e.h + gap
    }
  } else if (op === 'equalize') {
    const aw = Math.round(elements.reduce((s, e) => s + e.w, 0) / elements.length)
    const ah = Math.round(elements.reduce((s, e) => s + e.h, 0) / elements.length)
    for (const e of elements) out.set(e.id, { w: aw, h: ah })
  }
  return out
}
