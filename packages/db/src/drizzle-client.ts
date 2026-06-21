/**
 * SQLite-backed Drizzle client. Uses better-sqlite3 (native, sync) for the
 * Node-side dev/test/server environment.
 *
 * For the eventual browser runtime, this module will be swapped for a
 * wa-sqlite-backed equivalent that exposes the same Drizzle interface
 * (see spec §3.4 / §6.2). The repository layer above doesn't change.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export interface DbHandle {
  /** The underlying better-sqlite3 instance. Used for raw DDL and file ops. */
  raw: Database.Database
  /** The Drizzle query builder, typed against our schema. */
  db: BetterSQLite3Database<typeof schema>
}

export function createMemoryDb(): DbHandle {
  const raw = new Database(':memory:')
  const db = drizzle(raw, { schema })
  applySchema(raw)
  return { raw, db }
}

export function createFileDb(path: string): DbHandle {
  const raw = new Database(path)
  raw.pragma('journal_mode = WAL')
  const db = drizzle(raw, { schema })
  applySchema(raw)
  return { raw, db }
}

/**
 * Push the Drizzle schema into a fresh database using raw DDL. We avoid
 * Drizzle's migration machinery for Phase 2 because the schema is small
 * and migrations are overkill until we have a real v2.
 */
function applySchema(raw: Database.Database): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      default_canvas_id TEXT NOT NULL,
      region_color_map_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      view_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_canvases_workspace ON canvases (workspace_id);
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      media_json TEXT NOT NULL DEFAULT '[]',
      links_json TEXT NOT NULL DEFAULT '[]',
      code_snippets_json TEXT NOT NULL DEFAULT '[]',
      quotes_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      source_json TEXT NOT NULL,
      captured_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      canvas_id TEXT,
      canvas_x REAL,
      canvas_y REAL,
      canvas_w REAL,
      canvas_h REAL,
      canvas_z REAL,
      canvas_rotation REAL,
      color TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_cards_workspace_inbox ON cards (workspace_id, archived);
    CREATE INDEX IF NOT EXISTS idx_cards_canvas ON cards (canvas_id);
    CREATE INDEX IF NOT EXISTS idx_cards_captured_at ON cards (captured_at);
  `)
}
