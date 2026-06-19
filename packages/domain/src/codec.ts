/**
 * Branded-ID codec (spec §4.11.1).
 *
 * SQLite stores IDs as plain text. At the DB boundary we need to rebuild
 * the brand so downstream code keeps the type protection. These helpers are
 * the only sanctioned way to construct a branded ID.
 */

import type { CardId, CanvasId, MediaAssetId, WorkspaceId } from './types'

export const toCardId = (s: string): CardId => s as CardId
export const fromCardId = (id: CardId): string => id as string

export const toCanvasId = (s: string): CanvasId => s as CanvasId
export const fromCanvasId = (id: CanvasId): string => id as string

export const toWorkspaceId = (s: string): WorkspaceId => s as WorkspaceId
export const fromWorkspaceId = (id: WorkspaceId): string => id as string

export const toMediaAssetId = (s: string): MediaAssetId => s as MediaAssetId
export const fromMediaAssetId = (id: MediaAssetId): string => id as string

/**
 * Tiny ID generator — 16 random hex chars, good enough for local-first
 * single-user. Real collision-resistant IDs land with sync (Phase 9+).
 */
export function generateId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
