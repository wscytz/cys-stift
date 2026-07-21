import { describe, it, expect } from 'vitest'
import {
  DSL_VERSION,
  DSL_KINDS,
  DSL_COLORS,
  DSL_COLOR_ALIASES,
  DSL_GRAMMAR_REFERENCE,
  truncateDslText,
} from '../dsl-grammar'

describe('dsl-grammar', () => {
  it('DSL_VERSION is a positive integer (grammar version, independent of app version)', () => {
    expect(Number.isInteger(DSL_VERSION)).toBe(true)
    expect(DSL_VERSION).toBeGreaterThan(0)
  })

  it('DSL_KINDS is the 6 canonical directive kinds', () => {
    expect([...DSL_KINDS]).toEqual(['card', 'rect', 'frame', 'text', 'arrow', 'freedraw'])
  })

  it('DSL_COLORS is the 6 Bauhaus tokens', () => {
    expect([...DSL_COLORS]).toEqual(['red', 'yellow', 'blue', 'black', 'white', 'gray'])
  })

  it('DSL_COLOR_ALIASES maps grey → gray', () => {
    expect(DSL_COLOR_ALIASES.grey).toBe('gray')
  })

  it('DSL_GRAMMAR_REFERENCE embeds the version line', () => {
    expect(DSL_GRAMMAR_REFERENCE).toContain(`cys-dsl grammar v${DSL_VERSION}`)
  })

  it('DSL_GRAMMAR_REFERENCE mentions every AI-producible kind (excl freedraw)', () => {
    for (const kind of DSL_KINDS) {
      if (kind === 'freedraw') continue // freedraw 故意不进 AI 面向 REFERENCE
      expect(DSL_GRAMMAR_REFERENCE).toContain(`[${kind} #id]`)
    }
  })

  it('DSL_GRAMMAR_REFERENCE lists all canonical colors + the grey alias', () => {
    for (const c of DSL_COLORS) expect(DSL_GRAMMAR_REFERENCE).toContain(c)
    expect(DSL_GRAMMAR_REFERENCE).toContain('grey')
  })

  it('DSL_GRAMMAR_REFERENCE does NOT advertise freedraw (AI should not emit hand-draw)', () => {
    expect(DSL_GRAMMAR_REFERENCE).not.toContain('[freedraw')
  })
})

describe('truncateDslText (代理对安全截断;parser/sanitize 单一实现 — G/H)', () => {
  it('不超长 → 原样返回', () => {
    expect(truncateDslText('hello', 10)).toBe('hello')
    expect(truncateDslText('', 10)).toBe('')
  })

  it('超长 → 截到 max', () => {
    expect(truncateDslText('abcdef', 3)).toBe('abc')
  })

  it('切点落在 emoji 代理对中间 → 回退一位,不产孤立高代理位', () => {
    const max = 10
    const s = 'a'.repeat(max - 1) + '😀' // 9 个 a + 2 码元 emoji = 11 码元
    const out = truncateDslText(s, max)
    expect(out).toBe('a'.repeat(max - 1)) // 丢整个 emoji,而非切出半个
    const last = out.charCodeAt(out.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false) // 末位非孤立高代理
  })

  it('emoji 完整落在 max 内 → 保留不丢', () => {
    expect(truncateDslText('ab😀cd', 4)).toBe('ab😀')
  })

  it('max=0 → 空串(不越界)', () => {
    expect(truncateDslText('abc', 0)).toBe('')
  })
})
