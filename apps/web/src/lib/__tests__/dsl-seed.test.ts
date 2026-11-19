import { describe, it, expect } from 'vitest'
import { readDslSeed, removeSearchParam, DSL_SEED_MAX_CHARS } from '../dsl-seed'

describe('readDslSeed — ?dsl= URL 参数读取(?dsl 外部 AI/分享入口)', () => {
  it('正常取值:带 urlencoded DSL 的 query 返回解码文本', () => {
    const search = '?dsl=%5Bcard%20%23a%20create%5D%20%40pos(0%2C0)'
    expect(readDslSeed(search)).toEqual({ ok: true, text: '[card #a create] @pos(0,0)' })
  })

  it('无参数 / 空值 / 纯空白 → null(不打开对话框)', () => {
    expect(readDslSeed('')).toBeNull()
    expect(readDslSeed('?other=1')).toBeNull()
    expect(readDslSeed('?dsl=')).toBeNull()
    expect(readDslSeed('?dsl=%20%20')).toBeNull()
  })

  it('trim 首尾空白;畸形 query 不抛错', () => {
    expect(readDslSeed('?dsl=%20%5Btext%20%23t%5D%20')).toEqual({ ok: true, text: '[text #t]' })
    expect(readDslSeed('?dsl=%E4%B8%AD%E6%96%87')).toEqual({ ok: true, text: '中文' })
    // URLSearchParams 对裸括号/中文容错;真正畸形输入也不得抛
    expect(readDslSeed('?dsl=%ZZ')).not.toBeNull()
  })

  it('超长拒绝而非截断(半截 DSL 可能语法/语义变形)', () => {
    const big = 'x'.repeat(DSL_SEED_MAX_CHARS + 500)
    const out = readDslSeed(`?dsl=${encodeURIComponent(big)}`)
    expect(out).toEqual({
      ok: false,
      reason: 'too-long',
      length: DSL_SEED_MAX_CHARS + 500,
      max: DSL_SEED_MAX_CHARS,
    })
    // 边界:恰好上限仍接受
    expect(readDslSeed(`?dsl=${encodeURIComponent('x'.repeat(DSL_SEED_MAX_CHARS))}`)).toEqual({
      ok: true,
      text: 'x'.repeat(DSL_SEED_MAX_CHARS),
    })
  })

  it('多参数共存:只取 dsl;同名多值取首个', () => {
    expect(readDslSeed('?foo=1&dsl=%5Ba%5D&bar=2')).toEqual({ ok: true, text: '[a]' })
    expect(readDslSeed('?dsl=%5Ba%5D&dsl=%5Bb%5D')).toEqual({ ok: true, text: '[a]' })
  })
})

describe('removeSearchParam — 一次性入口只摘自己,保留组合字段', () => {
  it('只移除 dsl,card/其他字段与顺序保留', () => {
    expect(removeSearchParam('?card=c1&dsl=%5Ba%5D&q=hi', 'dsl')).toBe('?card=c1&q=hi')
    expect(removeSearchParam('?dsl=%5Ba%5D&card=c1', 'dsl')).toBe('?card=c1')
    expect(removeSearchParam('?card=c1&dsl=%5Ba%5D', 'dsl')).toBe('?card=c1')
  })

  it('同名多值全部移除;移除后无参数返回空串', () => {
    expect(removeSearchParam('?dsl=%5Ba%5D&dsl=%5Bb%5D&x=1', 'dsl')).toBe('?x=1')
    expect(removeSearchParam('?dsl=%5Ba%5D', 'dsl')).toBe('')
    expect(removeSearchParam('', 'dsl')).toBe('')
  })

  it('无该参数时原样返回(调用方据此跳过 replaceState)', () => {
    expect(removeSearchParam('?a=1&b=2', 'dsl')).toBe('?a=1&b=2')
    // 编码风格不被无关重写
    expect(removeSearchParam('?a=x%20y', 'dsl')).toBe('?a=x%20y')
  })

  it('只摘指定名字,不误伤前缀相近的参数', () => {
    expect(removeSearchParam('?dslx=1&card=2&dsl=3', 'dsl')).toBe('?dslx=1&card=2')
    expect(removeSearchParam('?card=1&dsl=2', 'card')).toBe('?dsl=2')
  })
})
