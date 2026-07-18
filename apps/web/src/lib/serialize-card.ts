'use client'

/**
 * M2.5 — single-card markdown serializer. Produces a self-contained .md
 * file: frontmatter (id, type, source, capturedAt, links, tags), body
 * (raw markdown), then structured-field sections (media with base64
 * thumbnails, links as bullet list, code blocks fenced, quotes as
 * blockquotes). No external assets — the .md is portable.
 */
import type { Card } from '@cys-stift/domain'
import { mediaStore } from '@/lib/media-store'
import { isSafeImageDataUrl } from './safe-href'

export interface SerializeOptions {
  /** Inline image data URLs as ![](data:…) — true by default, can disable
   *  for size (e.g. when exporting a card with multiple high-res images). */
  inlineImages?: boolean
  /** Max bytes per inline image (default 200KB compressed-equivalent). */
  maxInlineImageBytes?: number
}

export function serializeCard(card: Card, opts: SerializeOptions = {}): string {
  const { inlineImages = true, maxInlineImageBytes = 200_000 } = opts
  const lines: string[] = []

  // Frontmatter
  lines.push('---')
  lines.push(`id: ${card.id}`)
  lines.push(`type: ${card.type}`)
  lines.push(`title: ${JSON.stringify(card.title)}`)
  lines.push(`capturedAt: ${card.capturedAt.toISOString()}`)
  lines.push(`source: ${card.source.kind}`)
  if (card.pinned) lines.push('pinned: true')
  if (card.color) lines.push(`color: ${card.color}`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${card.title || '(无标题)'}`)
  lines.push('')
  if (card.body) {
    lines.push(card.body)
    lines.push('')
  }

  // Media section — only emit when at least one ref resolves to an asset.
  // Otherwise an orphan-ref card (e.g. cleaned storage export) would produce
  // a misleading empty `## 媒体` heading with no content. Collect first,
  // skip missing assets, then decide.
  if ((card.media ?? []).length > 0) {
    const resolved: { ref: Card['media'][number]; asset: NonNullable<ReturnType<typeof mediaStore.getAsset>> }[] = []
    for (const ref of card.media ?? []) {
      const asset = mediaStore.getAsset(ref.assetId)
      if (!asset) continue
      resolved.push({ ref, asset })
    }
    if (resolved.length > 0) {
      lines.push('## 媒体')
      for (const { ref, asset } of resolved) {
        if (
          asset.kind === 'image' &&
          inlineImages &&
          asset.byteSize <= maxInlineImageBytes &&
          isSafeImageDataUrl(asset.dataUrl, maxInlineImageBytes)
        ) {
          lines.push(`![${ref.caption ?? asset.mimeType}](${asset.dataUrl})`)
        } else {
          lines.push(
            `- (${asset.mimeType}, ${asset.byteSize} bytes): ${ref.caption ?? ''}`,
          )
        }
      }
      lines.push('')
    }
  }

  // Links
  if ((card.links ?? []).length > 0) {
    lines.push('## 链接')
    for (const l of card.links ?? []) {
      lines.push(
        `- [${l.title || l.url}](${l.url})${l.description ? ` — ${l.description}` : ''}`,
      )
    }
    lines.push('')
  }

  // Code snippets
  if ((card.codeSnippets ?? []).length > 0) {
    lines.push('## 代码')
    for (const s of card.codeSnippets ?? []) {
      lines.push('```' + (s.language || ''))
      lines.push(s.code)
      lines.push('```')
      if (s.caption) lines.push(`*${s.caption}*`)
      lines.push('')
    }
  }

  // Quotes
  if ((card.quotes ?? []).length > 0) {
    lines.push('## 引用')
    for (const q of card.quotes ?? []) {
      lines.push(`> ${q.text.replace(/\n/g, '\n> ')}`)
      if (q.attribution) lines.push(`> — ${q.attribution}`)
      if (q.sourceUrl) lines.push(`> (${q.sourceUrl})`)
      lines.push('')
    }
  }

  return lines.join('\n')
}
