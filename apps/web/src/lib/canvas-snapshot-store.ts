'use client'

/**
 * Canvas snapshot store — F1.4 (v0.26.0).
 *
 * Per-canvas persistence for the full tldraw document (every shape: cards +
 * freeform notes/text/shapes/arrows/hand-draw) via getSnapshot/loadSnapshot.
 * Cards also write their geometry back to CardService (bindCardWriteback),
 * but freeform elements live ONLY here — without this store they'd vanish on
 * reload.
 *
 * Storage: localStorage, key `cys-stift.canvas.<canvasId>.v1`. The value is
 * the JSON-serialised `{ document, session }` from tldraw's getSnapshot.
 *
 * This is a placeholder layer (spec §4.5 / Phase 2.5 calls for OPFS / Tauri
 * fs long-term); the public surface (load/save) stays the same when those
 * land. SSR-safe (no-ops on the server).
 */
import type { CanvasId } from '@cys-stift/domain'

const KEY_PREFIX = 'cys-stift.canvas.'
const KEY_SUFFIX = '.v1'

/** Snapshot shape returned by tldraw's getSnapshot(editor.store). */
export interface CanvasSnapshot {
  document: unknown
  session: unknown
}

function storageKey(canvasId: CanvasId): string {
  return `${KEY_PREFIX}${String(canvasId)}${KEY_SUFFIX}`
}

export const canvasSnapshotStore = {
  /** Load a canvas snapshot, or null if none / corrupt. SSR returns null. */
  load(canvasId: CanvasId): CanvasSnapshot | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(storageKey(canvasId))
      if (!raw) return null
      const parsed = JSON.parse(raw) as { document?: unknown; session?: unknown }
      if (!parsed.document) return null
      return { document: parsed.document, session: parsed.session }
    } catch {
      // corrupt JSON or quota weirdness — treat as no snapshot
      return null
    }
  },

  /** Persist a canvas snapshot. Best-effort: quota errors are swallowed
   *  (logged once) so a huge canvas doesn't crash the editor. */
  save(canvasId: CanvasId, snapshot: CanvasSnapshot): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        storageKey(canvasId),
        JSON.stringify(snapshot),
      )
    } catch (e) {
      // Most likely QuotaExceededError on a canvas with many/large shapes
      // (hand-draw paths add up). Surface once so the user knows persistence
      // is degraded, but don't throw — the editor keeps working in-memory.
      console.warn(
        `[canvasSnapshotStore] save failed for ${String(canvasId)}: ${
          e instanceof Error ? e.message : String(e)
        }. Freeform elements may not persist until storage is cleared.`,
      )
    }
  },

  /** Remove a canvas snapshot (e.g. when the canvas is deleted). */
  remove(canvasId: CanvasId): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(storageKey(canvasId))
    } catch {
      // best-effort
    }
  },
}
