import { describe, it, expect } from 'vitest'
import { summarizeMovement, MOVE_THRESHOLD, type PositionMap } from '../layout-movement'

/**
 * summarizeMovement 纯函数单测(Fix 4c)。
 *
 * 验证 AI 排版诚实反馈的核心数学:把 before/after 位置映射对比,产出
 * moved/total/avgPx/maxPx。覆盖:全移、全没移、部分移、亚阈值抖动被忽略、
 * 数学正确、空输入。
 */

describe('summarizeMovement', () => {
  it('所有卡都移动 → moved === total,avg/max 正确', () => {
    const before: PositionMap = {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 100 },
    }
    const after: PositionMap = {
      a: { x: 0, y: 100 }, // 位移 100
      b: { x: 100, y: 200 }, // 位移 100
    }
    const s = summarizeMovement(before, after)
    expect(s.moved).toBe(2)
    expect(s.total).toBe(2)
    expect(s.avgPx).toBe(100)
    expect(s.maxPx).toBe(100)
  })

  it('所有卡都没动 → moved === 0,avg/max 回落 0,total 仍统计', () => {
    const before: PositionMap = { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } }
    const after: PositionMap = { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } }
    const s = summarizeMovement(before, after)
    expect(s.moved).toBe(0)
    expect(s.total).toBe(2)
    expect(s.avgPx).toBe(0)
    expect(s.maxPx).toBe(0)
  })

  it('部分移动 → moved 只算动过的,avg/max 只基于动过的', () => {
    const before: PositionMap = {
      a: { x: 0, y: 0 }, // 不动
      b: { x: 0, y: 0 }, // 移动到 (3,4) → 位移 5
      c: { x: 0, y: 0 }, // 移动到 (0, 13) → 位移 13
    }
    const after: PositionMap = {
      a: { x: 0, y: 0 },
      b: { x: 3, y: 4 },
      c: { x: 0, y: 13 },
    }
    const s = summarizeMovement(before, after)
    expect(s.moved).toBe(2)
    expect(s.total).toBe(3)
    // avg = (5 + 13) / 2 = 9
    expect(s.avgPx).toBe(9)
    expect(s.maxPx).toBe(13)
  })

  it('亚阈值抖动(<= MOVE_THRESHOLD)被忽略,不计 moved', () => {
    // MOVE_THRESHOLD = 1。位移 1.0(等于阈值,不 > 阈值)应被忽略。
    const before: PositionMap = { a: { x: 0, y: 0 } }
    const after: PositionMap = { a: { x: 1, y: 0 } }
    const s = summarizeMovement(before, after)
    expect(s.moved).toBe(0)
    expect(s.total).toBe(1)
    // 位移 0.5(< 阈值)也被忽略
    const s2 = summarizeMovement({ a: { x: 0, y: 0 } }, { a: { x: 0.5, y: 0 } })
    expect(s2.moved).toBe(0)
    // 位移刚超阈值(1.1)> 1 → 计入 moved
    const s3 = summarizeMovement({ a: { x: 0, y: 0 } }, { a: { x: 1.1, y: 0 } })
    expect(s3.moved).toBe(1)
  })

  it('MOVE_THRESHOLD === 1(常量契约:滤浮点噪声但捕捉任何肉眼可见重排)', () => {
    expect(MOVE_THRESHOLD).toBe(1)
  })

  it('欧氏距离(非曼哈顿):对角线移动算直线位移', () => {
    // (3,4) 直角位移 → 欧氏 5,曼哈顿 7。应取 5。
    const before: PositionMap = { a: { x: 0, y: 0 } }
    const after: PositionMap = { a: { x: 3, y: 4 } }
    const s = summarizeMovement(before, after)
    expect(s.moved).toBe(1)
    expect(s.avgPx).toBe(5)
    expect(s.maxPx).toBe(5)
  })

  it('avgPx/maxPx 四舍五入到整数', () => {
    // 位移 √2 ≈ 1.414 → round = 1
    const before: PositionMap = { a: { x: 0, y: 0 } }
    const after: PositionMap = { a: { x: 1, y: 1 } }
    const s = summarizeMovement(before, after)
    expect(s.avgPx).toBe(1)
    expect(s.maxPx).toBe(1)
  })

  it('只比较 before/after 交集(仅在 before 的卡忽略)', () => {
    const before: PositionMap = {
      a: { x: 0, y: 0 },
      ghost: { x: 0, y: 0 }, // before 有 after 无 → 忽略
    }
    const after: PositionMap = {
      a: { x: 50, y: 0 },
      extra: { x: 0, y: 0 }, // after 有 before 无 → 忽略
    }
    const s = summarizeMovement(before, after)
    expect(s.total).toBe(1)
    expect(s.moved).toBe(1)
  })

  it('空输入 → 全 0', () => {
    expect(summarizeMovement({}, {})).toEqual({
      moved: 0,
      total: 0,
      avgPx: 0,
      maxPx: 0,
    })
  })

  it('单侧空(after 为空)→ total 0,moved 0', () => {
    const before: PositionMap = { a: { x: 0, y: 0 } }
    expect(summarizeMovement(before, {})).toEqual({
      moved: 0,
      total: 0,
      avgPx: 0,
      maxPx: 0,
    })
  })
})
