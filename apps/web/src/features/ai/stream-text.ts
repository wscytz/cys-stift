'use client'

/**
 * M3.3 — Thin wrapper around `aiProviderFactory.create(cfg).streamText()`.
 * Ensures the default providers are registered before delegating. Callers
 * from AI popover / auto-relate use this single entry point so the
 * `registerDefaultProviders()` idempotency check is centralised.
 */

import { aiProviderFactory } from './provider-factory'
import { registerDefaultProviders } from './providers'
import type { AIConfig, AIRequest, AIResponse } from './types'

export async function streamText(
  cfg: AIConfig,
  req: AIRequest,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<AIResponse> {
  registerDefaultProviders()
  const provider = aiProviderFactory.create(cfg)
  if (!provider) throw new Error(`Provider "${cfg.provider}" not registered`)
  const effectiveReq: AIRequest = { ...req, model: req.model ?? cfg.model }
  return provider.streamText(effectiveReq, onDelta, signal)
}