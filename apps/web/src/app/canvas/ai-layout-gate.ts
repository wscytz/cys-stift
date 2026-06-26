/**
 * Pure decision helper for the canvas AI-layout entry (plan Task 6).
 * Returns true when the user should see the AiSetupCard guide instead of
 * attempting an AI layout. Kept separate from the page component so it can
 * be unit-tested without mounting the heavy canvas page.
 */
import { isAIReady } from '@/features/ai/ai-settings-provider'
import type { AIConfig } from '@/features/ai/types'

export function shouldShowAiSetupForLayout(cfg: AIConfig | null): boolean {
  return !isAIReady(cfg)
}
