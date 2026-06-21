import type { Card } from '../types'

// ── Normalisation ────────────────────────────────────────────────────────────

/** Normalise text: lowercase, collapse whitespace, strip control characters. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokenise a normalised string into whitespace-separated words. */
export function tokenise(s: string): string[] {
  return s ? s.split(' ') : []
}

/**
 * Full-text search across cards (v0.22.5-search restore / P11 v0.36.0).
 * Pure function, zero-dependency. Searches title/body/links/code/quotes/tags.
 * Returns cards matching ALL query tokens (AND).
 *
 * Scoring (v0.36.0):
 * - Title match → score += 1.5 per token
 * - Body / other field match → score += 1.0 per token
 * - Results sorted by score desc, then capturedAt desc (stable).
 *
 * Pinning: callers add their own "pinned-first" partition after search.
 */
export interface SearchResult {
  card: Card
  score: number
  /** The "best" field containing a match, for snippet extraction. */
  matchedField: 'title' | 'body' | 'tags' | 'link' | 'code' | 'quote'
}

export function searchCards(
  cards: Card[],
  query: string,
): SearchResult[] {
  const q = query.trim()
  if (!q) {
    return cards
      .filter((c) => !c.deletedAt)
      .map((card) => ({ card, score: 0, matchedField: 'title' as const }))
      .sort((a, b) => +b.card.capturedAt - +a.card.capturedAt)
  }

  const tokens = tokenise(normalise(q))
  if (tokens.length === 0) return []

  const scored: SearchResult[] = []

  for (const card of cards) {
    if (card.deletedAt) continue
    let score = 0
    let matchedField: SearchResult['matchedField'] = 'body'

    const haystack = buildSearchable(card)

    for (const token of tokens) {
      // Title: +1.5 per token
      if (haystack.title.includes(token)) {
        score += 1.5
        if (matchedField === 'body') matchedField = 'title'
      }
      // Body: +1.0 per token
      if (haystack.body.includes(token)) {
        score += 1.0
      }
      // Tags: +1.0 per token
      if (haystack.tags.includes(token)) {
        score += 1.0
        if (matchedField === 'body') matchedField = 'tags'
      }
      // Links / code / quotes: +1.0 per token
      if (haystack.links.includes(token)) {
        score += 1.0
        if (matchedField === 'body') matchedField = 'link'
      }
      if (haystack.code.includes(token)) {
        score += 1.0
        if (matchedField === 'body') matchedField = 'code'
      }
      if (haystack.quotes.includes(token)) {
        score += 1.0
        if (matchedField === 'body') matchedField = 'quote'
      }
    }

    // At least one token must match, otherwise the card is excluded.
    if (score > 0) {
      scored.push({ card, score, matchedField })
    }
  }

  // Sort by score desc, then capturedAt desc (stable).
  scored.sort((a, b) => {
    const s = b.score - a.score
    if (s !== 0) return s
    return +b.card.capturedAt - +a.card.capturedAt
  })

  return scored
}

interface Searchable {
  title: string
  body: string
  tags: string
  links: string
  code: string
  quotes: string
}

function buildSearchable(card: Card): Searchable {
  return {
    title: normalise(card.title),
    body: normalise(card.body),
    tags: normalise(card.tags.map((t) => t.value).join(' ')),
    links: normalise(card.links.map((l) => l.url).join(' ')),
    code: normalise(card.codeSnippets.map((s) => s.code).join(' ')),
    quotes: normalise(card.quotes.map((q) => q.text).join(' ')),
  }
}

/**
 * Extract a highlighted snippet from the card body, centred on the
 * first matching token. Max 200 chars; ellipsis on both ends if truncated.
 */
export function bodySnippet(card: Card, query: string): string | null {
  const tokens = tokenise(normalise(query))
  if (tokens.length === 0) return null
  const body = normalise(card.body)
  if (!body) return null

  // Find first matching token position
  let bestIdx = -1
  for (const token of tokens) {
    const idx = body.indexOf(token)
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx
    }
  }
  if (bestIdx === -1) return null

  const maxLen = 200
  const start = Math.max(0, bestIdx - 40)
  const end = Math.min(body.length, start + maxLen)
  let snippet = body.slice(start, end)

  if (start > 0) snippet = '…' + snippet
  if (end < body.length) snippet = snippet + '…'

  return snippet
}
