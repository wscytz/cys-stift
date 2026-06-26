import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pure-function extraction: we test the routing decision in isolation.
// handleAILayout itself lives inside the page component and touches many
// hooks, so we extract + export the decision helper and test THAT.
import { shouldShowAiSetupForLayout } from '../ai-layout-gate'

describe('shouldShowAiSetupForLayout', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns true when getCurrentAI() yields null', () => {
    expect(shouldShowAiSetupForLayout(null)).toBe(true)
  })
  it('returns true when AI is configured but not ready (disabled / no key)', () => {
    expect(
      shouldShowAiSetupForLayout({ provider: 'openai', enabled: false, apiKey: '', baseUrl: 'x', model: 'y' } as never),
    ).toBe(true)
  })
  it('returns false when AI is ready', () => {
    expect(
      shouldShowAiSetupForLayout({ provider: 'openai', enabled: true, apiKey: 'sk', baseUrl: 'x', model: 'y' } as never),
    ).toBe(false)
  })
})
