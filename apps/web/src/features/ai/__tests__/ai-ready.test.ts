import { describe, it, expect } from 'vitest'
import { getDefaultProviderDefaults } from '../providers'
import { isAIReady } from '../ai-settings-provider'
import type { AIConfig } from '../types'

describe('getDefaultProviderDefaults — new fields', () => {
  it.each(['openai', 'anthropic', 'ollama'] as const)(
    '%s exposes description + accent (accent never green)',
    (p) => {
      const d = getDefaultProviderDefaults(p)
      expect(typeof d.description).toBe('string')
      expect(d.description.length).toBeGreaterThan(0)
      expect(['black', 'blue', 'yellow']).toContain(d.accent)
    },
  )
  it('ollama is marked needsKey=false (zero-cost path)', () => {
    expect(getDefaultProviderDefaults('ollama').needsKey).toBe(false)
  })
})

describe('isAIReady', () => {
  const base: AIConfig = {
    provider: 'openai',
    apiKey: 'sk-x',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    enabled: true,
  }
  it('null → false', () => {
    expect(isAIReady(null)).toBe(false)
  })
  it('disabled → false', () => {
    expect(isAIReady({ ...base, enabled: false })).toBe(false)
  })
  it('empty baseUrl → false', () => {
    expect(isAIReady({ ...base, baseUrl: '' })).toBe(false)
  })
  it('openai (needsKey) with empty key → false', () => {
    expect(isAIReady({ ...base, apiKey: '' })).toBe(false)
  })
  it('openai with key + enabled → true', () => {
    expect(isAIReady(base)).toBe(true)
  })
  it('ollama (no key needed) with empty key but enabled + baseUrl → true', () => {
    const ollama: AIConfig = {
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      enabled: true,
    }
    expect(isAIReady(ollama)).toBe(true)
  })
})
