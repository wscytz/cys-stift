'use client'

import type { Card, Canvas, CanvasId } from '@cys-stift/domain'
import { canvasFreeformStore, type CanvasFreeformSnapshot } from './canvas-freeform-store'
import { downloadFile } from './download'
import type { CanvasTemplate } from './canvas-templates'
import type { PersistedConversationMessage } from './conversation-store'
import type { Sample } from '@/features/ai/sample-store'

// ── Export (spec §1.2 信念4 "数据可迁移") ──────────────────────────────────
// Serialise the user's local data to an open JSON format. The browser
// stores we read from:
//   - cys-stift.cards.v1                       (db-client, Phase 2)
//   - cys-stift.media.v1                       (media-store, Phase 6.5f)
//   - cys-stift.drafts.v1                      (draft-store, Phase 6.5a) — optional
//   - cys-stift.settings.v2                    (settings-store, multi-profile) — optional
//   - cys-stift.canvas-templates.v1            (canvas-templates, 自建模板) — optional
//   - cys-stift.ai-samples.v1                  (sample-store, AI 样本) — optional
//   - cys-stift.conversation.<canvasId>.v2     (conversation-store, per-canvas) — optional
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
  /** 用户自建画布模板(裸数组,与 canvas-templates store 的 localStorage 同形)。旧版 JSON 无此字段。 */
  canvasTemplates?: CanvasTemplate[]
  /** AI 交互样本(裸数组,与 sample-store 的 localStorage 同形)。旧版 JSON 无此字段。 */
  aiSamples?: Sample[]
  /** per-canvas AI 对话历史,key=canvasId。枚举 localStorage 的 cys-stift.conversation.<id>.v2。旧版 JSON 无此字段。 */
  conversations?: Record<string, PersistedConversationMessage[]>
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
 * 枚举 localStorage 中所有 per-canvas 对话历史 key(cys-stift.conversation.<canvasId>.v2),
 * 返回 `{ canvasId: messages[] }` map。无匹配 / 全空 / SSR → undefined(omit field)。
 *
 * conversation-store 的 key 是 per-canvas 的(每个画布独立对话上下文),无法用单 key
 * 读取,必须枚举 localStorage。坏 JSON 静默跳过(不抛,不纳入 payload)。
 */
function readAllConversations(): Record<string, PersistedConversationMessage[]> | undefined {
  if (typeof window === 'undefined') return undefined
  const prefix = 'cys-stift.conversation.'
  const suffix = '.v2'
  const out: Record<string, PersistedConversationMessage[]> = {}
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) continue
    const canvasId = key.slice(prefix.length, key.length - suffix.length)
    if (!canvasId) continue
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        out[canvasId] = parsed as PersistedConversationMessage[]
      }
    } catch {
      // 坏 JSON 跳过(不纳入 payload,不抛)
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Build the export payload from current browser storage. Pure function —
 * does not trigger a download; call `downloadExport()` for that.
 *
 * Async because per-canvas freeform geometry lives in OPFS (canvasFreeformStore.load);
 * we await each canvas's snapshot in sequence. SSR returns an empty payload.
 */
export async function buildExportPayload(
  opts?: { includeDeleted?: boolean },
): Promise<ExportPayload> {
  // includeDeleted defaults to true (full recoverable backup). When false
  // (user unchecked the settings box), strip archived + soft-deleted cards
  // so the export contains only live cards. Import remains full-accept — a
  // backup is always the complete, restorable picture.
  const includeDeleted = opts?.includeDeleted ?? true
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
  const settingsPayload = readJson('cys-stift.settings.v2') as {
    settings?: Record<string, unknown>
  } | null

  // Filter to live cards only when the user opted out of deleted/archived.
  // Default (includeDeleted=true) keeps the full set — backups are always
  // the complete, restorable picture.
  let cards = cardsPayload?.cards ?? []
  if (!includeDeleted) {
    cards = cards.filter((c) => !c.archived && !c.deletedAt)
  }

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

  // 用户自建画布模板(canvas-templates store,裸数组)。直接读原始 key。
  // 预设模板硬编码在代码里(PRESET_TEMPLATES),不进 payload(导入时自然合并)。
  const templatesRaw = readJson('cys-stift.canvas-templates.v1')
  const canvasTemplates = Array.isArray(templatesRaw)
    ? (templatesRaw as CanvasTemplate[])
    : undefined

  // AI 交互样本(sample-store,裸数组)。直接读原始 key。
  const samplesRaw = readJson('cys-stift.ai-samples.v1')
  const aiSamples = Array.isArray(samplesRaw) ? (samplesRaw as Sample[]) : undefined

  // per-canvas AI 对话历史(conversation-store,多 key 枚举)。
  const conversations = readAllConversations()

  return {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "cy's Stift",
    cards: cards,
    mediaAssets: mediaPayload?.assets ?? {},
    drafts: draftsPayload?.drafts,
    settings: settingsPayload?.settings,
    ...(canvasesEnvelope ? { canvases: canvasesEnvelope } : {}),
    ...(freeform ? { freeform } : {}),
    ...(canvasView ? { canvasView } : {}),
    ...(canvasTemplates ? { canvasTemplates } : {}),
    ...(aiSamples ? { aiSamples } : {}),
    ...(conversations ? { conversations } : {}),
  }
}

/**
 * Serialise the payload and trigger a download (cross-platform: Blob+a.click
 * on desktop, Tauri SAF save on Android). Returns the approximate byte size
 * so the caller can show a hint.
 */
export async function downloadExport(
  opts?: { includeDeleted?: boolean },
): Promise<number> {
  if (typeof window === 'undefined') return 0
  const payload = await buildExportPayload(opts)
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const stamp = payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-')
  // 走 downloadFile(分平台:桌面 Blob+a.click / Android Tauri SAF save),
  // 解决 Android WebView 不处理 Blob download 的静默失败。
  await downloadFile(`cys-stift-export-${stamp}.json`, blob)
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
  /** 导入的 per-canvas 对话历史 key 数。 */
  conversations?: number
  /** 导入的自建画布模板数。 */
  canvasTemplates?: number
  /** 导入的 AI 交互样本数。 */
  aiSamples?: number
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
    // createdAt/updatedAt 虽可选,但若提供必须是可解析的有效日期(与 capturedAt
    // 同标准)。坏值如 "garbage" → Invalid Date → getTime()=NaN → rehydrate 签名
    // 变 "N:NaN" 跨 tab 同步断裂 + sort 比较器返回 NaN 行为未定义(数据损坏真 bug)。
    if (card.createdAt !== undefined) {
      const d =
        card.createdAt instanceof Date ? card.createdAt : new Date(card.createdAt as string)
      if (isNaN(d.getTime())) {
        return { ok: false, cards: 0, mediaAssets: 0, error: `cards[${i}].createdAt is not a valid date` }
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
    if (card.updatedAt !== undefined) {
      const d =
        card.updatedAt instanceof Date ? card.updatedAt : new Date(card.updatedAt as string)
      if (isNaN(d.getTime())) {
        return { ok: false, cards: 0, mediaAssets: 0, error: `cards[${i}].updatedAt is not a valid date` }
      }
    }
    // capturedAt is a required Date on Card (domain types.ts) and is the
    // sort key for listInbox (db-client: `b.capturedAt.getTime() - a...`).
    // A missing or unparseable capturedAt → `new Date(undefined|garbage)` =
    // Invalid Date → getTime() = NaN → Array.sort with a NaN comparator
    // scrambles the inbox order (audit: import-validation). So unlike
    // createdAt/updatedAt (which are optional in this validation), capturedAt
    // MUST be present AND parse to a real date. Match the existing "reject the
    // whole import" style used for bad createdAt/updatedAt.
    if (
      card.capturedAt === undefined ||
      card.capturedAt === null ||
      (typeof card.capturedAt !== 'string' && !(card.capturedAt instanceof Date))
    ) {
      return {
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: `cards[${i}].capturedAt missing or not a date`,
      }
    }
    // Type-checked above; now confirm it parses to a real date (not Invalid Date).
    // `new Date('not-a-date')` yields a Date object whose getTime() is NaN.
    const capturedDate =
      card.capturedAt instanceof Date
        ? card.capturedAt
        : new Date(card.capturedAt as string)
    if (isNaN(capturedDate.getTime())) {
      return {
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: `cards[${i}].capturedAt is not a valid date`,
      }
    }
  }

  // canvasPosition 引用一致性:card.canvasPosition.canvasId 必须指向一个真实存在的
  // 画布。旧版 JSON(无 canvases 字段)或手工编辑/损坏的 JSON 里,可能出现指向不存在
  // 画布的 canvasPosition —— 这种卡既不出现在 inbox(listInbox 要求 !canvasPosition)
  // 也不出现在任何画布(listOnCanvas 按 canvasId 过滤)→ 永久不可见不可找回(真 bug,
  // 非设计约束)。修法:payload 带 canvases 时,校验每张卡的 canvasId;指向不存在画布的
  // 清掉 canvasPosition(回 inbox,可见可找回),而非 reject 整体导入(更友好,不丢数据)。
  // payload 不带 canvases(旧 JSON)→ 无法校验,保留原样(向后兼容)。
  if (payload.canvases && Array.isArray(payload.canvases.canvases)) {
    const validCanvasIds = new Set(payload.canvases.canvases.map((c) => c.id))
    for (let i = 0; i < payload.cards.length; i++) {
      const card = payload.cards[i] as Card & { canvasPosition?: { canvasId?: unknown } }
      const cp = card.canvasPosition
      if (cp && (typeof cp.canvasId !== 'string' || !validCanvasIds.has(cp.canvasId))) {
        delete card.canvasPosition
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
        key: 'cys-stift.settings.v2',
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
    // 用户自建画布模板(裸数组,与 canvas-templates store 同形)。旧 JSON 无此字段 → 跳过。
    if (payload.canvasTemplates && Array.isArray(payload.canvasTemplates)) {
      writes.push({
        key: 'cys-stift.canvas-templates.v1',
        value: JSON.stringify(payload.canvasTemplates),
      })
    }
    // AI 交互样本(裸数组,与 sample-store 同形)。旧 JSON 无此字段 → 跳过。
    if (payload.aiSamples && Array.isArray(payload.aiSamples)) {
      writes.push({
        key: 'cys-stift.ai-samples.v1',
        value: JSON.stringify(payload.aiSamples),
      })
    }
    // per-canvas AI 对话历史(多 key,每个 canvasId 一个 localStorage key)。
    // 与 canvases/templates 同走同步 localStorage 写 + rollback —— 每个 key 独立
    // 纳入 snapshot/writes 数组,原子性由现有 rollback 机制覆盖。
    // 旧 JSON 无此字段 → 跳过(向后兼容)。
    if (payload.conversations && typeof payload.conversations === 'object') {
      for (const [canvasId, msgs] of Object.entries(payload.conversations)) {
        if (!Array.isArray(msgs)) continue
        writes.push({
          key: `cys-stift.conversation.${canvasId}.v2`,
          value: JSON.stringify(msgs),
        })
      }
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
  if (payload.freeform && typeof payload.freeform === 'object') {
    for (const [canvasId, snap] of Object.entries(payload.freeform)) {
      // 坏值防御(恶意/损坏 JSON):snap 非对象或 elements 非数组 → 跳过,不抛
      // (此前 snap=null 时 snap.elements 抛 TypeError → 异步 unhandled rejection,
      // localStorage 已写但 freeform 静默全丢 = 半损坏状态)。
      if (!snap || typeof snap !== 'object' || !Array.isArray(snap.elements)) {
        freeformSkipped++
        continue
      }
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
    ...(payload.conversations
      ? { conversations: Object.keys(payload.conversations).length }
      : {}),
    ...(payload.canvasTemplates ? { canvasTemplates: payload.canvasTemplates.length } : {}),
    ...(payload.aiSamples ? { aiSamples: payload.aiSamples.length } : {}),
  }
}
