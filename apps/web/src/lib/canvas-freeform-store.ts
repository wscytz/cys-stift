'use client'

/**
 * Canvas freeform store — 自研画布的非卡片元素持久化(debt 收口 2026-06-23)。
 *
 * 自研 Canvas 2D 路由下,卡片(card)几何走 CardService/DB(单一可信源,spec §6.11),
 * 但 freeform 元素(text / freedraw / arrow / rect)只活在 host 里——没有这个 store
 * 它们会在 reload 时丢失。这里 per-canvas 持久化「非卡片 CanvasElement[]」,
 * 与 `.cystift` 的透明序列化(buildCystiftPayload / restoreCystiftPayload)同源:
 * 都是 `host.getElements()` ↔ `host.upsert` 的 JSON 往返。
 *
 * ## 与旧 canvasSnapshotStore 的区别
 *
 * 旧 `canvas-snapshot-store.ts` 是 tldraw `getSnapshot` 形状(`{document, session}`),
 * 自研路由从不 load/save 它(只在删画布时 .remove)。本 store 取而代之:
 * 形状是透明 `CanvasElement[]`,且强约束「绝不存 card」(三层:save 过滤 / load 过滤
 * / 类型注释),防止与 DB 双写冲突。`remove` 一并清理旧 tldraw snapshot 遗留数据。
 *
 * ## 存储(沿用旧 store 的后端策略)
 *
 * 主:OPFS(异步,不阻塞主线程;手绘点序列可能不小)。文件
 *   `cys-stift/canvas-freeform.<canvasId>.v1`。
 * 回退:localStorage,key `cys-stift.canvas-freeform.<canvasId>.v1`(OPFS 不可用时,
 *   如旧浏览器 / 隐私模式 / 测试环境)。
 *
 * SSR 安全:window 未定义时 load 返回 null、save/remove no-op。
 */
import type { CanvasId } from '@cys-stift/domain'
import type { CanvasElement } from '@/features/canvas/host/canvas-host'

const KEY_PREFIX = 'cys-stift.canvas-freeform.'
const KEY_SUFFIX = '.v1'

// 旧 tldraw snapshot 的 key(remove 时一并清理遗留数据)。
const LEGACY_KEY_PREFIX = 'cys-stift.canvas.'
const LEGACY_KEY_SUFFIX = '.v1'
const LEGACY_OPFS_PREFIX = 'canvas.'

const OPFS_DIR = 'cys-stift'
const OPFS_PREFIX = 'canvas-freeform.'
const OPFS_SUFFIX = '.v1'

/** 持久化的载荷:版本 + 生产者标记 + 非卡片元素。 */
export interface CanvasFreeformSnapshot {
  v: 1
  app: 'cys-stift'
  elements: CanvasElement[]
}

/** 只保留非卡片元素(card 几何以 DB 为单一可信源,绝不进本 store)。 */
function freeformOnly(elements: CanvasElement[]): CanvasElement[] {
  return elements.filter((el) => el.kind !== 'card')
}

function makeSnapshot(elements: CanvasElement[]): CanvasFreeformSnapshot {
  return { v: 1, app: 'cys-stift', elements: freeformOnly(elements) }
}

/** 解析 + 校验载荷;坏数据返回 null。card 在此再过滤一次(双保险)。 */
function parseSnapshot(raw: string): CanvasFreeformSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as { elements?: unknown }
    if (!Array.isArray(parsed.elements)) return null
    return makeSnapshot(parsed.elements as CanvasElement[])
  } catch {
    return null
  }
}

// ── localStorage helpers ─────────────────────────────────────────────────────

function storageKey(canvasId: CanvasId): string {
  return `${KEY_PREFIX}${String(canvasId)}${KEY_SUFFIX}`
}

function legacyStorageKey(canvasId: CanvasId): string {
  return `${LEGACY_KEY_PREFIX}${String(canvasId)}${LEGACY_KEY_SUFFIX}`
}

function lsLoad(canvasId: CanvasId): CanvasFreeformSnapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKey(canvasId))
    if (!raw) return null
    return parseSnapshot(raw)
  } catch {
    return null
  }
}

function lsSave(canvasId: CanvasId, snapshot: CanvasFreeformSnapshot): void {
  try {
    window.localStorage.setItem(storageKey(canvasId), JSON.stringify(snapshot))
  } catch (e) {
    console.warn(
      `[canvasFreeformStore] localStorage save failed for ${String(canvasId)}: ${
        e instanceof Error ? e.message : String(e)
      }. Freeform elements may not persist until storage is cleared.`,
    )
  }
}

function lsRemove(canvasId: CanvasId): void {
  try {
    window.localStorage.removeItem(storageKey(canvasId))
    window.localStorage.removeItem(legacyStorageKey(canvasId)) // 清旧 tldraw snapshot
  } catch {
    // best-effort
  }
}

// ── OPFS helpers ──────────────────────────────────────────────────────────────

async function opfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await navigator.storage.getDirectory()
  } catch {
    return null
  }
}

function opfsFileName(canvasId: CanvasId): string {
  return `${OPFS_PREFIX}${String(canvasId)}${OPFS_SUFFIX}`
}

function legacyOpfsFileName(canvasId: CanvasId): string {
  return `${LEGACY_OPFS_PREFIX}${String(canvasId)}${LEGACY_KEY_SUFFIX}`
}

async function opfsSave(
  canvasId: CanvasId,
  snapshot: CanvasFreeformSnapshot,
): Promise<boolean> {
  const root = await opfsRoot()
  if (!root) return false
  try {
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true })
    const fh = await dir.getFileHandle(opfsFileName(canvasId), { create: true })
    const writable = await fh.createWritable()
    await writable.write(JSON.stringify(snapshot))
    await writable.close()
    return true
  } catch (e) {
    console.warn(
      `[canvasFreeformStore] OPFS save failed for ${String(canvasId)}: ${
        e instanceof Error ? e.message : String(e)
      }. Falling back to localStorage.`,
    )
    return false
  }
}

async function opfsLoad(canvasId: CanvasId): Promise<CanvasFreeformSnapshot | null> {
  const root = await opfsRoot()
  if (!root) return null
  try {
    const dir = await root.getDirectoryHandle(OPFS_DIR)
    const fh = await dir.getFileHandle(opfsFileName(canvasId))
    const file = await fh.getFile()
    const text = await file.text()
    return parseSnapshot(text)
  } catch {
    // 文件不存在 / 坏 JSON / 目录不存在 —— 都当作「没有」。
    return null
  }
}

async function opfsRemove(canvasId: CanvasId): Promise<void> {
  const root = await opfsRoot()
  if (!root) return
  try {
    const dir = await root.getDirectoryHandle(OPFS_DIR)
    await dir.removeEntry(opfsFileName(canvasId))
  } catch {
    // 不存在 —— 无所谓。
  }
  try {
    const dir = await root.getDirectoryHandle(OPFS_DIR)
    await dir.removeEntry(legacyOpfsFileName(canvasId)) // 清旧 tldraw snapshot
  } catch {
    // 不存在 —— 无所谓。
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const canvasFreeformStore = {
  /**
   * 读取一个画布的 freeform 快照。OPFS 优先 → localStorage 回退。
   * 没有数据返回 null。SSR 返回 null。
   */
  async load(canvasId: CanvasId): Promise<CanvasFreeformSnapshot | null> {
    if (typeof window === 'undefined') return null
    const fromOpfs = await opfsLoad(canvasId)
    if (fromOpfs) return fromOpfs
    return lsLoad(canvasId)
  },

  /**
   * 持久化非卡片元素。card 元素在此被过滤掉(DB 单一可信源)。
   * OPFS 主;不可用时回退 localStorage。best-effort,配额错误被吞(记一次 warn)。
   */
  async save(canvasId: CanvasId, elements: CanvasElement[]): Promise<void> {
    if (typeof window === 'undefined') return
    const snapshot = makeSnapshot(elements)
    const ok = await opfsSave(canvasId, snapshot)
    if (!ok) lsSave(canvasId, snapshot)
  },

  /**
   * 删除一个画布的 freeform 快照(画布被删时调用)。
   * 同时清理旧 tldraw snapshot 遗留数据(OPFS + localStorage 两处)。
   */
  async remove(canvasId: CanvasId): Promise<void> {
    if (typeof window === 'undefined') return
    await opfsRemove(canvasId)
    lsRemove(canvasId)
  },
}
