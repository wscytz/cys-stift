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
