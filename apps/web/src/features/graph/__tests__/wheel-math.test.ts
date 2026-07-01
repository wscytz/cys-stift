import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  clampDelta,
  normalizeWheelDelta,
  zoomFactor,
  MIN_ZOOM,
  MAX_ZOOM,
  DELTA_CLAMP,
  LINE_HEIGHT,
  PAGE_HEIGHT_FALLBACK,
} from '../wheel-math'

describe('clampZoom', () => {
  it('范围内原样返回', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(0.5)).toBe(0.5)
    expect(clampZoom(2)).toBe(2)
  })
  it('低于下限钳到 MIN_ZOOM', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(-1)).toBe(MIN_ZOOM)
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
  })
  it('高于上限钳到 MAX_ZOOM', () => {
    expect(clampZoom(5)).toBe(MAX_ZOOM)
    expect(clampZoom(10)).toBe(MAX_ZOOM)
    expect(clampZoom(4.1)).toBe(MAX_ZOOM)
  })
  it('边界值包含', () => {
    expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM)
    expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM)
  })
})

describe('clampDelta', () => {
  it('范围内原样返回(保留符号)', () => {
    expect(clampDelta(100)).toBe(100)
    expect(clampDelta(-100)).toBe(-100)
    expect(clampDelta(0)).toBe(0)
  })
  it('超过上限钳到 +DELTA_CLAMP', () => {
    expect(clampDelta(500)).toBe(DELTA_CLAMP)
    expect(clampDelta(9999)).toBe(DELTA_CLAMP)
  })
  it('低于下限钳到 -DELTA_CLAMP', () => {
    expect(clampDelta(-500)).toBe(-DELTA_CLAMP)
    expect(clampDelta(-9999)).toBe(-DELTA_CLAMP)
  })
  it('自定义 limit 生效', () => {
    expect(clampDelta(100, 50)).toBe(50)
    expect(clampDelta(-100, 50)).toBe(-50)
  })
})

describe('normalizeWheelDelta', () => {
  it('mode 0(像素)原样返回', () => {
    expect(normalizeWheelDelta(42, 0)).toBe(42)
    expect(normalizeWheelDelta(-42, 0)).toBe(-42)
  })
  it('mode 1(行)× LINE_HEIGHT', () => {
    expect(normalizeWheelDelta(3, 1)).toBe(3 * LINE_HEIGHT)
    expect(normalizeWheelDelta(-2, 1)).toBe(-2 * LINE_HEIGHT)
  })
  it('mode 2(页)× PAGE_HEIGHT_FALLBACK', () => {
    expect(normalizeWheelDelta(1, 2)).toBe(PAGE_HEIGHT_FALLBACK)
    expect(normalizeWheelDelta(-1, 2)).toBe(-PAGE_HEIGHT_FALLBACK)
  })
  it('未知 mode 按像素处理(安全默认)', () => {
    expect(normalizeWheelDelta(42, 99)).toBe(42)
  })
})

describe('zoomFactor', () => {
  it('deltaY 负(外捏/向上滚)→ factor > 1(放大)', () => {
    expect(zoomFactor(-100)).toBeGreaterThan(1)
  })
  it('deltaY 正(内捏/向下滚)→ factor < 1(缩小)', () => {
    expect(zoomFactor(100)).toBeLessThan(1)
  })
  it('deltaY 为 0 → factor = 1(不变)', () => {
    expect(zoomFactor(0)).toBeCloseTo(1, 10)
  })
  it('更大 |deltaY| → 更大偏移(单调)', () => {
    const f1 = zoomFactor(-50)
    const f2 = zoomFactor(-200)
    // 都是放大(factor>1),更大 deltaY 放得更多
    expect(f2).toBeGreaterThan(f1)
  })
  it('自定义 coeff 生效', () => {
    // coeff 越大,同等 deltaY 偏移越大
    const small = zoomFactor(-100, 0.001)
    const big = zoomFactor(-100, 0.01)
    expect(big).toBeGreaterThan(small)
  })
})
