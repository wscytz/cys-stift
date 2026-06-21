'use client'

/**
 * M2.5 — single-card markdown downloader. Builds the .md via serializeCard
 * and triggers a browser download via Blob + <a download>. Filename derives
 * from card.title (sanitized); falls back to "card" when title is empty.
 */
import type { Card } from '@cys-stift/domain'
import { serializeCard } from './serialize-card'

export function downloadCardMarkdown(card: Card): number {
  if (typeof window === 'undefined') return 0
  const md = serializeCard(card)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeName = (card.title || 'card').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80)
  a.download = `${safeName}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return blob.size
}