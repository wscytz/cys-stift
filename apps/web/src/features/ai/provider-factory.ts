'use client'

/**
 * M3.3 — Maker-based AI provider factory. Mirrors AFFiNE's
 * CopilotProviderFactory.register/get/list, but stores `AIProviderMaker`
 * closures instead of provider instances.
 *
 * Why makers, not instances? Each OpenAI/Anthropic provider bakes the API
 * key into its closure (fetch needs the Authorization header). If we stored
 * a single shared instance, switching configs would leak the old key to the
 * new one. Makers re-create the provider per create(cfg) call — fresh closure,
 * no cross-config leak.
 */

import type { AIConfig, AIProvider, AIProviderMaker, ProviderId } from './types'

class AIProviderFactory {
  private makers = new Map<ProviderId, AIProviderMaker>()

  register(id: ProviderId, maker: AIProviderMaker): void {
    this.makers.set(id, maker)
  }

  unregister(id: ProviderId): void {
    this.makers.delete(id)
  }

  list(): readonly ProviderId[] {
    return [...this.makers.keys()]
  }

  /** Create a provider instance bound to the given config. Returns null
   *  if no maker is registered for the provider id, or if the maker
   *  itself rejected the config (e.g. apiKey missing for a key-needing
   *  provider). */
  create(cfg: AIConfig): AIProvider | null {
    const maker = this.makers.get(cfg.provider)
    return maker ? maker(cfg) : null
  }
}

export const aiProviderFactory = new AIProviderFactory()