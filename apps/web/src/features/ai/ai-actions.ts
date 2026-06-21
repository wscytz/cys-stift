'use client'

/**
 * M3.4 — High-level AI action runner. Composes a prompt from a card, runs
 * the configured provider, returns the accumulated content. The popover
 * subscribes to deltas via `onDelta` for streaming UI.
 *
 * `translate` is the only action with extra config — the target language.
 * Other actions ignore `targetLang`.
 */

import type { Card } from '@cys-stift/domain'
import { streamText } from './stream-text'
import { PROMPTS, type AIAction } from './prompts'
import type { AIConfig } from './types'

export interface RunAIOptions {
  targetLang?: 'zh' | 'en'
  onDelta?: (chunk: string) => void
  signal?: AbortSignal
}

export async function runAIAction(
  cfg: AIConfig,
  action: AIAction,
  card: Card,
  opts: RunAIOptions = {},
): Promise<{ content: string }> {
  const template = PROMPTS[action]
  let user = template.buildUser(card)
  if (action === 'translate') {
    const lang = opts.targetLang ?? 'en'
    user = user.replace('{{LANG}}', lang === 'zh' ? '中文' : 'English')
  }
  return streamText(
    cfg,
    {
      system: template.system,
      user,
      maxTokens: 1024,
      temperature: 0.5,
    },
    opts.onDelta ?? (() => {}),
    opts.signal,
  )
}