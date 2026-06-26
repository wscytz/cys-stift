'use client'

/**
 * M3.3 — Default provider registration. Idempotent: repeated calls are a
 * no-op. The first call (typically from ai-actions.ts or testConnection.ts
 * inside a user-triggered action) wires up the 3 supported providers.
 *
 * `getDefaultProviderDefaults` exposes the safe defaults for each provider
 * so the /settings panel can populate the baseUrl/model placeholders.
 */

import { aiProviderFactory } from '../provider-factory'
import { createOpenAIProvider } from './openai'
import { createAnthropicProvider } from './anthropic'
import { createOllamaProvider } from './ollama'
import type { AIConfig, ProviderId } from '../types'

export function registerDefaultProviders(): void {
  if (aiProviderFactory.list().length > 0) return
  aiProviderFactory.register('openai', (cfg: AIConfig) =>
    cfg.provider === 'openai'
      ? createOpenAIProvider({
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        })
      : null,
  )
  aiProviderFactory.register('anthropic', (cfg: AIConfig) =>
    cfg.provider === 'anthropic'
      ? createAnthropicProvider({
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        })
      : null,
  )
  aiProviderFactory.register('ollama', (cfg: AIConfig) =>
    cfg.provider === 'ollama'
      ? createOllamaProvider({ baseUrl: cfg.baseUrl, model: cfg.model })
      : null,
  )
}

export interface ProviderDefaults {
  baseUrl: string
  model: string
  needsKey: boolean
  displayName: string
  /** One-line human description shown on the provider card. */
  description: string
  /** Bauhaus accent dot color. green is forbidden — only black/blue/yellow. */
  accent: 'black' | 'blue' | 'yellow'
}

export function getDefaultProviderDefaults(provider: ProviderId): ProviderDefaults {
  switch (provider) {
    case 'openai':
      return {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        needsKey: true,
        displayName: 'OpenAI',
        description: 'Hosted GPT-4o family. Needs an API key (paid).',
        accent: 'black',
      }
    case 'anthropic':
      return {
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-haiku-4-5',
        needsKey: true,
        displayName: 'Anthropic',
        description: 'Hosted Claude family. Needs an API key (paid).',
        accent: 'blue',
      }
    case 'ollama':
      return {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.2:3b',
        needsKey: false,
        displayName: 'Ollama (local)',
        description: 'Runs fully on your machine. Free, private, no API key.',
        accent: 'yellow',
      }
  }
}