'use client'

/**
 * archive-store — 开发存档(内容版本)。spec: docs/superpowers/specs/2026-07-04-archive-versioning-design.md
 *
 * 在 release / 风险 op / 手动 checkpoint 时刻落全量状态快照(OPFS),供查档 / 查错误 /
 * release 自修自查。Two-tier 存储(镜像 canvas-freeform-store 的 OPFS+LS 范式):
 *   - index:cys-stift/archive-index.v1 → { lastAppVersion, nextVersion, entries: ArchiveEntryMeta[] }(无 payload,轻)
 *   - payload:cys-stift/archive-payload.<version>.v1 → ArchivePayload(per-version)
 * listMeta 读 index(常驻内存缓存);loadPayload 按需读 per-version 文件。
 */
import type { Card, MediaAssetId } from '@cys-stift/domain'
import type { CanvasesEnvelope } from './export-service'
import type { CanvasFreeformSnapshot } from './canvas-freeform-store'

export type ArchiveTrigger =
  | 'release'
  | 'ai-layout' | 'ai-agent' | 'cluster' | 'dsl-apply'
  | 'manual'

/** 风险 op(b 类)存档封顶;release/migration/manual 永久留。spec D6。 */
export const ARCHIVE_RISKY_CAP = 100
const RISKY_TRIGGERS: ReadonlySet<ArchiveTrigger> = new Set([
  'ai-layout', 'ai-agent', 'cluster', 'dsl-apply',
])

export interface MediaAssetMeta {
  id: MediaAssetId
  kind: 'image' | 'file'
  mimeType: string
  byteSize: number
  createdAt: string
  checksum: string
} // = Omit<MediaAssetData, 'dataUrl'>

export interface ArchivePayload {
  cards: Card[]
  canvases?: CanvasesEnvelope
  freeform?: Record<string, CanvasFreeformSnapshot>
  settings?: Record<string, unknown>
  drafts?: Record<string, unknown>
  canvasView?: Record<string, unknown>
  mediaAssets: Record<string, MediaAssetMeta>
}

export interface ArchiveEntryMeta {
  archiveVersion: number
  createdAt: number
  trigger: ArchiveTrigger
  appVersion: string
  note: string
}

export interface ArchiveEntry extends ArchiveEntryMeta {
  payload: ArchivePayload
}

interface ArchiveIndex {
  lastAppVersion: string | null
  nextVersion: number
  entries: ArchiveEntryMeta[]
}

const OPFS_DIR = 'cys-stift'
const INDEX_OPFS = 'archive-index.v1'
const INDEX_LS = 'cys-stift.archive-index.v1'
const PAYLOAD_OPFS_PREFIX = 'archive-payload.'
const PAYLOAD_OPFS_SUFFIX = '.v1'
const PAYLOAD_LS_PREFIX = 'cys-stift.archive-payload.'

// 订阅(useSyncExternalStore 范式,镜像 freeform-store)
let _version = 0
const _subs = new Set<() => void>()
function notify(): void { _version++; for (const cb of _subs) cb() }

let _indexCache: ArchiveIndex | null = null

function emptyIndex(): ArchiveIndex {
  return { lastAppVersion: null, nextVersion: 1, entries: [] }
}

// ── localStorage helpers ────────────────────────────────────────────────────
function lsLoadIndex(): ArchiveIndex | null {
  try {
    const raw = window.localStorage.getItem(INDEX_LS)
    return raw ? (JSON.parse(raw) as ArchiveIndex) : null
  } catch { return null }
}
function lsSaveIndex(idx: ArchiveIndex): boolean {
  try { window.localStorage.setItem(INDEX_LS, JSON.stringify(idx)); return true }
  catch { return false }
}
function lsLoadPayload(version: number): ArchivePayload | null {
  try {
    const raw = window.localStorage.getItem(`${PAYLOAD_LS_PREFIX}${version}.v1`)
    return raw ? (JSON.parse(raw) as ArchivePayload) : null
  } catch { return null }
}
function lsSavePayload(version: number, p: ArchivePayload): boolean {
  try { window.localStorage.setItem(`${PAYLOAD_LS_PREFIX}${version}.v1`, JSON.stringify(p)); return true }
  catch { return false }
}

// ── OPFS helpers ─────────────────────────────────────────────────────────────
async function opfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  try { return await navigator.storage.getDirectory() } catch { return null }
}
async function opfsRead(name: string): Promise<string | null> {
  const root = await opfsRoot()
  if (!root) return null
  try {
    const dir = await root.getDirectoryHandle(OPFS_DIR)
    const fh = await dir.getFileHandle(name)
    return await (await fh.getFile()).text()
  } catch { return null }
}
async function opfsWrite(name: string, text: string): Promise<boolean> {
  const root = await opfsRoot()
  if (!root) return false
  try {
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true })
    const fh = await dir.getFileHandle(name, { create: true })
    const w = await fh.createWritable()
    await w.write(text)
    await w.close()
    return true
  } catch { return false }
}
async function opfsRemove(name: string): Promise<void> {
  const root = await opfsRoot()
  if (!root) return
  try { await (await root.getDirectoryHandle(OPFS_DIR)).removeEntry(name) } catch { /* 不存在无所谓 */ }
}

function payloadFileName(version: number): string {
  return `${PAYLOAD_OPFS_PREFIX}${version}${PAYLOAD_OPFS_SUFFIX}`
}

// ── index 加载(OPFS 优先 → LS 回退 → 内存缓存)─────────────────────────────
async function loadIndex(): Promise<ArchiveIndex> {
  if (_indexCache) return _indexCache
  if (typeof window === 'undefined') return _indexCache = emptyIndex()
  const fromOpfs = await opfsRead(INDEX_OPFS)
  if (fromOpfs) {
    try { _indexCache = JSON.parse(fromOpfs) as ArchiveIndex; return _indexCache }
    catch { /* 坏 JSON 落回退 */ }
  }
  _indexCache = lsLoadIndex() ?? emptyIndex()
  return _indexCache
}

async function persistIndex(idx: ArchiveIndex): Promise<void> {
  const text = JSON.stringify(idx)
  const ok = await opfsWrite(INDEX_OPFS, text)
  if (!ok) lsSaveIndex(idx) // OPFS 不可用回退 LS
}

async function persistPayload(version: number, p: ArchivePayload): Promise<boolean> {
  const ok = await opfsWrite(payloadFileName(version), JSON.stringify(p))
  if (ok) return true
  return lsSavePayload(version, p)
}

async function removePayload(version: number): Promise<void> {
  await opfsRemove(payloadFileName(version))
  try { window.localStorage.removeItem(`${PAYLOAD_LS_PREFIX}${version}.v1`) } catch { /* best-effort */ }
}

/**
 * 分层 FIFO 清扫(spec D6):b 类(ai-layout/ai-agent/cluster/dsl-apply)超 ARCHIVE_RISKY_CAP
 * 时按 archiveVersion 升序丢最旧(删 OPFS payload + LS key),release/manual 永久留。
 * 在 append 内 persistIndex **之前**调,保证落盘的 index 已剪好。
 */
async function applyRetention(idx: ArchiveIndex): Promise<void> {
  const risky = idx.entries.filter((e) => RISKY_TRIGGERS.has(e.trigger))
  if (risky.length <= ARCHIVE_RISKY_CAP) return
  // 按版号升序丢最旧的 risky,直到 <= cap
  risky.sort((a, b) => a.archiveVersion - b.archiveVersion)
  const dropCount = risky.length - ARCHIVE_RISKY_CAP
  const dropVersions = new Set(risky.slice(0, dropCount).map((e) => e.archiveVersion))
  // 删 payload 文件(OPFS + LS)
  for (const v of dropVersions) await removePayload(v)
  // 从 index entries 移除
  idx.entries = idx.entries.filter((e) => !dropVersions.has(e.archiveVersion))
}

// ── Public API ───────────────────────────────────────────────────────────────
export const archiveStore = {
  subscribe(cb: () => void): () => void {
    _subs.add(cb)
    return () => { _subs.delete(cb) }
  },
  getVersion(): number { return _version },

  /** 当前内存缓存 index 的 entries 视图(倒序);未加载时返回 []。 */
  listMeta(): ArchiveEntryMeta[] {
    return _indexCache ? [..._indexCache.entries].reverse() : []
  },

  async append(
    trigger: ArchiveTrigger,
    note: string,
    payload: ArchivePayload,
    appVersion: string,
  ): Promise<ArchiveEntryMeta> {
    if (typeof window !== 'undefined') await loadIndex()
    const idx = _indexCache ?? emptyIndex()
    const version = idx.nextVersion
    const meta: ArchiveEntryMeta = {
      archiveVersion: version,
      createdAt: Date.now(),
      trigger,
      appVersion,
      note,
    }
    idx.entries.push(meta)
    idx.nextVersion = version + 1
    _indexCache = idx
    await persistPayload(version, payload)
    await applyRetention(idx) // 分层 FIFO:b 类超 cap 丢旧 + 删 payload;release/manual 永久
    await persistIndex(idx)
    notify()
    return meta
  },

  async loadPayload(version: number): Promise<ArchivePayload | null> {
    if (typeof window === 'undefined') return null
    const fromOpfs = await opfsRead(payloadFileName(version))
    if (fromOpfs) { try { return JSON.parse(fromOpfs) as ArchivePayload } catch { /* 落回退 */ } }
    return lsLoadPayload(version)
  },

  /**
   * 由 ArchiveReleaseGate(T4)在 app 启动调一次。版本变(prev !== cur)→ 追加
   * release 档;首次(prev === null)只记 lastAppVersion,不打档(避免空 app
   * 首启一条空档);版本同 → no-op。幂等(index.lastAppVersion 守卫)。
   *
   * buildPayload 走回调注入(不在 store 直接 import build-archive-payload),
   * 既解耦 store ↔ payload-builder,也便于测试 mock。
   *
   * lastAppVersion 持久化时序:idx.lastAppVersion 在 append **之前**赋值,append
   * 内 persistIndex 的是同一 idx 引用 → lastAppVersion 与新 entry 同盘落,不漂移。
   * 首 prev=null 分支单独 persistIndex(idx) 落 lastAppVersion。
   */
  async ensureReleaseRecord(
    appVersion: string,
    buildPayload: () => Promise<ArchivePayload>,
  ): Promise<void> {
    if (typeof window === 'undefined') return
    await loadIndex()
    const idx = _indexCache ?? emptyIndex()
    if (idx.lastAppVersion === appVersion) return
    const prev = idx.lastAppVersion
    idx.lastAppVersion = appVersion
    if (prev === null) {
      // 首次:只记 lastAppVersion,不打档(避免空 app 首启一条空档)。
      // 不 notify:listMeta() 未变(无新 entry),无对外可观测状态变化。
      _indexCache = idx
      await persistIndex(idx)
      return
    }
    // prev → cur 变化:打 release 档(真全量 payload,由调用方注入)
    const payload = await buildPayload()
    _indexCache = idx
    await this.append('release', `boot ${prev}→${appVersion}`, payload, appVersion)
    // append 内已 persistIndex + notify;lastAppVersion 已在 idx 上 append 前 set
  },
}
