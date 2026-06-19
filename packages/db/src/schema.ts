/**
 * Drizzle schema for cy's Stift (spec §4.7, §4.9, §4.6).
 * Four tables: workspaces, canvases, cards, media_assets.
 *
 * Branded IDs are stored as plain text — the boundary codec in ./codec.ts
 * re-brands them on read. JSON columns are plain text with TS type assertions
 * via $type<>() — the codec handles parse/stringify.
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  defaultCanvasId: text('default_canvas_id').notNull(),
  regionColorMapJson: text('region_color_map_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const canvases = sqliteTable(
  'canvases',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    name: text('name').notNull(),
    viewJson: text('view_json').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    byWorkspace: index('idx_canvases_workspace').on(t.workspaceId),
  }),
)

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    type: text('type').notNull(),

    mediaJson: text('media_json').notNull().default('[]'),
    linksJson: text('links_json').notNull().default('[]'),
    codeSnippetsJson: text('code_snippets_json').notNull().default('[]'),
    quotesJson: text('quotes_json').notNull().default('[]'),

    sourceJson: text('source_json').notNull(),

    capturedAt: integer('captured_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),

    canvasId: text('canvas_id'),
    canvasX: real('canvas_x'),
    canvasY: real('canvas_y'),
    canvasW: real('canvas_w'),
    canvasH: real('canvas_h'),
    canvasZ: real('canvas_z'),
    canvasRotation: real('canvas_rotation'),

    color: text('color'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (t) => ({
    byWorkspaceInbox: index('idx_cards_workspace_inbox').on(t.workspaceId, t.archived),
    byCanvas: index('idx_cards_canvas').on(t.canvasId),
    byCapturedAt: index('idx_cards_captured_at').on(t.capturedAt),
  }),
)

export const mediaAssets = sqliteTable('media_assets', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull(),
  kind: text('kind').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  storageBackend: text('storage_backend').notNull(),
  storageRelPath: text('storage_rel_path').notNull(),
  storageChecksum: text('storage_checksum').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type CardRow = typeof cards.$inferSelect
export type CanvasRow = typeof canvases.$inferSelect
export type WorkspaceRow = typeof workspaces.$inferSelect
export type MediaAssetRow = typeof mediaAssets.$inferSelect
