import { describe, expect, it } from 'vitest'
import { evalCompute, formatComputeNumber, type ComputeResolver } from '../dsl-compute'

/** 测试几何池:a=10×20@(0,0), b=30×40@(5,5)。 */
const geom: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 0, y: 0, w: 10, h: 20 },
  b: { x: 5, y: 5, w: 30, h: 40 },
}
const resolve: ComputeResolver = (id) => geom[id]

describe('evalCompute — 安全公式求值(禁裸 eval,只读几何)', () => {
  it('四则运算 + 优先级', () => {
    expect(evalCompute('2 + 3 * 4', resolve)).toBe(14)
    expect(evalCompute('(2 + 3) * 4', resolve)).toBe(20)
    expect(evalCompute('10 - 4 / 2', resolve)).toBe(8)
  })

  it('一元负号', () => {
    expect(evalCompute('-5 + 10', resolve)).toBe(5)
    expect(evalCompute('-(2 + 3)', resolve)).toBe(-5)
  })

  it('浮点 + 小数', () => {
    expect(evalCompute('1.5 * 2', resolve)).toBe(3)
    expect(evalCompute('.5 + .5', resolve)).toBe(1)
  })

  it('几何引用 #id.field', () => {
    expect(evalCompute('#a.w', resolve)).toBe(10)
    expect(evalCompute('#a.w + #b.w', resolve)).toBe(40)
    expect(evalCompute('#b.x + #b.y', resolve)).toBe(10)
    expect(evalCompute('#a.h * 2 - #b.h', resolve)).toBe(0)
  })

  it('带连字符 id 的引用(#card-1.w)', () => {
    const r: ComputeResolver = (id) => (id === 'card-1' ? { x: 0, y: 0, w: 7, h: 7 } : undefined)
    expect(evalCompute('#card-1.w + 1', r)).toBe(8)
  })

  it('函数 min/max/abs/round', () => {
    expect(evalCompute('min(3, 1, 2)', resolve)).toBe(1)
    expect(evalCompute('max(#a.w, #b.w)', resolve)).toBe(30)
    expect(evalCompute('abs(-7)', resolve)).toBe(7)
    expect(evalCompute('round(2.6)', resolve)).toBe(3)
  })

  it('除零 → 0(安全,不产 Infinity)', () => {
    expect(evalCompute('5 / 0', resolve)).toBe(0)
    expect(evalCompute('10 / (2 - 2) + 1', resolve)).toBe(1)
  })

  it('未解析引用 → undefined(整式失败)', () => {
    expect(evalCompute('#nope.w + 1', resolve)).toBeUndefined()
  })

  it('非法字段 / 语法 / 字符 → undefined', () => {
    expect(evalCompute('#a.z', resolve)).toBeUndefined() // 坏字段
    expect(evalCompute('#a.w +', resolve)).toBeUndefined() // 残缺
    expect(evalCompute('2 +', resolve)).toBeUndefined()
    expect(evalCompute('(1 + 2', resolve)).toBeUndefined() // 缺右括号
    expect(evalCompute('foo(1)', resolve)).toBeUndefined() // 未知函数
    expect(evalCompute('alert(1)', resolve)).toBeUndefined() // 非白名单
    expect(evalCompute('#a.w; drop', resolve)).toBeUndefined() // 坏字符
    expect(evalCompute('', resolve)).toBeUndefined()
    expect(evalCompute('   ', resolve)).toBeUndefined()
  })

  it('abs/round 参数数错 → undefined', () => {
    expect(evalCompute('abs(1, 2)', resolve)).toBeUndefined()
    expect(evalCompute('round()', resolve)).toBeUndefined()
  })

  it('尾部残余 → undefined(语法错)', () => {
    expect(evalCompute('1 2', resolve)).toBeUndefined()
    expect(evalCompute('(1) 3', resolve)).toBeUndefined()
  })

  it('深层嵌套不炸(递归上限 → undefined 而非栈溢出)', () => {
    const deep = '('.repeat(100) + '1' + ')'.repeat(100)
    // 100 层 > MAX_DEPTH(64) → 求值失败 undefined(不抛)
    expect(evalCompute(deep, resolve)).toBeUndefined()
  })
})

describe('formatComputeNumber', () => {
  it('去浮点噪声 + 尾 0', () => {
    expect(formatComputeNumber(12)).toBe('12')
    expect(formatComputeNumber(12.0)).toBe('12')
    expect(formatComputeNumber(3.5)).toBe('3.5')
    expect(formatComputeNumber(3.50000001)).toBe('3.5')
    expect(formatComputeNumber(1 / 3)).toBe('0.33')
    expect(formatComputeNumber(0.1 + 0.2)).toBe('0.3')
  })
  it('非有限 → "0"', () => {
    expect(formatComputeNumber(Infinity)).toBe('0')
    expect(formatComputeNumber(NaN)).toBe('0')
  })
})
