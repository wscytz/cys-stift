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
import { settingsStore } from '@/lib/settings-store'

export interface RunAIOptions {
  targetLang?: 'zh' | 'en'
  /** Output locale for summarize/improveWriting (defaults to 'en'). */
  locale?: 'zh' | 'en'
  /** Free-form editing instruction for editWithInstruction. */
  instruction?: string
  onDelta?: (chunk: string) => void
  signal?: AbortSignal
}

/** Per-action sampling defaults. summarize/translate want stability; rewrite
 *  wants creativity. The user's cfg.temperature/maxTokens override these. */
const ACTION_DEFAULTS: Record<AIAction, { temperature: number; maxTokens: number }> = {
  summarize: { temperature: 0.3, maxTokens: 1024 },
  improveWriting: { temperature: 0.7, maxTokens: 1024 },
  translate: { temperature: 0.3, maxTokens: 1024 },
  editWithInstruction: { temperature: 0.5, maxTokens: 2048 },
}

export async function runAIAction(
  cfg: AIConfig,
  action: AIAction,
  card: Card,
  opts: RunAIOptions = {},
): Promise<{ content: string }> {
  const template = PROMPTS[action]
  const locale = opts.locale ?? currentLocale()
  let user = template.buildUser(card, locale)
  if (action === 'translate') {
    const lang = opts.targetLang ?? 'en'
    user = user.replace('{{LANG}}', lang === 'zh' ? '中文' : 'English')
  }
  if (action === 'editWithInstruction') {
    user = user.replace('{{INSTRUCTION}}', opts.instruction ?? '')
  }
  const def = ACTION_DEFAULTS[action]
  return streamText(
    cfg,
    {
      system: template.system,
      user,
      temperature: cfg.temperature ?? def.temperature,
      maxTokens: cfg.maxTokens ?? def.maxTokens,
    },
    opts.onDelta ?? (() => {}),
    opts.signal,
  )
}

/** Best-effort synchronous locale read for the default. useI18n() can't run
 *  outside a component, so we fall back to the settings-store value, then 'en'. */
function currentLocale(): 'zh' | 'en' {
  try {
    return settingsStore.get().locale
  } catch {
    return 'en'
  }
}