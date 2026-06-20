import type { Card } from '../types'

/**
 * Full-text search across cards (v0.22.5-search restore).
 * Pure function, zero-dependency. Searches title/body/links/code/quotes.
 * Returns cards matching ALL query tokens (AND), excluding soft-deleted,
 * sorted by capturedAt descending.
 *
 * Decision: keep search in domain (not web) so it's testable without
 * a browser and reusable across Tauri/OPFS paths later.
 */
export function searchCards(
  cards: Card[],
  query: string,
): Card[] {
  const q = query.trim()
  if (!q) return cards.filter((c) => !c.deletedAt)

  // Normalise: lowercase, collapse whitespace -> tokenise
  const tokens = q
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')

  return cards
    .filter((c) => {
      if (c.deletedAt) return false
      const haystack = buildSearchableText(c)
      return tokens.every((token) => haystack.includes(token))
    })
    .sort((a, b) => +b.capturedAt - +a.capturedAt)
}

function buildSearchableText(card: Card): string {
  const parts: string[] = [
    card.title,
    card.body,
    ...card.links.map((l) => l.url),
    ...card.codeSnippets.map((s) => s.code),
    ...card.quotes.map((q) => q.text),
  ]
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}
