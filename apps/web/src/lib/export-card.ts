'use client'

/**
 * M2.5 — single-card markdown downloader. Builds the .md via serializeCard
 * and triggers a cross-platform download (Blob+a.click on desktop, Tauri SAF
 * save on Android) via downloadFile. Filename derives from card.title
 * (sanitized); falls back to "card" when title is empty.
 */
import type { Card } from '@cys-stift/domain'
import { serializeCard } from './serialize-card'
import { downloadFile } from './download'

export async function downloadCardMarkdown(card: Card): Promise<number> {
  if (typeof window === 'undefined') return 0
  const md = serializeCard(card)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const safeName = (card.title || 'card').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80)
  // 走 downloadFile(分平台:桌面 Blob+a.click / Android Tauri SAF save),
  // 解决 Android WebView 不处理 Blob download 的静默失败。
  await downloadFile(`${safeName}.md`, blob)
  return blob.size
}