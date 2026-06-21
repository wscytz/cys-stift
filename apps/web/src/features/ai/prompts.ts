'use client'

/**
 * M3.4 — AI action prompt templates. Pure functions that build the user-side
 * prompt from a Card; the system prompt is a static string per action. No
 * AI-side magic — we tell the model exactly what shape we want, then
 * stream-accumulate the response into the card body.
 *
 * `improveWriting` is the user-facing label "Rewrite" — kept under the
 * `improveWriting` internal name so future variants (tone-shift / shorten /
 * expand) can fork off the same action namespace without UI churn.
 */

import type { Card } from '@cys-stift/domain'

export type AIAction = 'summarize' | 'improveWriting' | 'translate'

export interface PromptTemplate {
  system: string
  buildUser: (card: Card) => string
}

export const PROMPTS: Record<AIAction, PromptTemplate> = {
  summarize: {
    system:
      'You are a concise summarizer. Produce a 1-3 sentence summary preserving key facts. Output plain text only — no markdown, no preamble.',
    buildUser: (card) =>
      `Title: ${card.title}\n\nBody:\n${card.body || '(empty)'}`,
  },
  improveWriting: {
    system:
      'You are a writing coach. Improve clarity, flow, and conciseness while preserving meaning. Output the improved body only — no preamble, no "Here is the improved version:".',
    buildUser: (card) =>
      `Title: ${card.title}\n\nBody:\n${card.body || '(empty)'}`,
  },
  translate: {
    system:
      'You are a translator. Translate the body to the target language, preserving markdown formatting. Output only the translated body.',
    // The {{LANG}} placeholder is replaced at runtime by ai-actions.ts
    buildUser: (card) =>
      `Target: {{LANG}}\n\n---\n\n${card.body || '(empty)'}`,
  },
}