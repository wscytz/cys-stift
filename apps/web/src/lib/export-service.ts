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

// ── Import (Phase 9.1) ─────────────────────────────────────────────────────
// Reverse of export: validate a JSON string and write it back to the
// browser stores. Merge strategy is OVERWRITE (the exported snapshot
// becomes the source of truth). Callers should prompt the user to
// export first as a backup.

export interface ImportResult {
  ok: boolean
  cards: number
  mediaAssets: number
  error?: string
}

export function importFromJson(jsonText: string): ImportResult {
  if (typeof window === 'undefined') {
    return { ok: false, cards: 0, mediaAssets: 0, error: 'not in browser' }
  }
  let payload: ExportPayload
  try {
    payload = JSON.parse(jsonText) as ExportPayload
  } catch (e) {
    return {
      ok: false,
      cards: 0,
      mediaAssets: 0,
      error: `invalid JSON: ${(e as Error).message}`,
    }
  }
  if (payload.version !== EXPORT_FORMAT_VERSION) {
    return {
      ok: false,
      cards: 0,
      mediaAssets: 0,
      error: `unsupported version ${payload.version} (expected ${EXPORT_FORMAT_VERSION})`,
    }
  }
  if (!Array.isArray(payload.cards)) {
    return {
      ok: false,
      cards: 0,
      mediaAssets: 0,
      error: 'payload.cards is not an array',
    }
  }
  // v0.23.2-hardening: per-card structural validation. A malformed card
  // (missing id, missing createdAt, non-string title) would corrupt the
  // DB schema on the next read. Reject the whole import — better than
  // silently importing half-good data the user can't tell is broken.
  for (let i = 0; i < payload.cards.length; i++) {
    const c = payload.cards[i]
    if (!c || typeof c !== 'object') {
      return {
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: `cards[${i}] is not an object`,
      }
    }
    const card = c as unknown as Record<string, unknown>
    if (typeof card.id !== 'string' || card.id.length === 0) {
      return {
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: `cards[${i}].id missing or not a string`,
      }
    }
    if (typeof card.title !== 'string') {
      return {
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: `cards[${i}].title must be a string`,
      }
    }
    if (typeof card.body !== 'string') {
      return {
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: `cards[${i}].body must be a string`,
      }
    }
    if (
      card.createdAt !== undefined &&
      typeof card.createdAt !== 'string' &&
      !(card.createdAt instanceof Date)
    ) {
      return {
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: `cards[${i}].createdAt must be a string ISO date`,
      }
    }
    if (
      card.updatedAt !== undefined &&
      typeof card.updatedAt !== 'string' &&
      !(card.updatedAt instanceof Date)
    ) {
      return {
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: `cards[${i}].updatedAt must be a string ISO date`,
      }
    }
  }
  // Overwrite the four stores atomically. Missing optional keys are
  // skipped. We (1) serialise everything first — a serialise error must
  // abort before any store is touched; (2) snapshot each key's old raw
  // value; (3) write them; (4) on any write error (e.g. quota on a big
  // base64 media blob), roll back every touched key to its pre-import
  // value so the user never ends up in a half-overwritten state.
  const writes: { key: string; value: string }[] = []
  try {
    writes.push({
      key: 'cys-stift.cards.v1',
      value: JSON.stringify({ cards: payload.cards }),
    })
    if (payload.mediaAssets && typeof payload.mediaAssets === 'object') {
      writes.push({
        key: 'cys-stift.media.v1',
        value: JSON.stringify({ assets: payload.mediaAssets }),
      })
    }
    if (payload.drafts) {
      writes.push({
        key: 'cys-stift.drafts.v1',
        value: JSON.stringify({ drafts: payload.drafts }),
      })
    }
    if (payload.settings) {
      writes.push({
        key: 'cys-stift.settings.v1',
        value: JSON.stringify({ settings: payload.settings }),
      })
    }
  } catch (e) {
    return {
      ok: false,
      cards: 0,
      mediaAssets: 0,
      error: `serialise failed: ${(e as Error).message}`,
    }
  }

  // Snapshot old values now, before any write mutates storage.
  const snapshot = writes.map((w) => ({
    key: w.key,
    prev: window.localStorage.getItem(w.key),
  }))

  try {
    for (const w of writes) window.localStorage.setItem(w.key, w.value)
  } catch (e) {
    // Roll back every key we touched to its pre-import value. A null
    // prev means the key didn't exist before — remove it.
    for (const s of snapshot) {
      try {
        if (s.prev === null) window.localStorage.removeItem(s.key)
        else window.localStorage.setItem(s.key, s.prev)
      } catch {
        // Best-effort rollback; the original write error is what we
        // report. Restoring smaller previous values rarely throws.
      }
    }
    return {
      ok: false,
      cards: 0,
      mediaAssets: 0,
      error: `write failed: ${(e as Error).message}`,
    }
  }

  return {
    ok: true,
    cards: payload.cards.length,
    mediaAssets: Object.keys(payload.mediaAssets ?? {}).length,
  }
}
