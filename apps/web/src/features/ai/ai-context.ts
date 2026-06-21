'use client'

/**
 * AI Context — explicit allowlist of what Card fields AI can see (P6 v0.33.1).
 *
 * Design (v0.30.0): manual allowlist, NOT automated codegen. Every field AI
 * can access is listed explicitly here. New Card fields added to
 * `packages/domain/src/types.ts` MUST be manually registered or AI won't see
 * them — the safe default is "invisible to AI."
 *
 * ## Privacy invariants (from privacy-design.md)
 *
 * - `source.deviceId` — NEVER in allowlist
 * - `media[].dataUrl` — NEVER (only metadata: count, kind)
 * - `deletedAt` — soft-deleted cards return '' (invisible)
 * - `apiKey` — NEVER in prompts
 * - Binary data (>1KB) — only metadata sent
 *
 * ## When you add a new Card field
 *
 * 1. Decide: should AI see this? (value to user? sensitive? large?)
 * 2. Add an entry to AI_CARD_FIELDS (or add it to AI_REDACTED_FIELDS docs)
 * 3. Add a reverse-assertion test in __tests__/ai-context.test.ts
 * 4. Update docs/user/privacy.md field table
 */

import type { Card } from '@cys-stift/domain'

// ── Field definitions ────────────────────────────────────────────────────────

type FieldKind = 'text' | 'list' | 'enum' | 'date' | 'count'

interface FieldDef {
  kind: FieldKind
  include: (card: Card) => unknown
}

/**
 * SINGLE SOURCE OF TRUTH for what AI sees about a card.
 *
 * Every field is listed explicitly. Fields NOT listed here are invisible to AI
 * (the safe default). When you add a new field to Card, decide here.
 */
export const AI_CARD_FIELDS: Record<string, FieldDef> = {
  // ── Core text content ──
  title: { kind: 'text', include: (c) => c.title },
  body: { kind: 'text', include: (c) => c.body },

  // ── Card type ──
  type: { kind: 'enum', include: (c) => c.type },

  // ── Timestamps ──
  capturedAt: { kind: 'date', include: (c) => c.capturedAt?.toISOString().slice(0, 10) },

  // ── Visual hints ──
  color: { kind: 'enum', include: (c) => c.color },
  pinned: { kind: 'enum', include: (c) => c.pinned ? 'yes' : undefined },

  // ── Position ──
  canvasId: { kind: 'enum', include: (c) => c.canvasPosition?.canvasId },

  // ── Tags (P4 v0.32.0) ──
  tags: { kind: 'list', include: (c) => (c.tags?.length ? c.tags.map((t: { value: string }) => t.value) : undefined) },

  // ── Structured attachments (metadata / summary only) ──
  links: {
    kind: 'list',
    include: (c) => (c.links?.length ? c.links.map((l) => l.title || l.url) : undefined),
  },
  code: {
    kind: 'list',
    include: (c) =>
      c.codeSnippets?.length
        ? c.codeSnippets.map((s: { language: string; code: string }) => `[${s.language}] ${s.code}`)
        : undefined,
  },
  quotes: {
    kind: 'list',
    include: (c) =>
      c.quotes?.length
        ? c.quotes.map((q: { text: string; attribution?: string }) => `${q.text}${q.attribution ? ' — ' + q.attribution : ''}`)
        : undefined,
  },

  // ── Media (metadata only — NEVER binary) ──
  mediaCount: { kind: 'count', include: (c) => c.media?.length ?? 0 },
  mediaKinds: {
    kind: 'list',
    include: (c: Card) => (c.media?.length ? c.media.map((m) => (m as unknown as { kind?: string }).kind || 'unknown') : undefined),
  },

  // ── Capture source (metadata only — NO deviceId) ──
  sourceKind: { kind: 'enum', include: (c) => c.source?.kind },
}

/**
 * Fields explicitly NOT sent to AI. Serves as documentation and negative-test
 * reference. The tests in __tests__/ai-context.test.ts assert these are absent
 * from serialized output.
 */
export const AI_REDACTED_FIELDS = [
  'source.deviceId',    // per-device tracking id
  'media[].assetId',    // opaque id, not useful to AI
  'media[].dataUrl',    // image/pdf binary — NEVER sent
  'deletedAt',          // soft-deleted cards not in AI scope
  'apiKey',             // settings — NEVER in prompts
] as const

// ── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize a single card into structured text for the AI `user` prompt.
 * Returns '' (empty string) if the card is soft-deleted or has no visible
 * fields — the caller skips empty output.
 */
export function serializeCardForAI(card: Card): string {
  // Soft-deleted cards are invisible to AI.
  if (card.deletedAt) return ''

  const lines: string[] = []
  for (const [name, def] of Object.entries(AI_CARD_FIELDS)) {
    const value = def.include(card)
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    // Coerce to string — numbers/booleans are fine; the field kind
    // is documentation, not enforced at runtime.
    lines.push(`${name}: ${Array.isArray(value) ? (value as unknown[]).join(', ') : String(value)}`)
  }

  return lines.join('\n')
}

/**
 * Serialize multiple cards for multi-card prompts (DSL layout, auto-relate).
 * Each card gets a `[card #id]` header for DSL reference.
 */
export function serializeCardsForAI(cards: Card[]): string {
  return cards
    .filter((c) => !c.deletedAt)
    .map((c) => `[card #${String(c.id)}]\n${serializeCardForAI(c)}`)
    .join('\n\n')
}
