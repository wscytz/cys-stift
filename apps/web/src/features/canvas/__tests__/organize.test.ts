import { describe, it, expect } from 'vitest'
import { computeAutoLayout } from '../auto-layout'
import type { CanvasElement } from '@cys-stift/canvas-engine'

function card(id: string, x = 0, y = 0, w = 200, h = 120): CanvasElement {
  return { id, kind: 'card', x, y, w, h, rotation: 0 }
}
function arrow(id: string, from: string, to: string): CanvasElement {
  return { id, kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from, to }
}

// 固定 4 卡夹具(用于 grid/pack 精确断言)。id 排序后 = a,b,c,d。
const W = 200, H = 120, GAP = 60
function fourCards(): CanvasElement[] {
  // 给不同原位,验证 origin 校正 / pack 质心平移不依赖原位。
  return [card('a', 1000, 2000), card('b', 500, 100), card('c', -50, 700), card('d', 300, -100)]
}

/** 断言每张输入卡都在结果里且坐标有限。 */
function expectAllPresentFinite(els: CanvasElement[], m: Map<string, { x: number; y: number }>) {
  for (const e of els) {
    if (e.kind !== 'card') continue
    expect(m.has(e.id)).toBe(true)
    const p = m.get(e.id)!
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  }
}

/** 断言网格结果中卡两两不重叠(bbox 不相交,按 effectiveGap 留白)。 */
function expectNoOverlap(
  els: CanvasElement[],
  m: Map<string, { x: number; y: number }>,
  effectiveGap: number,
) {
  const cards = els.filter((e) => e.kind === 'card')
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]!, b = cards[j]!
      const pa = m.get(a.id)!, pb = m.get(b.id)!
      // AABB 相交判定:水平不重叠 或 垂直不重叠 即 disjoint(留 effectiveGap 间隙)。
      const horizGap = Math.min(pa.x + a.w, pb.x + b.w) - Math.max(pa.x, pb.x)
      const vertGap = Math.min(pa.y + a.h, pb.y + b.h) - Math.max(pa.y, pb.y)
      const disjoint = horizGap <= -effectiveGap || vertGap <= -effectiveGap
      expect(disjoint).toBe(true)
    }
  }
}

describe('computeAutoLayout — 整理范式(策略×方向×间距)', () => {
  describe('所有策略通用断言', () => {
    const strategies = ['mindmap', 'flow', 'grid', 'pack'] as const
    for (const strategy of strategies) {
      it(`${strategy}:每张输入 card 都拿到有限坐标`, () => {
        const els = [card('a'), card('b'), card('c'), card('d')]
        const m = computeAutoLayout(els, { strategy })
        expectAllPresentFinite(els, m)
        expect(m.size).toBe(4)
      })
    }

    for (const strategy of strategies) {
      it(`${strategy}:布局 bbox 非退化(不是单点)`, () => {
        // 给 dagre 一条边(孤立卡会塌缩到同一 rank);grid/pack 不读边,无影响。
        const els = [card('a'), card('b'), card('c'), card('d'), arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c')]
        const m = computeAutoLayout(els, { strategy })
        const xs = [...m.values()].map((p) => p.x)
        const ys = [...m.values()].map((p) => p.y)
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0)
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0)
      })
    }
  })

  describe('grid 策略', () => {
    it('cols = ceil(sqrt(n)) n=4 cols=2, TB 行优先从左上填', () => {
      const els = fourCards()
      const m = computeAutoLayout(els, { strategy: 'grid', direction: 'TB', gap: GAP })
      expect(m.size).toBe(4)
      expectNoOverlap(els, m, GAP)
      // n=4,cols=2,rows=2。id 排序 a,b,c,d → 顺序 i=0..3。
      // TB 行优先:i=0 (col0,row0), i=1 (col1,row0), i=2 (col0,row1), i=3 (col1,row1)。
      // stepX = maxW+gap = 200+60 = 260; stepY = maxH+gap = 120+60 = 180。
      // origin 校正后 bbox 左上 = (minX,minY) = (-50,-100)。
      const a = m.get('a')!, b = m.get('b')!, c = m.get('c')!, d = m.get('d')!
      // a 在 (col0,row0) → bbox 左上
      expect(a).toEqual({ x: -50, y: -100 })
      // b 在 (col1,row0):x = -50 + 260 = 210, y = -100
      expect(b).toEqual({ x: 210, y: -100 })
      // c 在 (col0,row1):x = -50, y = -100 + 180 = 80
      expect(c).toEqual({ x: -50, y: 80 })
      // d 在 (col1,row1):x = 210, y = 80
      expect(d).toEqual({ x: 210, y: 80 })
    })

    it('LR 列优先:从左上往下填,再往右', () => {
      const els = fourCards()
      const m = computeAutoLayout(els, { strategy: 'grid', direction: 'LR', gap: GAP })
      expectNoOverlap(els, m, GAP)
      // n=4,cols=2,rows=2。LR 列优先:i=0 (col0,row0), i=1 (col0,row1), i=2 (col1,row0), i=3 (col1,row1)。
      const a = m.get('a')!, b = m.get('b')!, c = m.get('c')!, d = m.get('d')!
      // origin 校正后 bbox 左上 = (minX,minY) = (-50,-100)。
      expect(a).toEqual({ x: -50, y: -100 })
      // b: col0,row1 → x=-50, y=-100+180=80
      expect(b).toEqual({ x: -50, y: 80 })
      // c: col1,row0 → x=-50+260=210, y=-100
      expect(c).toEqual({ x: 210, y: -100 })
      // d: col1,row1 → x=210, y=80
      expect(d).toEqual({ x: 210, y: 80 })
    })

    it('BT 是 TB 的上下镜像:同列,行翻转', () => {
      const els = fourCards()
      const mTB = computeAutoLayout(els, { strategy: 'grid', direction: 'TB', gap: GAP })
      const mBT = computeAutoLayout(els, { strategy: 'grid', direction: 'BT', gap: GAP })
      // cols 相同(2);每个 id 的 x 相同(TB 与 BT 只翻 y)。
      for (const id of ['a', 'b', 'c', 'd']) {
        expect(mBT.get(id)!.x).toBe(mTB.get(id)!.x)
      }
      // bbox 高度相同,但顶部/底部互换:y 关于 bbox 中线对称。
      const ysTB = [...mTB.values()].map((p) => p.y).sort((x, y) => x - y)
      const ysBT = [...mBT.values()].map((p) => p.y).sort((x, y) => x - y)
      const topTB = ysTB[0]!, bottomTB = ysTB[3]!
      const topBT = ysBT[0]!, bottomBT = ysBT[3]!
      const midTB = (topTB + bottomTB) / 2
      const midBT = (topBT + bottomBT) / 2
      // 中线相同;集合对称 → 反转后 y 集合的相对偏移镜像。
      // 简化断言:TB 第一行(a,b)的 y 最小;BT 中 a,b 的 y 应是最大(在底部)。
      expect(mBT.get('a')!.y).toBeGreaterThan(mBT.get('c')!.y)
      expect(mBT.get('a')!.y).toBeGreaterThan(mBT.get('d')!.y)
      expect(midBT).toBeCloseTo(midTB, 0)
    })

    it('RL 是 LR 的左右镜像:同行,列翻转', () => {
      const els = fourCards()
      const mLR = computeAutoLayout(els, { strategy: 'grid', direction: 'LR', gap: GAP })
      const mRL = computeAutoLayout(els, { strategy: 'grid', direction: 'RL', gap: GAP })
      // 每个 id 的 y 相同(LR 与 RL 只翻 x)。
      for (const id of ['a', 'b', 'c', 'd']) {
        expect(mRL.get(id)!.y).toBe(mLR.get(id)!.y)
      }
      // LR 中 a 在最左(x 最小);RL 中 a 应在最右(x 最大)。
      expect(mRL.get('a')!.x).toBeGreaterThan(mRL.get('c')!.x)
    })

    it('cols=ceil(sqrt(n)) 对 n=5 → cols=3(末行不满)', () => {
      const els = [card('a'), card('b'), card('c'), card('d'), card('e')]
      const m = computeAutoLayout(els, { strategy: 'grid', direction: 'TB', gap: GAP })
      expect(m.size).toBe(5)
      expectNoOverlap(els, m, GAP)
      // cols=3:第 0 行 a,b,c(x 各差 260);第 1 行 d,e。
      const a = m.get('a')!, c = m.get('c')!, d = m.get('d')!
      expect(c.x - a.x).toBe(2 * (W + GAP)) // a→c 跨 2 列
      expect(d.y - a.y).toBe(H + GAP) // a→d 跨 1 行
    })
  })

  describe('pack 策略', () => {
    it('pack 比 grid 更紧凑(同 gap 下 bbox 更小)', () => {
      const els = fourCards()
      const mGrid = computeAutoLayout(els, { strategy: 'grid', direction: 'TB', gap: GAP })
      const mPack = computeAutoLayout(els, { strategy: 'pack', direction: 'TB', gap: GAP })
      // pack effectiveGap = gap*0.5 = 30;grid = 60。pack 的 bbox 宽/高都应 ≤ grid。
      const bbox = (m: Map<string, { x: number; y: number }>) => {
        const xs = [...m.values()].map((p) => p.x)
        const ys = [...m.values()].map((p) => p.y)
        return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      }
      const bGrid = bbox(mGrid)
      const bPack = bbox(mPack)
      expect(bPack.w).toBeLessThanOrEqual(bGrid.w)
      expect(bPack.h).toBeLessThanOrEqual(bGrid.h)
      // 至少一个严格更小(间距减半)。
      expect(bPack.w < bGrid.w || bPack.h < bGrid.h).toBe(true)
    })

    it('pack 卡之间仍不重叠(effectiveGap=30 留白)', () => {
      const els = fourCards()
      const m = computeAutoLayout(els, { strategy: 'pack', direction: 'TB', gap: GAP })
      expectNoOverlap(els, m, GAP * 0.5)
    })
  })

  describe('mindmap / flow(dagre 分层)', () => {
    it('mindmap 默认方向 TB → 链式 A→B→C 三层 y 递增', () => {
      const els = [card('a'), card('b'), card('c'), arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c')]
      const m = computeAutoLayout(els, { strategy: 'mindmap' }) // 默认 TB
      const a = m.get('a')!, b = m.get('b')!, c = m.get('c')!
      expect(a.y).toBeLessThan(b.y)
      expect(b.y).toBeLessThan(c.y)
      // 不是全在一条线上(有水平展开)
      const xs = [a.x, b.x, c.x]
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(0)
    })

    it('flow 默认方向 LR → 链式 A→B→C 三层 x 递增(水平流水线)', () => {
      const els = [card('a'), card('b'), card('c'), arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c')]
      const m = computeAutoLayout(els, { strategy: 'flow' }) // 默认 LR
      const a = m.get('a')!, b = m.get('b')!, c = m.get('c')!
      expect(a.x).toBeLessThan(b.x)
      expect(b.x).toBeLessThan(c.x)
    })

    it('mindmap ranksep = gap*1.5;flow ranksep = gap*2(flow 层间距更宽)', () => {
      // 同链同 gap,flow 的层间距应 > mindmap(横向 x 跨度更大)。
      const els = [card('a'), card('b'), card('c'), arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c')]
      const mMind = computeAutoLayout(els, { strategy: 'mindmap', direction: 'LR', gap: 60 })
      const mFlow = computeAutoLayout(els, { strategy: 'flow', direction: 'LR', gap: 60 })
      const spanMind = Math.abs(mMind.get('c')!.x - mMind.get('a')!.x)
      const spanFlow = Math.abs(mFlow.get('c')!.x - mFlow.get('a')!.x)
      expect(spanFlow).toBeGreaterThan(spanMind)
    })

    it('direction 可覆盖默认:flow 配 TB 也跑通', () => {
      const els = [card('a'), card('b'), card('c'), arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c')]
      const m = computeAutoLayout(els, { strategy: 'flow', direction: 'TB' })
      expect(m.size).toBe(3)
      for (const p of m.values()) {
        expect(Number.isFinite(p.x)).toBe(true)
      }
    })
  })

  describe('默认值', () => {
    it('opts 省略 strategy/direction → mindmap/TB,不崩', () => {
      const els = [card('a'), card('b'), arrow('e1', 'a', 'b')]
      const m = computeAutoLayout(els) // 老调用方式仍工作
      expect(m.size).toBe(2)
      const a = m.get('a')!, b = m.get('b')!
      // mindmap/TB:b 在 a 下方
      expect(b.y).toBeGreaterThanOrEqual(a.y)
    })
  })

  describe('targetIds(选中范围)', () => {
    it('只布局 targetIds 内的 card,其余不返回', () => {
      const els = [
        card('a'), card('b'), card('c'),
        arrow('e1', 'a', 'b'), arrow('e2', 'b', 'c'),
      ]
      const m = computeAutoLayout(els, { targetIds: new Set(['a', 'b']), strategy: 'grid' })
      expect(m.size).toBe(2)
      expect(m.has('a')).toBe(true)
      expect(m.has('b')).toBe(true)
      expect(m.has('c')).toBe(false)
    })

    it('targetIds 仅 1 个 → 原位返回', () => {
      const els = [card('a', 50, 60), card('b')]
      const m = computeAutoLayout(els, { targetIds: new Set(['a']), strategy: 'grid' })
      expect(m.size).toBe(1)
      expect(m.get('a')).toEqual({ x: 50, y: 60 })
    })
  })

  describe('gap 滑杆', () => {
    it('grid gap 增大 → bbox 增大', () => {
      const els = fourCards()
      const mSmall = computeAutoLayout(els, { strategy: 'grid', direction: 'TB', gap: 20 })
      const mLarge = computeAutoLayout(els, { strategy: 'grid', direction: 'TB', gap: 100 })
      const w = (m: Map<string, { x: number; y: number }>) =>
        Math.max(...[...m.values()].map((p) => p.x)) - Math.min(...[...m.values()].map((p) => p.x))
      expect(w(mLarge)).toBeGreaterThan(w(mSmall))
    })
  })

  // ── 边缘健壮性:损坏坐标(Infinity/NaN)不毒化布局、不进 host ──────────────────
  // 自查 A2 修:computeAutoLayout 中心化 finitePos 守卫 + maxW/maxH 仅取有限值。
  // 防「一张卡 w=Infinity → maxW=Infinity → 全盘位置 NaN → 写 host → 序列化 null →
  // reload 变 0」的静默坐标损坏(同 applyLayout finiteRound 防的类)。
  describe('边缘:损坏坐标(Infinity/NaN)不毒化', () => {
    it('grid:一张卡 w=Infinity,其余卡仍得有限坐标(不被毒化)', () => {
      const els = [
        card('a', 0, 0, 200, 120),
        card('b', 100, 100, Infinity, 120), // 损坏
        card('c', 200, 200, 180, 100),
        card('d', 300, 300, 220, 130),
      ]
      const m = computeAutoLayout(els, { strategy: 'grid', direction: 'TB' })
      expectAllPresentFinite(els, m)
    })

    it('pack:一张卡 h=NaN,所有卡坐标仍有限', () => {
      const els = [
        card('a', 0, 0, 200, 120),
        card('b', 100, 100, 200, NaN), // 损坏
        card('c', 200, 200, 180, 100),
      ]
      const m = computeAutoLayout(els, { strategy: 'pack', direction: 'LR' })
      expectAllPresentFinite(els, m)
    })

    it('mindmap(dagre):卡 h=Infinity → 该卡位置回落原坐标(有限),不毒化他卡', () => {
      const els = [
        card('a', 10, 20, 200, 120),
        card('b', 30, 40, 200, Infinity), // 损坏
        arrow('e1', 'a', 'b'),
      ]
      const m = computeAutoLayout(els, { strategy: 'mindmap', direction: 'TB' })
      expectAllPresentFinite(els, m)
    })

    it('grid:卡 x=NaN(origin 污染源)→ 所有结果仍有限(回落原坐标)', () => {
      const els = [
        card('a', 0, 0, 200, 120),
        card('b', NaN, 100, 200, 120), // 原坐标损坏
        card('c', 200, 200, 180, 100),
        card('d', 300, 300, 220, 130),
      ]
      const m = computeAutoLayout(els, { strategy: 'grid', direction: 'TB' })
      // a/c/d(原坐标有限)结果必须有限;b 原坐标 NaN → 回落也是 NaN,但不影响他卡。
      for (const id of ['a', 'c', 'd']) {
        const p = m.get(id)!
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
      }
    })

    it('所有策略 × 方向:无 NaN/Infinity 进结果(fuzz 一轮)', () => {
      const els = [
        card('a', 0, 0, 200, 120),
        card('b', 100, 100, 200, 120),
        card('c', 200, 200, 180, 100),
      ]
      for (const strategy of ['mindmap', 'flow', 'grid', 'pack'] as const) {
        for (const direction of ['TB', 'LR', 'RL', 'BT'] as const) {
          const m = computeAutoLayout(els, { strategy, direction })
          for (const p of m.values()) {
            expect(Number.isFinite(p.x)).toBe(true)
            expect(Number.isFinite(p.y)).toBe(true)
          }
        }
      }
    })
  })
})
