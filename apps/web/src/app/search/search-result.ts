import type { Card } from '@cys-stift/domain'
import { bodySnippet } from '@cys-stift/domain'
import { markdownPreview } from '@/features/card/markdown-preview'

/** Search excerpt over reader-visible Markdown text, preserving source case. */
export function readableBodySnippet(card: Pick<Card, 'body'>, query: string): string | null {
  const readableBody = markdownPreview(card.body, Number.POSITIVE_INFINITY)
  return bodySnippet({ body: readableBody }, query)
}
