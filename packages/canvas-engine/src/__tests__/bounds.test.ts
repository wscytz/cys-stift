import { describe, expect, it } from 'vitest'
import { unionBounds, expandBounds, normalizeBox, intersectsBounds, viewportBounds } from '../bounds'
import type { CanvasView } from '../canvas-host'

describe('normalizeBox', () => {
  it('正 bbox 原样返回', () => {
    expect(normalizeBox({ x: 10, y: 20, w: 30, h: 40 })).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })
  it('负 w 翻转 x', () => {
    expect(normalizeBox({ x: 200, y: 20, w: -100, h: 40 })).toEqual({ x: 100, y: 20, w: 100, h: 40 })
  })
  it('负 h 翻转 y', () => {
    expect(normalizeBox({ x: 10, y: 200, w: 30, h: -100 })).toEqual({ x: 10, y: 100, w: 30, h: 100 })
  })
  it('负 w+h(自由箭头反向)两轴都翻', () => {
    expect(normalizeBox({ x: 200, y: 200, w: -100, h: -100 })).toEqual({ x: 100, y: 100, w: 100, h: 100 })
  })
  it('零尺寸保持', () => {
    expect(normalizeBox({ x: 5, y: 5, w: 0, h: 0 })).toEqual({ x: 5, y: 5, w: 0, h: 0 })
  })
})

describe('unionBounds', () => {
  it('空列表 → null', () => {
    expect(unionBounds([])).toBeNull()
  })
  it('两 box 并集', () => {
    expect(unionBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }]))
      .toEqual({ x: 0, y: 0, w: 30, h: 30 })
  })
})

describe('expandBounds', () => {
  it('四边各扩 border', () => {
    expect(expandBounds({ x: 10, y: 10, w: 20, h: 20 }, 5)).toEqual({ x: 5, y: 5, w: 30, h: 30 })
  })
  it('shadow + border=0 → +5 slack', () => {
    expect(expandBounds({ x: 0, y: 0, w: 10, h: 10 }, 0, true)).toEqual({ x: -5, y: -5, w: 20, h: 20 })
  })
})

describe('intersectsBounds', () => {
  it('重叠的两 box → true', () => {
    expect(intersectsBounds({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
  })
  it('完全分离(一个在另一个左边)→ false', () => {
    expect(intersectsBounds({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(false)
  })
  it('完全分离(一个在另一个上边)→ false', () => {
    expect(intersectsBounds({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 20, w: 10, h: 10 })).toBe(false)
  })
  it('边相切(a.x+a.w === b.x,无可见重叠)→ false', () => {
    expect(intersectsBounds({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
  })
  it('边相切(a.y+a.h === b.y)→ false', () => {
    expect(intersectsBounds({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 })).toBe(false)
  })
  it('一个完全包含另一个 → true', () => {
    expect(intersectsBounds({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 10, h: 10 })).toBe(true)
  })
  it('反向包含(小的包大的)→ true', () => {
    expect(intersectsBounds({ x: 10, y: 10, w: 10, h: 10 }, { x: 0, y: 0, w: 100, h: 100 })).toBe(true)
  })
  it('完全重合 → true', () => {
    expect(intersectsBounds({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(true)
  })
  it('负坐标 box 正确判定', () => {
    expect(intersectsBounds({ x: -20, y: -20, w: 15, h: 15 }, { x: -10, y: -10, w: 10, h: 10 })).toBe(true)
  })
  it('负坐标 box 分离 → false', () => {
    expect(intersectsBounds({ x: -20, y: -20, w: 5, h: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(false)
  })
  it('负 w/h 输入(防御归一化)→ 仍正确', () => {
    // 负 w/h 表示从右下到左上的 box,normalizeBox 会翻到左上原点;应与等价正 bbox 一致
    expect(intersectsBounds({ x: 10, y: 10, w: -10, h: -10 }, { x: 0, y: 0, w: 8, h: 8 })).toBe(true)
  })
})

describe('viewportBounds', () => {
  const view = (over: Partial<CanvasView>): CanvasView => ({ panX: 0, panY: 0, zoom: 1, gridMode: 'free', ...over })
  it('pan(0,0) zoom 1 800x600 → 整个原点框', () => {
    expect(viewportBounds(view({ panX: 0, panY: 0, zoom: 1 }), 800, 600))
      .toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })
  it('pan(100,200) zoom 1 → 视口左上在页坐标 (-100,-200)', () => {
    expect(viewportBounds(view({ panX: 100, panY: 200, zoom: 1 }), 800, 600))
      .toEqual({ x: -100, y: -200, w: 800, h: 600 })
  })
  it('pan(0,0) zoom 2 800x600 → 放大后可见区域减半', () => {
    expect(viewportBounds(view({ panX: 0, panY: 0, zoom: 2 }), 800, 600))
      .toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })
  it('pan(200,400) zoom 2 → 综合平移 + 缩放', () => {
    expect(viewportBounds(view({ panX: 200, panY: 400, zoom: 2 }), 800, 600))
      .toEqual({ x: -100, y: -200, w: 400, h: 300 })
  })
})
