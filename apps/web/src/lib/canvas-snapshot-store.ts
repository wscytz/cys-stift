'use client'

/**
 * Canvas snapshot store — F1.4 (v0.26.0) / P3 (v0.31.2).
 *
 * Per-canvas persistence for the full tldraw document (every shape: cards +
 * freeform notes/text/shapes/arrows/hand-draw) via getSnapshot/loadSnapshot.
 * Cards also write their geometry back to CardService (bindCardWriteback),
 * but freeform elements live ONLY here — without this store they'd vanish on
 * reload.
 *
 * ## Storage (v0.31.2 — P3 snapshot offload)
 *
 * Primary: OPFS (Origin Private File System) — async, non-blocking. Files
 * live under `cys-stift/canvas.<canvasId>.v1`.
 *
 * Fallback: localStorage, key `cys-stift.canvas.<canvasId>.v1`. Used when
 * OPFS is unavailable (old browser, private browsing that denies OPFS).
 *
 * Migration: on first `load()`, if a snapshot exists in localStorage but not
 * in OPFS, it is transparently migrated to OPFS and the localStorage copy is
 * removed. This is incremental — each canvas migrates the first time it's
 * visited after the upgrade.
 *
 * SSR-safe: all methods return early (null / no-op) when `window` is undefined.
 */
import type { CanvasId } from '@cys-stift/domain'

const KEY_PREFIX = 'cys-stift.canvas.'
const KEY_SUFFIX = '.v1'

const OPFS_DIR = 'cys-stift'
const OPFS_PREFIX = 'canvas.'
const OPFS_SUFFIX = '.v1'

/** Snapshot shape returned by tldraw's getSnapshot(editor.store). */
export interface CanvasSnapshot {
  document: unknown
  session: unknown
}

// ── localStorage helpers (internal — fallback + migration source) ──────────

function storageKey(canvasId: CanvasId): string {
  return `${KEY_PREFIX}${String(canvasId)}${KEY_SUFFIX}`
}

function lsLoad(canvasId: CanvasId): CanvasSnapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKey(canvasId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { document?: unknown; session?: unknown }
    if (!parsed.document) return null
    return { document: parsed.document, session: parsed.session }
  } catch {
    return null
  }
}

function lsSave(canvasId: CanvasId, snapshot: CanvasSnapshot): boolean {
  try {
    window.localStorage.setItem(storageKey(canvasId), JSON.stringify(snapshot))
    return true
  } catch (e) {
    console.warn(
      `[canvasSnapshotStore] localStorage save failed for ${String(canvasId)}: ${
        e instanceof Error ? e.message : String(e)
      }. Freeform elements may not persist until storage is cleared.`,
    )
    return false
  }
}

function lsRemove(canvasId: CanvasId): void {
  try {
    window.localStorage.removeItem(storageKey(canvasId))
  } catch {
    // best-effort
  }
}

// ── OPFS helpers ────────────────────────────────────────────────────────────

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

async function opfsSave(
  canvasId: CanvasId,
  snapshot: CanvasSnapshot,
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
      `[canvasSnapshotStore] OPFS save failed for ${String(canvasId)}: ${
        e instanceof Error ? e.message : String(e)
      }. Falling back to localStorage.`,
    )
    return false
  }
}

async function opfsLoad(
  canvasId: CanvasId,
): Promise<CanvasSnapshot | null> {
  const root = await opfsRoot()
  if (!root) return null
  try {
    const dir = await root.getDirectoryHandle(OPFS_DIR)
    const fh = await dir.getFileHandle(opfsFileName(canvasId))
    const file = await fh.getFile()
    const text = await file.text()
    const parsed = JSON.parse(text) as { document?: unknown; session?: unknown }
    if (!parsed.document) return null
    return { document: parsed.document, session: parsed.session }
  } catch {
    // file not found, corrupt JSON, or directory doesn't exist — all fine
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
    // file or directory doesn't exist — fine
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const canvasSnapshotStore = {
  /**
   * Load a canvas snapshot.
   *
   * OPFS first → localStorage fallback. On first load from localStorage,
   * the snapshot is transparently migrated to OPFS and the localStorage
   * copy is removed (fire-and-forget — the data is returned immediately).
   *
   * SSR returns null.
   */
  async load(canvasId: CanvasId): Promise<CanvasSnapshot | null> {
    if (typeof window === 'undefined') return null

    // Primary: OPFS
    const fromOpfs = await opfsLoad(canvasId)
    if (fromOpfs) return fromOpfs

    // Migration path: localStorage → OPFS
    const fromLs = lsLoad(canvasId)
    if (fromLs) {
      // Fire-and-forget migration: the data is already in hand, so we
      // don't block the caller. If the OPFS write fails, the next save
      // will retry the migration naturally.
      void opfsSave(canvasId, fromLs).then((ok) => {
        if (ok) lsRemove(canvasId)
      })
      return fromLs
    }

    return null
  },

  /**
   * Persist a canvas snapshot.
   *
   * OPFS primary; falls back to localStorage if OPFS is unavailable.
   * Best-effort: quota errors are swallowed (logged once) so a huge
   * canvas doesn't crash the editor.
   *
   * On successful OPFS write, any lingering localStorage copy for this
   * canvas is removed (migration cleanup).
   */
  async save(canvasId: CanvasId, snapshot: CanvasSnapshot): Promise<void> {
    if (typeof window === 'undefined') return

    const ok = await opfsSave(canvasId, snapshot)
    if (ok) {
      // Clean up any lingering localStorage copy (migration).
      lsRemove(canvasId)
    } else {
      // OPFS unavailable — fall back to localStorage.
      lsSave(canvasId, snapshot)
    }
  },

  /**
   * Remove a canvas snapshot (e.g. when the canvas is deleted).
   * Cleans both OPFS and localStorage.
   */
  async remove(canvasId: CanvasId): Promise<void> {
    if (typeof window === 'undefined') return
    await opfsRemove(canvasId)
    lsRemove(canvasId)
  },
}
