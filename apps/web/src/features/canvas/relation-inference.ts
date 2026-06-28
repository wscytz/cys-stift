'use client'

/**
 * M2.3 — keyword-based relation type inference. Heuristic: scan the
 * source + target card contents for keyword hits per relation type,
 * return the highest-scoring one. No AI, no model — pure string match.
 *
 * Tie-break order: blocks > references > derived-from > related-to
 * (the order matters when no hits, or when all scores tie at 0 → null).
 *
 * Keywords are case-insensitive. Mixed zh/en — the keyword list mirrors
 * how the user describes a relationship in either language.
 */
import type { Card } from '@cys-stift/domain'
import { RELATION_TYPES, type RelationType } from './relation-types'

const KEYWORDS: Record<RelationType['id'], string[]> = {
  blocks: ['todo', '阻塞', '阻止', 'block', 'blocker', '等待', 'fixme', 'blocker'],
  references: ['引用', 'reference', 'ref', 'see also', '参见', '链接', 'link'],
  'derived-from': ['衍生', '派生', 'derived', 'based on', '出自从', '源自', 'from'],
  'related-to': ['相关', 'related', 'similar', '类似', '关联'],
  // embeds 由块引用 ((标题)) 物化产生,签名明确,不靠关键词推断(空词表 → 永不命中)。
  embeds: [],
}

export function inferRelationTypeFromContext(
  source: Card | null | undefined,
  target: Card | null | undefined,
): RelationType | null {
  if (!source && !target) return null
  const text = [
    source?.title ?? '',
    source?.body ?? '',
    target?.title ?? '',
    target?.body ?? '',
  ]
    .join('\n')
    .toLowerCase()
  let best: { type: RelationType; score: number } | null = null
  for (const rt of RELATION_TYPES) {
    const kws = KEYWORDS[rt.id]
    let score = 0
    for (const kw of kws) {
      if (text.includes(kw.toLowerCase())) score++
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { type: rt, score }
    }
  }
  return best?.type ?? null
}