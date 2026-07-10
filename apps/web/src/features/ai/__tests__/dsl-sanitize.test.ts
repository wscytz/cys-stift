import { describe, expect, it } from 'vitest'
import type { CardId } from '@cys-stift/domain'
import type { DslOp } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'

/**
 * DSL sanitize 层测试(case 6: 非法 size 修正)。
 *
 * 契约:
 * - card/rect/frame 的 w/h:非正(≤0)/非有限 → undefined(apply 用默认);超大 → MAX(2000)
 * - 合法正数(含小卡 10×10)原样保留(保 roundtrip byte-equal,dsl-e2e-roundtrip.test.ts)
 * - free arrow 的 w/h 不动(负值编码方向,dsl-parser.ts:143)
 * - 永不抛错;纯函数,合法 op 引用稳定
 */
describe('sanitizeDslOps — case 6: 非法 size 修正', () => {
  it('card w/h = 0 → undefined(apply 用默认 240×120)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, w: 0, h: 0, create: true }
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { w?: number }).w).toBeUndefined()
    expect((ops[0] as { h?: number }).h).toBeUndefined()
  })

  it('card w/h 负值 → undefined', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, w: -10, h: -5, create: true }
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { w?: number }).w).toBeUndefined()
    expect((ops[0] as { h?: number }).h).toBeUndefined()
  })

  it('card w/h 超大(5000) → 钳到 MAX(2000)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, w: 5000, h: 3000, create: true }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ w: 2000, h: 2000 })
  })

  it('card 合法小卡 w/h(10×10) → 原样保留(保 roundtrip byte-equal)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, w: 10, h: 10, create: true }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ w: 10, h: 10 })
  })

  it('card 合法 w/h(100×80) → 不动', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, w: 100, h: 80, create: true }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ w: 100, h: 80 })
  })

  it('card w/h undefined → 保持 undefined', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, create: true }
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { w?: number }).w).toBeUndefined()
  })

  it('card NaN/Infinity w/h → undefined', () => {
    const op = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, w: NaN, h: Infinity, create: true } as unknown as DslOp
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { w?: number }).w).toBeUndefined()
    expect((ops[0] as { h?: number }).h).toBeUndefined()
  })

  it('rect free shape w/h = 0 → undefined', () => {
    const op: DslOp = { type: 'free', shape: 'rect', x: 0, y: 0, w: 0, h: 0 }
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { w?: number }).w).toBeUndefined()
    expect((ops[0] as { h?: number }).h).toBeUndefined()
  })

  it('frame free shape w/h 超大 → 钳到 2000', () => {
    const op: DslOp = { type: 'free', shape: 'frame', x: 0, y: 0, w: 9999, h: 9999, text: '' }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ w: 2000, h: 2000 })
  })

  it('text free shape 合法(100×40) → 不动', () => {
    const op: DslOp = { type: 'free', shape: 'text', x: 0, y: 0, w: 100, h: 40, text: 'hi' }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ w: 100, h: 40 })
  })

  it('free shape 合法小卡(8×8) → 保留', () => {
    const op: DslOp = { type: 'free', shape: 'rect', x: 0, y: 0, w: 8, h: 8 }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ w: 8, h: 8 })
  })

  it('free shape w/h undefined → 保持 undefined', () => {
    const op: DslOp = { type: 'free', shape: 'rect', x: 0, y: 0 }
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { w?: number }).w).toBeUndefined()
  })

  it('arrow free arrow w/h 负值(编码方向) → 不动', () => {
    const op: DslOp = { type: 'arrow', from: '', to: '', freeArrow: true, x: 0, y: 0, w: -50, h: 30 }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ w: -50, h: 30 })
  })

  it('arrow 关系箭头(无 w/h) → 不动', () => {
    const op: DslOp = { type: 'arrow', from: 'a', to: 'b' }
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { w?: number }).w).toBeUndefined()
  })

  it('空 ops → 返回空 ops + 空 diagnostics', () => {
    const { ops, diagnostics } = sanitizeDslOps([])
    expect(ops).toEqual([])
    expect(diagnostics).toEqual([])
  })

  it('多 op 混合:各按类型处理', () => {
    const ops: DslOp[] = [
      { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, w: 0, h: 0, create: true },
      { type: 'free', shape: 'rect', x: 0, y: 0, w: 100, h: 100 },
      { type: 'arrow', from: '', to: '', freeArrow: true, w: -10, h: 20 },
    ]
    const { ops: out } = sanitizeDslOps(ops)
    expect((out[0] as { w?: number }).w).toBeUndefined()
    expect(out[1]).toMatchObject({ w: 100, h: 100 })
    expect(out[2]).toMatchObject({ w: -10, h: 20 })
  })

  it('合法 op 引用稳定(同一对象,不复制)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, w: 100, h: 80, create: true }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toBe(op)
  })

  it('不抛错契约:未知 type 的 op → 原样保留', () => {
    const garbage = { type: 'unknown', w: 0, h: 0 } as unknown as DslOp
    expect(() => sanitizeDslOps([garbage])).not.toThrow()
    const { ops } = sanitizeDslOps([garbage])
    expect(ops[0]).toBe(garbage)
  })
})

describe('sanitizeDslOps — case 1+11: card 引用不存在 id → diagnostic', () => {
  it('card 无 create flag + id 不在 existingCardIds → diagnostic(提示加 create)', () => {
    const op: DslOp = { type: 'card', cardId: 'ghost' as CardId, x: 0, y: 0 }
    const { ops, diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.opIndex).toBe(0)
    expect(diagnostics[0]!.message).toMatch(/ghost/)
    // op 原样保留(sanitize 不删,apply 自己 skip)
    expect(ops[0]).toBe(op)
  })

  it('card id 在 existingCardIds → 无 diagnostic(正常 update)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 }
    const { diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(['c1']), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(0)
  })

  it('card 有 create flag + id 不存在 → 无 diagnostic(正常 create)', () => {
    const op: DslOp = { type: 'card', cardId: 'new1' as CardId, x: 0, y: 0, create: true }
    const { diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(0)
  })

  it('无 ctx 时不 diagnostic(case 6 等不依赖 ctx 的路径)', () => {
    const op: DslOp = { type: 'card', cardId: 'ghost' as CardId, x: 0, y: 0 }
    const { diagnostics } = sanitizeDslOps([op])
    expect(diagnostics).toHaveLength(0)
  })
})

describe('sanitizeDslOps — case 7: arrow 端点不存在 → diagnostic', () => {
  it('relation arrow from 不在 existingCardIds → diagnostic', () => {
    const op: DslOp = { type: 'arrow', from: 'ghost', to: 'c2' }
    const { ops, diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(['c2']), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.opIndex).toBe(0)
    expect(diagnostics[0]!.message).toMatch(/ghost/)
    expect(ops[0]).toBe(op) // op 保留(apply 自己 skip)
  })

  it('relation arrow to 不存在 → diagnostic', () => {
    const op: DslOp = { type: 'arrow', from: 'c1', to: 'ghost' }
    const { diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(['c1']), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(1)
  })

  it('relation arrow 两端都在 → 无 diagnostic', () => {
    const op: DslOp = { type: 'arrow', from: 'c1', to: 'c2' }
    const { diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(['c1', 'c2']), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(0)
  })

  it('free arrow(无 from/to) → 无 diagnostic(无需端点)', () => {
    const op: DslOp = { type: 'arrow', from: '', to: '', freeArrow: true, x: 0, y: 0, w: 10, h: 10 }
    const { diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(0)
  })
})

describe('sanitizeDslOps — case 3: 跨 kind 告警(free op id 命中 host 已有不同 kind → diagnostic)', () => {
  it('rect op id 在 existingFreeKinds 但是 text → diagnostic(将新建而非更新)', () => {
    const op: DslOp = { type: 'free', shape: 'rect', id: 'r1', x: 0, y: 0, w: 100, h: 100 }
    const ctx = { existingFreeKinds: new Map([['r1', 'text' as const]]) }
    const { ops, diagnostics } = sanitizeDslOps([op], ctx)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.opIndex).toBe(0)
    expect(diagnostics[0]!.message).toMatch(/r1/)
    // op 原样保留(sanitize 不改,apply create 路径自己 mint uid 避免覆盖)
    expect(ops[0]).toBe(op)
  })

  it('rect op id 在 existingFreeKinds 同 kind(rect) → 无 diagnostic(正常 update)', () => {
    const op: DslOp = { type: 'free', shape: 'rect', id: 'r1', x: 0, y: 0, w: 100, h: 100 }
    const ctx = { existingFreeKinds: new Map([['r1', 'rect' as const]]) }
    const { diagnostics } = sanitizeDslOps([op], ctx)
    expect(diagnostics).toHaveLength(0)
  })

  it('无 ctx → 无 diagnostic(case 6 等不依赖 ctx 的路径仍可用)', () => {
    const op: DslOp = { type: 'free', shape: 'rect', id: 'r1', x: 0, y: 0, w: 100, h: 100 }
    const { diagnostics } = sanitizeDslOps([op])
    expect(diagnostics).toHaveLength(0)
  })

  it('free op 无 id → 无 diagnostic(无 id 可查)', () => {
    const op: DslOp = { type: 'free', shape: 'rect', x: 0, y: 0, w: 100, h: 100 }
    const ctx = { existingFreeKinds: new Map([['r1', 'text' as const]]) }
    const { diagnostics } = sanitizeDslOps([op], ctx)
    expect(diagnostics).toHaveLength(0)
  })

  it('op.id 不在 existingFreeKinds → 无 diagnostic(新 id,apply 用 op.id)', () => {
    const op: DslOp = { type: 'free', shape: 'rect', id: 'fresh', x: 0, y: 0, w: 100, h: 100 }
    const ctx = { existingFreeKinds: new Map([['r1', 'text' as const]]) }
    const { diagnostics } = sanitizeDslOps([op], ctx)
    expect(diagnostics).toHaveLength(0)
  })
})

describe('sanitizeDslOps — case 2b: create id 冲突预检 diagnostic', () => {
  it('card create + cardId 已在 existingCardIds → diagnostic(id 冲突预检,apply 前提示)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 0, y: 0, create: true }
    const { ops, diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(['c1']), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]!.message).toMatch(/c1/)
    expect(ops[0]).toBe(op) // op 保留(apply 自己处理,case 2a 计数兜底)
  })

  it('card create + cardId 不在 existingCardIds → 无 diagnostic(正常 create)', () => {
    const op: DslOp = { type: 'card', cardId: 'new1' as CardId, x: 0, y: 0, create: true }
    const { diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(0)
  })

  it('card 无 create + id 已存在 → 无 diagnostic(正常 update,不是冲突)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 }
    const { diagnostics } = sanitizeDslOps([op], { existingCardIds: new Set(['c1']), existingFreeIds: new Set() })
    expect(diagnostics).toHaveLength(0)
  })
})

describe('sanitizeDslOps — case 5: 越界坐标钳位 [-10000, 10000](保负向)', () => {
  it('card x/y 超大(1e6) → 钳到 10000', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 999999, y: 888888, create: true }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ x: 10000, y: 10000 })
  })

  it('card x/y 超大负值(-1e6) → 钳到 -10000(保负向,不破负坐标契约)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: -999999, y: -888888, create: true }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ x: -10000, y: -10000 })
  })

  it('card 合理负坐标(-100) → 保留(不钳)', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: -100, y: -50, create: true }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ x: -100, y: -50 })
  })

  it('card 合法坐标(500) → 不动', () => {
    const op: DslOp = { type: 'card', cardId: 'c1' as CardId, x: 500, y: 300, create: true }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ x: 500, y: 300 })
  })

  it('free shape x/y 超大 → 钳', () => {
    const op: DslOp = { type: 'free', shape: 'rect', x: 99999, y: 99999, w: 100, h: 100 }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ x: 10000, y: 10000 })
  })

  it('free arrow x/y 超大 → 钳位置(但 w/h 不动)', () => {
    const op: DslOp = { type: 'arrow', from: '', to: '', freeArrow: true, x: 99999, y: 99999, w: -50, h: 30 }
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toMatchObject({ x: 10000, y: 10000, w: -50, h: 30 })
  })

  it('关系箭头(无 x/y) → 不动', () => {
    const op: DslOp = { type: 'arrow', from: 'a', to: 'b' }
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { x?: number }).x).toBeUndefined()
  })

  it('free arrow curve 控制点超大(9.9e6) → 钳到 10000(与 x/y 同 case-5,防跑出可视区)', () => {
    const op: DslOp = {
      type: 'arrow', from: '', to: '', freeArrow: true,
      curve: { cx: 9999999, cy: -9999999 },
    } as DslOp
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { curve?: { cx: number; cy: number } }).curve).toEqual({ cx: 10000, cy: -10000 })
  })

  it('free arrow curve 合理(500,-100) → 原样保留(引用稳定,保 roundtrip)', () => {
    const op: DslOp = {
      type: 'arrow', from: '', to: '', freeArrow: true,
      curve: { cx: 500, cy: -100 },
    } as DslOp
    const { ops } = sanitizeDslOps([op])
    // 合法值未变 → 返回原对象引用(byte-equal roundtrip)
    expect(ops[0]).toBe(op)
    expect((ops[0] as { curve?: { cx: number; cy: number } }).curve).toEqual({ cx: 500, cy: -100 })
  })

  it('free arrow elbow 折点超大 → 逐点钳(页坐标同 case-5)', () => {
    const op: DslOp = {
      type: 'arrow', from: '', to: '', freeArrow: true,
      elbow: [{ x: 9999999, y: 100 }, { x: -50, y: 9999999 }],
    } as DslOp
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { elbow?: { x: number; y: number }[] }).elbow).toEqual([
      { x: 10000, y: 100 },
      { x: -50, y: 10000 },
    ])
  })

  it('free arrow curve 非有限(NaN) → 钳到 0(永不抛错 + 不残留 NaN 进 host)', () => {
    const op: DslOp = {
      type: 'arrow', from: '', to: '', freeArrow: true,
      curve: { cx: NaN, cy: 500 },
    } as DslOp
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { curve?: { cx: number; cy: number } }).curve).toEqual({ cx: 0, cy: 500 })
  })
})

describe('sanitizeDslOps — 永不抛错契约(非数组入参)', () => {
  it('null ops → 返回空 ops(不抛 TypeError,契约要求纯函数永不抛)', () => {
    const result = sanitizeDslOps(null as unknown as DslOp[])
    expect(result.ops).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('undefined ops → 返回空 ops(不抛)', () => {
    const result = sanitizeDslOps(undefined as unknown as DslOp[])
    expect(result.ops).toEqual([])
  })
})
