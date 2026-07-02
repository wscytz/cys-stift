import { describe, it, expect } from 'vitest'
import {
  DSL_VERSION,
  DSL_KINDS,
  DSL_COLORS,
  DSL_COLOR_ALIASES,
  DSL_GRAMMAR_REFERENCE,
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
