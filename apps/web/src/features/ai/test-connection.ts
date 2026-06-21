'use client'

/**
 * M3.2 — test-connection helper. UI button calls this with the current
 * draft config; provider's `testConnection` returns a structured result
 * for the toast. Ollama's check additionally validates the model name is
 * installed (so the user gets a clear "run ollama pull <model>" hint).
 */

import { aiProviderFactory } from './provider-factory'
import { registerDefaultProviders } from './providers'
import type { AIConfig } from './types'

export interface TestConnectionResult {
  ok: boolean
  latencyMs?: number
  error?: string
}

export async function testConnection(
  cfg: AIConfig,
  signal?: AbortSignal,
): Promise<TestConnectionResult> {
  registerDefaultProviders()
  const provider = aiProviderFactory.create(cfg)
  if (!provider) return { ok: false, error: 'Unknown provider' }
  return provider.testConnection(signal)
}