import { describe, it, expect } from 'vitest'
import { parseDslWithDiagnostics, parseDslStrictWithDiagnostics } from '../dsl-parser'
import { DSL_MAX_OPS } from '../dsl-grammar'

/**
 * DSL_MAX_OPS — parse 层 DoS 防御:单块 DSL 的元素总数上限。
 *
 * 防「粘贴炸弹」/恶意超大输入:无上限时无限行 → 无限 op → sanitize 全扫 + apply 全
 * upsert + solveRelational O(N³) 碰撞避让,主线程卡死。本测试锁定截断契约。
 */
function cards(n: number): string {
  const lines: string[] = []
  for (let i = 0; i < n; i += 1) lines.push(`[card #c${i}] @pos(${i},${i})`)
  return lines.join('\n')
}

describe('DSL_MAX_OPS — parse 层 op 总数上限(DoS 防御)', () => {
  it('graceful: 低于上限照常 parse 全部,无截断 diagnostic', () => {
    const { ops, errors } = parseDslWithDiagnostics(cards(50))
    expect(ops).toHaveLength(50)
    expect(errors.some((e) => e.message.includes('上限'))).toBe(false)
  })

  it('graceful: 恰好等于上限不截断(边界,>= 判定)', () => {
    const { ops, errors } = parseDslWithDiagnostics(cards(DSL_MAX_OPS))
    expect(ops).toHaveLength(DSL_MAX_OPS)
    expect(errors.some((e) => e.message.includes('上限'))).toBe(false)
  })

  it('graceful: 超过上限 → ops 截断到 DSL_MAX_OPS,产"已达上限"diagnostic', () => {
    const { ops, errors } = parseDslWithDiagnostics(cards(DSL_MAX_OPS + 5))
    expect(ops).toHaveLength(DSL_MAX_OPS)
    const cap = errors.find((e) => e.message.includes('上限'))
    expect(cap, '应有截断 diagnostic').toBeDefined()
  })

  it('strict: 超过上限同样截断到 DSL_MAX_OPS + diagnostic', () => {
    const { ops, errors } = parseDslStrictWithDiagnostics(cards(DSL_MAX_OPS + 3))
    expect(ops).toHaveLength(DSL_MAX_OPS)
    expect(errors.some((e) => e.message.includes('上限'))).toBe(true)
  })
})
