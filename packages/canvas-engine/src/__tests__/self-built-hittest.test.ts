import { describe, expect, it } from 'vitest'
import { hitTest, screenToPage } from '../self-built-hittest'
import type { CanvasElement, CanvasView } from '../canvas-host'

const els: CanvasElement[] = [
  { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0 },
  { id: 'b', kind: 'card', x: 200, y: 0, w: 100, h: 50, rotation: 0 },
]

describe('screenToPage', () => {
  it('subtracts pan and divides by zoom', () => {
    const v: CanvasView = { panX: 10, panY: 20, zoom: 2, gridMode: 'free' }
    expect(screenToPage(v, 110, 120)).toEqual({ x: 50, y: 50 })
  })
})

describe('hitTest', () => {
  it('hits the element containing the page point', () => {
    expect(hitTest(els, 50, 25)).toBe('a')
    expect(hitTest(els, 250, 25)).toBe('b')
    expect(hitTest(els, 150, 25)).toBeNull()
  })
  it('prefers the later-drawn (top) element on overlap', () => {
    const overlap: CanvasElement[] = [
      { id: 'bottom', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'top', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    ]
    expect(hitTest(overlap, 50, 50)).toBe('top') // 数组末尾 = 最上层
  })

  // 关系箭头:bbox w=h=0,按线段距离命中(from/to 端点连线)。
  const arrowEls: CanvasElement[] = [
    { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb' },
  ]
  it('关系箭头:点在线段中点 → 命中(线段距离命中,bbox 命不中)', () => {
    // 线段 (100,50)→(200,50),中点 (150,50)
    expect(hitTest(arrowEls, 150, 50)).toBe('ar')
  })
  it('关系箭头:点偏离线段 → 不命中', () => {
    expect(hitTest(arrowEls, 150, 200)).not.toBe('ar')
  })
  it('关系箭头:点在端点附近 → 命中(容差内)', () => {
    expect(hitTest(arrowEls, 102, 52)).toBe('ar') // 端点 (100,50) 附近 2px
  })
  it('zoom 影响容差:zoom 大 → 页坐标容差小', () => {
    // zoom=0.5 → 页容差 12px;(150,62) 距线段 12px,边界。
    expect(hitTest(arrowEls, 150, 62, 0.5)).toBe('ar')
    // zoom=2 → 页容差 3px;(150,62) 距线段 12px > 3 → 不命中。
    expect(hitTest(arrowEls, 150, 62, 2)).not.toBe('ar')
  })

  // ── route=elbow 折线命中:点到任一段折线 < 容差即命中 ──
  const elbowEls: CanvasElement[] = [
    { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'cb', kind: 'card', x: 300, y: 100, w: 100, h: 100, rotation: 0 },
    // from=A 朝 B 边框交点;elbow=(250,50);to=B 朝 A 边框交点
    { id: 'eb', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', route: 'elbow', elbow: [{ x: 250, y: 50 }] },
  ]
  it('折线箭头:点在第一段上(from→elbow)→ 命中', () => {
    // from=(100,50) → elbow=(250,50):水平线 y=50。(200,50) 在线上
    expect(hitTest(elbowEls, 200, 50)).toBe('eb')
  })
  it('折线箭头:点偏离所有段 → 不命中', () => {
    expect(hitTest(elbowEls, 400, 400)).not.toBe('eb')
  })
  it('折线箭头:点在折角(elbow)附近 → 命中', () => {
    expect(hitTest(elbowEls, 252, 52)).toBe('eb')
  })
})

// ── 悬空关系箭头(端点卡片已删,bbox w=h=0)命中兜底 ──────────────────────────
describe('hitTest 悬空关系箭头', () => {
  it('端点丢失的幽灵箭头可被 bbox+容差命中(能选中删除)', () => {
    // 关系箭头 from/to 指向不存在的卡,bbox w=h=0 → 线段命中跳过。
    // 无 fallback 则永远选不中/删不掉(三条线删不掉的根因)。
    const els = [
      { id: 'ghost', kind: 'arrow', x: 100, y: 100, w: 0, h: 0, rotation: 0, from: 'gone', to: 'also-gone' },
    ] as never
    // 正中: bbox 是点 (100,100),容差 tol=6(zoom=1)→ 100±6 命中
    expect(hitTest(els, 100, 100, 1)).toBe('ghost')
    expect(hitTest(els, 104, 104, 1)).toBe('ghost')  // 容差内
    expect(hitTest(els, 120, 120, 1)).toBeNull()     // 容差外
  })
})

import { eraserHitTest } from '../self-built-hittest'

describe('eraserHitTest 橡皮宽松命中', () => {
  const cards = [
    { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'b', kind: 'card', x: 1000, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' },
  ] as never

  it('关系箭头:zoom=0.5 偏离线 25 页px(远超 6px 精确容差)仍命中', () => {
    // 线在页 y=50。zoom=0.5 → 16px 屏幕 = 32 页px 阈值。偏离 25 < 32 → 命中。
    // hitTest(6px)在此距离早不中。
    expect(eraserHitTest(cards, 500, 75, 0.5)).toBe('ar')
  })

  it('bbox 元素(card)用 bbox+4px 扩展命中', () => {
    // 用不含箭头穿过的元素集,单独测 bbox 扩展命中。
    // card a 在 (0,0,100,100)。点 (105, 50):bbox 外 5px,扩展 4px... 5>4 不中。
    const boxes = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    ] as never
    expect(eraserHitTest(boxes, 105, 50, 1)).not.toBe('a')
    // 点 (103, 50):bbox 外 3px < 4 → 命中
    expect(eraserHitTest(boxes, 103, 50, 1)).toBe('a')
  })

  it('无元素返回 null', () => {
    expect(eraserHitTest([], 50, 50, 1)).toBeNull()
  })

  // ── B6 回归:强弯 curve 箭头能被 eraserHitTest 命中 ──
  // 旧版 eraserHitTest 用直线近似曲线,强弯箭头实际路径远离直线 → 擦不掉。
  // 升级后 curve 走精确贝塞尔采样,橡皮应能命中曲线真正经过的点。
  it('B6:强弯 curve 自由箭头 —— 点在曲线弧顶(远离直线)能擦到', () => {
    // 自由箭头 bbox:(0,0)→(200,0),水平基线 y=0。
    // 控制点 ctrl=(100,150) 把曲线向上拱到 y≈75(二次贝塞尔 t=0.5 高点 = 0.5·ctrl = 75)。
    // 直线近似下擦 y=75 永远擦不到(y=0 直线距 75px > 16px 阈值)。
    // 精确采样下擦 y=75 正中弧顶 → 距离 0 ≤ 16 → 命中。
    const strongCurve = [
      {
        id: 'cv', kind: 'arrow' as const, x: 0, y: 0, w: 200, h: 0, rotation: 0,
        route: 'curve' as const, curve: { cx: 100, cy: 150 },
      },
    ] as never
    // 弧顶点 (100,75):zoom=1 → 16px 屏幕阈值。直线距离 75 ≫ 16(旧版擦不到)。
    expect(eraserHitTest(strongCurve, 100, 75, 1)).toBe('cv')
    // 离弧顶远(下方)→ 仍不命中
    expect(eraserHitTest(strongCurve, 100, -50, 1)).toBeNull()
  })
})
