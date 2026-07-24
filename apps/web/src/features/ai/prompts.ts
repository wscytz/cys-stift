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
 *
 * P6 (v0.33.1): prompts now use `serializeCardForAI` from ai-context.ts
 * instead of hand-concatenating `${card.title}\n${card.body}`. This ensures
 * the privacy allowlist is always applied — new Card fields WILL NOT appear
 * in prompts unless explicitly registered in AI_CARD_FIELDS.
 */

import type { Card } from '@cys-stift/domain'
import { serializeCardForAI } from './ai-context'

export type AIAction = 'summarize' | 'improveWriting' | 'translate' | 'editWithInstruction'

export interface PromptTemplate {
  system: string
  /** Build the user-side prompt. `locale` controls the OUTPUT language for
   *  summarize/improveWriting (translate already uses targetLang). */
  buildUser: (card: Card, locale: 'zh' | 'en') => string
}

/**
 * Privacy rule #3: soft-deleted cards are NEVER in the AI's view. The guard
 * makes buildUser return '' for a deleted card up front, so no prompt is
 * built. Body text always comes from `serializeCardForAI` (allowlist) — there
 * is NO raw title/body hand-concatenation fallback (P6 migration removed the
 * `ctx || fallback` so prompts can never bypass the allowlist). (See
 * prompts.test.ts "rule #3".)
 */
function hiddenFromAI(card: Card): boolean {
  return Boolean(card.deletedAt)
}

/** Map a locale to the output-language instruction appended to summarize/rewrite. */
function outputLangLine(locale: 'zh' | 'en'): string {
  return locale === 'zh' ? 'Write the output in 中文 (Chinese).' : 'Write the output in English.'
}

export const PROMPTS: Record<AIAction, PromptTemplate> = {
  summarize: {
    system:
      'You are a precise summarizer for a personal-notes app. Read the note and produce a 1-3 sentence summary that preserves the key facts and proper nouns. Output plain text only: no markdown, no headings, no list markers, no introductory label or lead-in — start directly with the summary itself.',
    buildUser: (card, locale) => {
      if (hiddenFromAI(card)) return ''
      const ctx = serializeCardForAI(card)
      const body = ctx
      return `${outputLangLine(locale)}\n\nSummarize this note.\n\n${body}`
    },
  },
  improveWriting: {
    system:
      'You are an expert writing editor for a personal-notes app. Improve clarity, flow, and conciseness while preserving the original meaning and the author\'s intent. Keep markdown formatting if present. Output the improved text only — no preamble, no explanations, no introductory lead-in.',
    buildUser: (card, locale) => {
      if (hiddenFromAI(card)) return ''
      const ctx = serializeCardForAI(card)
      const body = ctx
      return `${outputLangLine(locale)}\n\nRewrite the body of this note.\n\n${body}`
    },
  },
  translate: {
    system:
      'You are a careful translator for a personal-notes app. Translate the body to the target language, preserving markdown formatting, code blocks, and proper nouns appropriately. Output only the translated text — no preamble, no notes about the translation.',
    // The {{LANG}} placeholder is replaced at runtime by ai-actions.ts.
    buildUser: (card) => {
      if (hiddenFromAI(card)) return ''
      const ctx = serializeCardForAI(card)
      const body = ctx
      return `Target: {{LANG}}\n\n---\n\n${body}`
    },
  },
  editWithInstruction: {
    system:
      'You are a precise editing assistant for a personal-notes app. The user gives a free-form instruction describing how to modify the note body. Apply ONLY that instruction; preserve everything else (meaning, facts, structure, markdown formatting, code blocks, proper nouns) unless the instruction explicitly changes it. Output the full edited body only — no preamble, no explanations, no restating the instruction, no lead-in.',
    // The {{INSTRUCTION}} placeholder is replaced at runtime by ai-actions.ts
    // (mirrors translate's {{LANG}} injection).
    buildUser: (card, locale) => {
      if (hiddenFromAI(card)) return ''
      const ctx = serializeCardForAI(card)
      const body = ctx
      return `${outputLangLine(locale)}\n\nInstruction: {{INSTRUCTION}}\n\nApply the instruction to the body of this note and output the full result.\n\n${body}`
    },
  },
}