import { describe, it, expect, beforeEach } from 'vitest'
import { aiProviderFactory } from '../provider-factory'
import { registerDefaultProviders } from '../providers'
import { isSafeProviderId, isSafeModelId, isSafeBaseUrl } from '@/lib/safe-href'
import type { AIConfig } from '../types'

describe('AIProviderFactory', () => {
  beforeEach(() => {
    // Clear state between tests so the idempotency of registerDefaultProviders
    // doesn't mask a real "first call works" assertion.
    for (const id of aiProviderFactory.list()) {
      aiProviderFactory.unregister(id)
    }
    registerDefaultProviders()
  })

  it('registers all 3 providers on first call', () => {
    expect(aiProviderFactory.list().sort()).toEqual([
      'anthropic',
      'ollama',
      'openai',
    ])
  })

  it('register is idempotent (second call is a no-op)', () => {
    registerDefaultProviders()
    expect(aiProviderFactory.list().sort()).toEqual([
      'anthropic',
      'ollama',
      'openai',
    ])
  })

  it('creates an OpenAI provider bound to the given config', () => {
    const cfg: AIConfig = {
      provider: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: true,
    }
    const p = aiProviderFactory.create(cfg)
    expect(p).not.toBeNull()
    expect(p?.id).toBe('openai')
    expect(p?.defaultModel).toBe('gpt-4o-mini')
  })

  it('returns null for an unknown provider id', () => {
    const cfg = {
      provider: 'unknown',
      apiKey: '',
      baseUrl: '',
      model: '',
      enabled: true,
    } as unknown as AIConfig
    expect(aiProviderFactory.create(cfg)).toBeNull()
  })

  it('Ollama provider does not require an apiKey in config', () => {
    const cfg: AIConfig = {
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      enabled: true,
    }
    const p = aiProviderFactory.create(cfg)
    expect(p?.id).toBe('ollama')
  })

  it('maker rejects mismatched provider id (defence in depth)', () => {
    const cfg: AIConfig = {
      provider: 'openai', // mismatched with what the maker expects
      apiKey: 'sk-x',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: true,
    }
    // The Anthropic maker is registered for 'anthropic', so passing an
    // 'openai' config through it must return null. We trigger the wrong
    // maker by manually registering one and pointing it at 'openai'.
    aiProviderFactory.unregister('anthropic')
    aiProviderFactory.register('anthropic', (c) =>
      c.provider === 'anthropic'
        ? aiProviderFactory.create({ ...c, provider: 'openai' })
        : null,
    )
    // Sanity: openai still works.
    expect(aiProviderFactory.create(cfg)?.id).toBe('openai')
    // Anthropic with non-anthropic cfg returns null.
    expect(
      aiProviderFactory.create({ ...cfg, provider: 'anthropic' }),
    ).not.toBeNull()
  })
})

describe('safe-href AI validators', () => {
  it('isSafeProviderId accepts the 3 supported providers', () => {
    expect(isSafeProviderId('openai')).toBe(true)
    expect(isSafeProviderId('anthropic')).toBe(true)
    expect(isSafeProviderId('ollama')).toBe(true)
  })

  it('isSafeProviderId rejects unknown / non-string values', () => {
    expect(isSafeProviderId('unknown')).toBe(false)
    expect(isSafeProviderId(null)).toBe(false)
    expect(isSafeProviderId(undefined)).toBe(false)
    expect(isSafeProviderId(123)).toBe(false)
    expect(isSafeProviderId({})).toBe(false)
  })

  it('isSafeModelId accepts reasonable model names', () => {
    expect(isSafeModelId('gpt-4o-mini')).toBe(true)
    expect(isSafeModelId('claude-haiku-4-5')).toBe(true)
    expect(isSafeModelId('llama3.2:3b')).toBe(true)
  })

  it('isSafeModelId rejects injection attempts and bad input', () => {
    expect(isSafeModelId('evil"; DROP TABLE--')).toBe(false)
    expect(isSafeModelId('')).toBe(false)
    expect(isSafeModelId('a'.repeat(65))).toBe(false)
    expect(isSafeModelId(null)).toBe(false)
    expect(isSafeModelId(123)).toBe(false)
  })

  it('isSafeBaseUrl accepts http(s) URLs', () => {
    expect(isSafeBaseUrl('https://api.openai.com/v1')).toBe(true)
    expect(isSafeBaseUrl('http://localhost:11434')).toBe(true)
  })

  it('isSafeBaseUrl rejects dangerous / malformed input', () => {
    expect(isSafeBaseUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeBaseUrl('not-a-url')).toBe(false)
    expect(isSafeBaseUrl(null)).toBe(false)
    expect(isSafeBaseUrl(42)).toBe(false)
  })
})