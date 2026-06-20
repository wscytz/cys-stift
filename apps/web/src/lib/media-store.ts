'use client'

import type { MediaAssetId, MediaRef } from '@cys-stift/domain'

// ── Media storage (spec §4.5) ──────────────────────────────────────────────
// MVP uses base64 data URLs in localStorage. This is intentionally a
// placeholder: spec §4.5 calls for OPFS on Web, Tauri fs on Desktop. Both
// are bigger infrastructure pieces (Phase 2.5 / Phase 8). For now we
// support small images (<500KB recommended; we accept larger but warn)
// so the rest of the feature work — file input, MediaRef attachment,
// display in card detail — can land without blocking on storage.

const STORAGE_KEY = 'cys-stift.media.v1'
const SOFT_LIMIT_BYTES = 500 * 1024 // 500 KB recommended ceiling

export interface MediaAssetData {
  id: MediaAssetId
  kind: 'image' | 'file'
  mimeType: string
  dataUrl: string
  byteSize: number
  createdAt: string // ISO
  /** SHA-1 content hash (v0.22.6-refactor C), computed on attach.
   * Available after the asset is fully loaded — may be empty for
   * assets attached before this field was added. */
  checksum: string
}

type AssetMap = Record<string, MediaAssetData>

function loadAssets(): AssetMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { assets?: AssetMap }
    return parsed.assets ?? {}
  } catch {
    return {}
  }
}

function saveAssets(map: AssetMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ assets: map }))
  } catch {
    // Quota exceeded — most likely. We've already warned at attach time.
  }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function makeId(): MediaAssetId {
  // We don't import codec here to avoid pulling generateId; cheap unique id.
  return `ma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` as MediaAssetId
}

export const mediaStore = {
  /**
   * Read a File, store its data URL in localStorage, and return a MediaRef
   * the caller can put into `card.media`. The actual blob lives only here
   * (web-local) — domain never sees the binary (Phase 2.5 will swap in
   * OPFS / Tauri fs and the public surface stays the same).
   *
   * SHA-1 checksum computed via crypto.subtle.digest during attach
   * (v0.22.6-refactor C) so sync can deduplicate assets later.
   */
  async attach(file: File): Promise<MediaRef> {
    if (file.size > SOFT_LIMIT_BYTES) {
      // Soft warning — MVP allows it but user should know it's a placeholder.
      console.warn(
        `[mediaStore] ${file.name} is ${(file.size / 1024).toFixed(0)} KB; ` +
          `> ${SOFT_LIMIT_BYTES / 1024} KB recommended. ` +
          `OPFS / Tauri fs lands in Phase 2.5 / 8.`,
      )
    }
    const dataUrl = await readAsDataURL(file)
    const id = makeId()
    const checksum = await contentHash(dataUrl)
    const asset: MediaAssetData = {
      id,
      kind: file.type.startsWith('image/') ? 'image' : 'file',
      mimeType: file.type || 'application/octet-stream',
      dataUrl,
      byteSize: file.size,
      createdAt: new Date().toISOString(),
      checksum,
    }
    const all = loadAssets()
    all[id] = asset
    saveAssets(all)
    const ref: MediaRef = { assetId: id, order: 0 }
    return ref
  },

  getAsset(id: MediaAssetId): MediaAssetData | null {
    return loadAssets()[id] ?? null
  },

  remove(id: MediaAssetId): void {
    const all = loadAssets()
    if (!all[id]) return
    delete all[id]
    saveAssets(all)
  },
}

/** SHA-1 content hash of a string (v0.22.6-refactor C).
 * Uses the Web Crypto API; returns hex string. Falls back to
 * empty string if crypto.subtle is unavailable or fails. */
async function contentHash(data: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(data)
    const hashBuf = await crypto.subtle.digest('SHA-1', buf)
    const hashArr = Array.from(new Uint8Array(hashBuf))
    return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}
