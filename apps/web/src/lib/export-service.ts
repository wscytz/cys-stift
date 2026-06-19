'use client'

import type { Card } from '@cys-stift/domain'

// ── Export (spec §1.2 信念4 "数据可迁移") ──────────────────────────────────
// Serialise the user's local data to an open JSON format. The browser
// stores we read from:
//   - cys-stift.cards.v1     (db-client, Phase 2)
//   - cys-stift.media.v1     (media-store, Phase 6.5f)
//   - cys-stift.drafts.v1    (draft-store, Phase 6.5a) — optional
//   - cys-stift.settings.v1  (settings-store, Phase 6.5h) — optional
//
// Format is versioned (`version: 1`). A future import path or schema
// migration bumps the version. We deliberately keep this plain JSON so
// any tool can read it — no proprietary encoding.

export const EXPORT_FORMAT_VERSION = 1

export interface ExportPayload {
  version: typeof EXPORT_FORMAT_VERSION
  exportedAt: string // ISO
  app: string
  cards: Card[]
  mediaAssets: Record<string, unknown> // MediaAssetData map (Phase 6.5f)
  drafts?: Record<string, unknown>
  settings?: Record<string, unknown>
}

function readJson(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Build the export payload from current browser storage. Pure function —
 * does not trigger a download; call `downloadExport()` for that.
 */
export function buildExportPayload(): ExportPayload {
  const cardsPayload = readJson('cys-stift.cards.v1') as { cards?: Card[] } | null
  const mediaPayload = readJson('cys-stift.media.v1') as {
    assets?: Record<string, unknown>
  } | null
  const draftsPayload = readJson('cys-stift.drafts.v1') as {
    drafts?: Record<string, unknown>
  } | null
  const settingsPayload = readJson('cys-stift.settings.v1') as {
    settings?: Record<string, unknown>
  } | null

  return {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "cy's Stift",
    cards: cardsPayload?.cards ?? [],
    mediaAssets: mediaPayload?.assets ?? {},
    drafts: draftsPayload?.drafts,
    settings: settingsPayload?.settings,
  }
}

/**
 * Serialise the payload and trigger a browser download. Returns the
 * approximate byte size so the caller can show a hint.
 */
export function downloadExport(): number {
  if (typeof window === 'undefined') return 0
  const payload = buildExportPayload()
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-')
  a.download = `cys-stift-export-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return blob.size
}
