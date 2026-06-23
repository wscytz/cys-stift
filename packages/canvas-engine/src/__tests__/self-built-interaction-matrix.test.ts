import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'
import { hitTest } from '../self-built-hittest'
import type { CanvasElement } from '../canvas-host'

/**
 * 交互矩阵测试(探照灯,2026-06-23)。
 *
 * 背景:freedraw 移动 bug 是「元素 kind × 操作」矩阵里没人认领的格子——freedraw phase
 * 只做创建/渲染,move phase 只用 card 测(测试数据全 kind:'card')。card 视觉=bbox,
 * 改 x/y 就动;但 freedraw 真身是 meta.points(绝对坐标),move 只改 bbox 对它无效,
 * 而没有任何测试用 freedraw 去拖 → 漏网。
 *
 * 这张矩阵把【每种可移动 kind × 每种操作】都点一遍,断言「操作后元素**视觉真身**确实变了」:
 *  - card/rect/text:真身=bbox → 断言 x/y(drag)、w/h(resize)变。
 *  - freedraw:真身=meta.points → 断言点序列实际平移/缩放(不只 bbox)。
 *
 * 预期:freedraw × {drag,resize} 当前 FAIL(底座 bug),步骤 1+2 修绿。其余 PASS。
 * 任何 kind × 操作的疏漏以后都被这张表自动抓住,不靠人记得测。
 */

function makeHost() {
  const host = new SelfBuiltAdapter(document.createElement('canvas'))
  const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
  const setSel = (host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds.bind(host)
  return { host, canvas, setSel }
}

function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
  canvas.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y }),
  )
}

/** 一个 100x100、左上角在 (100,100) 的该 kind 元素(freedraw 用对角点序列填满 bbox)。 */
function elementOfKind(kind: CanvasElement['kind']): CanvasElement {
  const base: CanvasElement = { id: 'e1', kind, x: 100, y: 100, w: 100, h: 100, rotation: 0 }
  if (kind === 'freedraw') {
    // 点序列铺满 bbox 的对角(首尾 = bbox 两角),move/resize 必须让这些点跟随。
    base.meta = { points: [[100, 100], [150, 150], [200, 200]] }
  }
  if (kind === 'text') base.text = 'hi'
  return base
}

const MOVABLE_KINDS: CanvasElement['kind'][] = ['card', 'rect', 'text', 'freedraw']

describe('交互矩阵 — 每种 kind × drag', () => {
  for (const kind of MOVABLE_KINDS) {
    it(`${kind}:拖动后视觉真身平移了`, () => {
      const { host, canvas, setSel } = makeHost()
      host.upsert(elementOfKind(kind))
      setSel(['e1'])
      // 命中元素中心 (150,150),拖到 (250,250) → 位移 (+100,+100)
      dispatch(canvas, 'pointerdown', 150, 150)
      dispatch(canvas, 'pointermove', 250, 250)
      dispatch(canvas, 'pointerup', 250, 250)
      const el = host.getElement('e1')!
      // bbox 平移(所有 kind 都应满足)
      expect(el.x).toBeGreaterThan(100)
      expect(el.y).toBeGreaterThan(100)
      if (kind === 'freedraw') {
        // 真身=点序列:首点必须跟着平移(不只 bbox)
        const pts = el.meta?.points as [number, number][]
        expect(pts[0]![0]).toBeGreaterThan(100)
        expect(pts[0]![1]).toBeGreaterThan(100)
      }
    })
  }
})

describe('交互矩阵 — 每种 kind × resize(SE 角)', () => {
  for (const kind of MOVABLE_KINDS) {
    it(`${kind}:resize 后视觉真身缩放了`, () => {
      const { host, canvas, setSel } = makeHost()
      host.upsert(elementOfKind(kind))
      setSel(['e1'])
      // SE 角在 (200,200);拖到 (300,300) → 放大
      dispatch(canvas, 'pointerdown', 200, 200)
      dispatch(canvas, 'pointermove', 300, 300)
      dispatch(canvas, 'pointerup', 300, 300)
      const el = host.getElement('e1')!
      // bbox 放大
      expect(el.w).toBeGreaterThan(100)
      expect(el.h).toBeGreaterThan(100)
      if (kind === 'freedraw') {
        // 真身=点序列:末点(原在 bbox SE 角 200,200)必须随 resize 外扩
        const pts = el.meta?.points as [number, number][]
        const last = pts[pts.length - 1]!
        expect(last[0]).toBeGreaterThan(200)
        expect(last[1]).toBeGreaterThan(200)
      }
    })
  }
})

describe('交互矩阵 — 每种 kind × hitTest(中心点命中自己)', () => {
  for (const kind of MOVABLE_KINDS) {
    it(`${kind}:bbox 中心点能命中自己`, () => {
      const el = elementOfKind(kind) // bbox (100,100,100,100),中心 (150,150)
      expect(hitTest([el], 150, 150)).toBe('e1')
    })
  }

  // 自由箭头形态:w/h 可负(表方向)。hitTest 的 x..x+w 假设 w≥0 → 负则区间空 →
  // 反向画的自由箭头点不中(选不了/删不了/移不动)。这格当前 FAIL,步骤 1 修。
  it('自由箭头(负 bbox)中心点能命中自己', () => {
    const freeArrow: CanvasElement = {
      id: 'fa', kind: 'arrow', x: 200, y: 200, w: -100, h: -100, rotation: 0,
    }
    // bbox 实际覆盖 (100,100)..(200,200),中心 (150,150)
    expect(hitTest([freeArrow], 150, 150)).toBe('fa')
  })
})

