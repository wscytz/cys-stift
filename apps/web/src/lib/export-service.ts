'use client'

import type { Card, Canvas, CanvasId } from '@cys-stift/domain'
import { canvasFreeformStore, type CanvasFreeformSnapshot } from './canvas-freeform-store'

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

/**
 * Canvas 列表信封:与 canvas-store 的 CanvasesSnapshot 同形(canvases + active)。
 * 导出时直接读 localStorage 原始 key 取 .snapshot,避免触发 store hydrate 副作用。
 */
export type CanvasesEnvelope = {
  canvases: Canvas[]
  activeCanvasId: string
}

export interface ExportPayload {
  version: typeof EXPORT_FORMAT_VERSION
  exportedAt: string // ISO
  app: string
  cards: Card[]
  mediaAssets: Record<string, unknown> // MediaAssetData map (Phase 6.5f)
  drafts?: Record<string, unknown>
  settings?: Record<string, unknown>
  /** canvas 列表(多画布 + active)。旧版 JSON 无此字段(向后兼容)。 */
  canvases?: CanvasesEnvelope
  /** per-canvas freeform 几何,key=canvasId。复用 CanvasFreeformSnapshot(与 .cystift 同源 CanvasElement[])。 */
  freeform?: Record<string, CanvasFreeformSnapshot>
  /**
   * per-canvas view(zoom/pan/gridMode/gridSize),key=canvasId。
   * 与 canvas-view-store 的 `{ views: Record<CanvasId, CanvasView> }` 同形;
   * 这里只存 `.views` 部分以保持 payload 扁平。旧版 JSON 无此字段(向后兼容)。
   */
  canvasView?: Record<string, unknown>
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
 *
 * Async because per-canvas freeform geometry lives in OPFS (canvasFreeformStore.load);
 * we await each canvas's snapshot in sequence. SSR returns an empty payload.
 */
export async function buildExportPayload(): Promise<ExportPayload> {
  if (typeof window === 'undefined') {
    // SSR 早退:返回空 payload(与原 readJson-返回-null 兜底语义一致)。
    return {
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      app: "cy's Stift",
      cards: [],
      mediaAssets: {},
    }
  }
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

  // canvas 列表(同步 localStorage,取 .snapshot 部分)。直接读原始 key,不触发
  // canvasStore hydrate 副作用。
  const canvasesPayload = readJson('cys-stift.canvases.v1') as {
    snapshot?: CanvasesEnvelope
  } | null
  const canvasesEnvelope = canvasesPayload?.snapshot

  // freeform 几何:遍历 canvas 列表,对每个 canvas 读 freeform(OPFS 异步)。
  let freeform: Record<string, CanvasFreeformSnapshot> | undefined
  if (canvasesEnvelope && canvasesEnvelope.canvases.length > 0) {
    const entries: [string, CanvasFreeformSnapshot][] = []
    for (const c of canvasesEnvelope.canvases) {
      const snap = await canvasFreeformStore.load(c.id)
      if (snap) entries.push([c.id, snap])
    }
    if (entries.length > 0) freeform = Object.fromEntries(entries)
  }

  // canvas-view(zoom/pan/gridMode/gridSize per canvas,canvas-view-store)。
  // 直接读原始 key 取 `.views`,与 canvases/freeform 同样不触发 store hydrate 副作用。
  const canvasViewPayload = readJson('cys-stift.canvas-view.v1') as {
    views?: Record<string, unknown>
  } | null
  const canvasView = canvasViewPayload?.views

  return {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "cy's Stift",
    cards: cardsPayload?.cards ?? [],
    mediaAssets: mediaPayload?.assets ?? {},
    drafts: draftsPayload?.drafts,
    settings: settingsPayload?.settings,
    ...(canvasesEnvelope ? { canvases: canvasesEnvelope } : {}),
    ...(freeform ? { freeform } : {}),
    ...(canvasView ? { canvasView } : {}),
  }
}

/**
 * Serialise the payload and trigger a browser download. Returns the
 * approximate byte size so the caller can show a hint.
 */
export async function downloadExport(): Promise<number> {
  if (typeof window === 'undefined') return 0
  const payload = await buildExportPayload()
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
  /** 导入的 canvas 数(写入 canvases localStorage key 的条数)。 */
  canvases?: number
  /** 导入成功 freeform 几何的 canvas 数(OPFS/localStorage)。 */
  freeformCanvases?: number
  /** freeform 持久化失败的 canvas 数(OPFS+localStorage 双失败)。
   *  不整体失败(卡片/canvas 列表已成功落地且有 rollback),但诚实回报供 UI 提示。
   *  全成功时为 undefined(向后兼容)。 */
  freeformSkipped?: number
  error?: string
}

export async function importFromJson(jsonText: string): Promise<ImportResult> {
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
    // canvas 列表:与 cards/media 同走同步 localStorage 写,纳入现有 snapshot
    // rollback 机制(snapshot 数组遍历 writes,自动包含此 key)。旧 JSON 无
    // canvases 字段 → 跳过(向后兼容)。
    if (payload.canvases) {
      writes.push({
        key: 'cys-stift.canvases.v1',
        value: JSON.stringify({ snapshot: payload.canvases }),
      })
    }
    // canvas-view(zoom/pan/gridMode/gridSize per canvas):与 canvases 同走同步
    // localStorage 写 + rollback。payload 存扁平 views map,写回时还原为
    // canvas-view-store 的 `{ views }` envelope。旧 JSON 无 canvasView 字段 → 跳过。
    if (payload.canvasView && typeof payload.canvasView === 'object') {
      writes.push({
        key: 'cys-stift.canvas-view.v1',
        value: JSON.stringify({ views: payload.canvasView }),
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

  // freeform 几何走 OPFS(异步),在 localStorage 原子写成功之后才写。不纳入
  // localStorage rollback——若上面写入失败已 early return rollback,根本到不了这里。
  // 全量 import 覆盖语义;canvasFreeformStore.save 内部 best-effort(OPFS 失败回退
  // localStorage)。card 元素会被 store 自动过滤(DB 是单一可信源,见 spec §6.11)。
  // save 返回 false = OPFS+localStorage 双失败:不整体失败(卡片/canvas 列表已落地),
  // 但累计 freeformSkipped 诚实回报供 UI 提示(此前忽略返回值 → 静默丢失)。
  let freeformCanvases = 0
  let freeformSkipped = 0
  if (payload.freeform) {
    for (const [canvasId, snap] of Object.entries(payload.freeform)) {
      const saved = await canvasFreeformStore.save(canvasId as CanvasId, snap.elements)
      if (saved) freeformCanvases++
      else freeformSkipped++
    }
  }

  return {
    ok: true,
    cards: payload.cards.length,
    mediaAssets: Object.keys(payload.mediaAssets ?? {}).length,
    ...(payload.canvases ? { canvases: payload.canvases.canvases.length } : {}),
    ...(freeformCanvases > 0 ? { freeformCanvases } : {}),
    ...(freeformSkipped > 0 ? { freeformSkipped } : {}),
  }
}
