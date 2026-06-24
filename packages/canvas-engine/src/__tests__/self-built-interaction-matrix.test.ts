import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'
import { hitTest } from '../self-built-hittest'
import { marqueeSelect } from '../self-built-marquee'
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

describe('交互矩阵 — 每种 kind × 键盘微移(方向键)', () => {
  function keydown(key: string, shift = false) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true }))
  }
  for (const kind of MOVABLE_KINDS) {
    it(`${kind}:方向键微移后视觉真身平移了`, () => {
      const { host, setSel } = makeHost()
      host.upsert(elementOfKind(kind))
      setSel(['e1'])
      keydown('ArrowRight') // +1 px x
      keydown('ArrowDown') // +1 px y
      const el = host.getElement('e1')!
      expect(el.x).toBe(101)
      expect(el.y).toBe(101)
      if (kind === 'freedraw') {
        // 真身=点序列:键盘微移也须平移 points(同 drag,别只移 bbox)
        const pts = el.meta?.points as [number, number][]
        expect(pts[0]![0]).toBe(101)
        expect(pts[0]![1]).toBe(101)
      }
    })
  }
})

// ── 关系箭头可选中(探照灯:关系箭头 bbox w=h=0 → bbox 命中失败) ──────────────
// 关系箭头(connect 工具创建)bbox 是 x=y=w=h=0(端点由 from/to 引用算),hitTest 按
// bbox 只有单点命中 → 选不中/删不掉/改不了关系类型。这格当前 FAIL,步骤 1+2 修。

describe('交互矩阵 — 关系箭头可选中', () => {
  // 两 card 横向排列,arrow 连接它们。线段从 (100,50)→(200,50),中点 (150,50)。
  const cardA: CanvasElement = { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 }
  const cardB: CanvasElement = { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 }
  const arrow: CanvasElement = {
    id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb',
  }
  const els = [cardA, cardB, arrow]

  it('hitTest:点在线段中点 → 命中 arrow', () => {
    // 线段中点 (150,50)。当前 bbox 命中:w=h=0 → 命不中(返 null 或 card)。
    expect(hitTest(els, 150, 50)).toBe('ar')
  })

  it('hitTest:点偏离线段 → 不命中 arrow', () => {
    // (150, 200) 远离线段 → 不应是 arrow。
    expect(hitTest(els, 150, 200)).not.toBe('ar')
  })

  it('marqueeSelect:框覆盖线段中点 → 选中 arrow', () => {
    // 框 (140,40,20,20) 覆盖中点 (150,50)。当前 arrow w=h=0 → rectsIntersect 几乎框不中。
    expect(marqueeSelect({ x: 140, y: 40, w: 20, h: 20 }, els)).toContain('ar')
  })
})

// ── undo/restore 选区同步(探照灯:undo 撤掉元素后,幽灵 id 残留 selectedIds) ──
// restore()(undo/redo 调它)不刷新 selectedIds。undo 撤掉一个元素后,该 id 仍残留在
// selectedIds,但 getElement(id) 已 undefined → 后续 Delete/方向键/resize handle 取到
// 幽灵 id 静默失效,或选中框画空。restore 应过滤掉快照里不存在的 id 并 emit 选区变更。

describe('undo 选区同步', () => {
  it('undo 撤掉 c2 后,getSelectedIds 不含幽灵 c2(只留仍存在的 c1)', () => {
    const { host } = makeHost()
    const h = host as unknown as {
      setSelectedIds: (ids: string[]) => void
      getSelectedIds: () => string[]
      undo: () => void
      canUndo: () => boolean
    }
    // c1 upsert(echoing → 推 undo 快照=空),选 c1
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    h.setSelectedIds(['c1'])
    // c2 upsert(再推一次 undo 快照=只有 c1),把 c2 累加进选区
    host.upsert({ id: 'c2', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 })
    h.setSelectedIds(['c1', 'c2'])
    expect(h.canUndo()).toBe(true)
    // undo:撤掉 c2 的 upsert → c2 消失,只留 c1
    h.undo()
    expect(host.getElements().map((e) => e.id)).toEqual(['c1'])
    // 选区必须同步:幽灵 c2 被清掉,只剩仍存在的 c1
    expect(h.getSelectedIds()).toEqual(['c1'])
  })

  it('undo 撤掉元素后,onSelectionChange 收到过滤后的选区', () => {
    const { host } = makeHost()
    const h = host as unknown as {
      setSelectedIds: (ids: string[]) => void
      undo: () => void
      onSelectionChange: (cb: (ids: string[]) => void) => () => void
    }
    const events: string[][] = []
    h.onSelectionChange((ids) => events.push([...ids]))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 })
    h.setSelectedIds(['c1', 'c2'])
    events.length = 0 // 只看 undo 后的那次 emit
    h.undo()
    // restore 过滤掉 c2 → emit 一次,内容是 ['c1']
    expect(events).toEqual([['c1']])
  })

  it('undo 后选区里全是仍存在的元素 → 不 emit(避免多余事件)', () => {
    const { host } = makeHost()
    const h = host as unknown as {
      setSelectedIds: (ids: string[]) => void
      undo: () => void
      onSelectionChange: (cb: (ids: string[]) => void) => () => void
    }
    const events: string[][] = []
    h.onSelectionChange((ids) => events.push([...ids]))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    // 第二次 upsert 改 c1 位置(不撤元素,只撤属性),选区只有 c1 全程存在
    host.upsert({ id: 'c1', kind: 'card', x: 5, y: 5, w: 10, h: 10, rotation: 0 })
    h.setSelectedIds(['c1'])
    events.length = 0
    h.undo() // 撤回 c1 的位移,元素没消失,选区无需变
    expect(events).toEqual([])
  })
})

// ── 删端点元素级联删悬空箭头(探照灯:remove(id) 不清理引用它的关系箭头) ──────
// 关系箭头(connect 工具创建)bbox w=h=0,端点由 from/to 引用 card id 算出。删掉一个被
// 引用的 card 后,arrowEndpoints 找不到端点 → 箭头从画布消失(render/hitTest/marquee 全
// 跳过),但元素仍留在 this.elements → 占 id、进 SVG/DSL/快照、reload 仍悬空。用户看不见、
// 选不中、删不掉 = 幽灵元素。期望(drawio/tldraw 惯例):删 id 时,所有 from===id 或
// to===id 的 arrow 一并删(级联删);自由箭头(无 from/to,bbox 非零)不受影响。

describe('删端点元素级联删悬空箭头', () => {
  const cardA: CanvasElement = { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 }
  const cardB: CanvasElement = { id: 'b', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 }
  const relArrow: CanvasElement = {
    id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b',
  }
  // 自由箭头:无 from/to,bbox 非零(真实线段几何)——不应被级联删。
  const freeArrow: CanvasElement = {
    id: 'fa', kind: 'arrow', x: 0, y: 300, w: 100, h: 0, rotation: 0,
  }

  it('remove 端点 b 后,引用它的关系箭头 ar 也被级联删(不留幽灵)', () => {
    const { host } = makeHost()
    host.upsert(cardA)
    host.upsert(cardB)
    host.upsert(relArrow)
    host.remove('b')
    // b 本来就被删
    expect(host.getElement('b')).toBeUndefined()
    // ar 引用 b → 应级联删(当前 FAIL:arrow 悬空残留)
    expect(host.getElement('ar')).toBeUndefined()
  })

  it('remove 端点 a 后(from 侧),引用它的关系箭头 ar 也被级联删', () => {
    const { host } = makeHost()
    host.upsert(cardA)
    host.upsert(cardB)
    host.upsert(relArrow)
    host.remove('a')
    expect(host.getElement('a')).toBeUndefined()
    expect(host.getElement('ar')).toBeUndefined()
  })

  it('remove 端点 b:级联删的 ar 进入 onUserChange 的 removed(持久化层要知道它没了)', () => {
    const { host } = makeHost()
    host.upsert(cardA)
    host.upsert(cardB)
    host.upsert(relArrow)
    const removed: string[] = []
    host.onUserChange((c) => removed.push(...c.removed))
    host.remove('b')
    expect(removed).toContain('b')
    expect(removed).toContain('ar') // 级联删的 arrow 也要广播
  })

  it('remove 不存在的 id → 不级联(现状 early return 保持)', () => {
    const { host } = makeHost()
    host.upsert(cardA)
    host.upsert(cardB)
    host.upsert(relArrow)
    const removed: string[] = []
    host.onUserChange((c) => removed.push(...c.removed))
    host.remove('nope')
    // 什么都没动
    expect(removed).toEqual([])
    expect(host.getElement('ar')).toBeDefined()
    expect(host.getElement('a')).toBeDefined()
  })

  it('自由箭头(无 from/to,bbox 非零)不级联删:删某 card 后仍在', () => {
    const { host } = makeHost()
    host.upsert(cardA)
    host.upsert(cardB)
    host.upsert(freeArrow)
    host.remove('a')
    expect(host.getElement('a')).toBeUndefined()
    // 自由箭头不引用 a → 不应被删(防过度)
    expect(host.getElement('fa')).toBeDefined()
  })

  it('级联删是 1 步 undo:undo 能把 card + 悬空 arrow 一起恢复', () => {
    const { host } = makeHost()
    const h = host as unknown as { undo: () => void; canUndo: () => boolean }
    host.upsert(cardA)
    host.upsert(cardB)
    host.upsert(relArrow)
    host.remove('b') // 级联删 b + ar
    expect(host.getElement('b')).toBeUndefined()
    expect(host.getElement('ar')).toBeUndefined()
    // undo 一步:两者都恢复(不是多步)
    h.undo()
    expect(host.getElement('b')).toBeDefined()
    expect(host.getElement('ar')).toBeDefined()
  })
})



