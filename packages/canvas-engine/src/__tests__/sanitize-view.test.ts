import { describe, expect, it } from 'vitest'
import { sanitizeView, ZOOM_MIN, ZOOM_MAX } from '../canvas-host'
import type { CanvasView } from '../canvas-host'

const ok: CanvasView = { panX: 10, panY: 20, zoom: 2, gridMode: 'snap' }

describe('sanitizeView — 引擎自我防御(脏 view 净化)', () => {
  it('合法 view 原样通过', () => {
    expect(sanitizeView(ok)).toEqual(ok)
  })

  it('zoom=0 → 钳到 ZOOM_MIN(防 screenToPage 除 0)', () => {
    expect(sanitizeView({ ...ok, zoom: 0 }).zoom).toBe(ZOOM_MIN)
  })

  it('zoom 负 → 钳到 ZOOM_MIN', () => {
    expect(sanitizeView({ ...ok, zoom: -5 }).zoom).toBe(ZOOM_MIN)
  })

  it('zoom 过大 → 钳到 ZOOM_MAX', () => {
    expect(sanitizeView({ ...ok, zoom: 9999 }).zoom).toBe(ZOOM_MAX)
  })

  it('zoom=NaN → 兜底 1', () => {
    expect(sanitizeView({ ...ok, zoom: NaN }).zoom).toBe(1)
  })

  it('zoom=Infinity → 兜底 1 后钳(非有限先兜 1,1 在区间内)', () => {
    expect(sanitizeView({ ...ok, zoom: Infinity }).zoom).toBe(1)
  })

  it('pan 非有限 → 兜底 0', () => {
    const r = sanitizeView({ ...ok, panX: NaN, panY: Infinity })
    expect(r.panX).toBe(0)
    expect(r.panY).toBe(0)
  })

  it('非法 gridMode → 兜底 free', () => {
    expect(sanitizeView({ ...ok, gridMode: 'bogus' as never }).gridMode).toBe('free')
  })

  it('边界 zoom 恰好 MIN/MAX 保留', () => {
    expect(sanitizeView({ ...ok, zoom: ZOOM_MIN }).zoom).toBe(ZOOM_MIN)
    expect(sanitizeView({ ...ok, zoom: ZOOM_MAX }).zoom).toBe(ZOOM_MAX)
  })
})
