/**
 * SQLite-backed repository. Drizzle handles the SQL; the codec translates
 * rows ↔ domain entities (branded IDs + JSON columns).
 */

import { eq, and, isNull, desc, asc } from 'drizzle-orm'
import type { Card, CardBatchChange, CardId, CanvasId, Canvas as DomainCanvas, Workspace as DomainWorkspace, WorkspaceId } from '@cys-stift/domain'
import type { CardRepository } from '@cys-stift/domain'
import type { CanvasRepository } from '@cys-stift/domain'
import type { WorkspaceRepository } from '@cys-stift/domain'
import * as schema from './schema'
import { cardFromRow, cardToRow, canvasFromRow, canvasToRow, workspaceFromRow, workspaceToRow } from './codec'
import type { DbHandle } from './drizzle-client'

export class SqliteCardRepository implements CardRepository {
  constructor(private handle: DbHandle) {}

  insert(card: Card) {
    this.handle.db.insert(schema.cards).values(cardToRow(card)).run()
  }

  update(card: Card) {
    const row = cardToRow(card)
    this.handle.db
      .update(schema.cards)
      .set(row)
      .where(eq(schema.cards.id, card.id))
      .run()
  }

  delete(id: CardId) {
    this.handle.db.delete(schema.cards).where(eq(schema.cards.id, id)).run()
  }

  getById(id: CardId) {
    const row = this.handle.db
      .select()
      .from(schema.cards)
      .where(eq(schema.cards.id, id))
      .get()
    return row ? cardFromRow(row) : null
  }

  listInbox() {
    const rows = this.handle.db
      .select()
      .from(schema.cards)
      .where(
        and(
          isNull(schema.cards.canvasId),
          eq(schema.cards.archived, false),
          isNull(schema.cards.deletedAt),
        ),
      )
      .orderBy(desc(schema.cards.capturedAt))
      .all()
    return rows.map(cardFromRow)
  }

  listOnCanvas(canvasId: CanvasId) {
    const rows = this.handle.db
      .select()
      .from(schema.cards)
      .where(
        and(
          eq(schema.cards.canvasId, canvasId),
          isNull(schema.cards.deletedAt),
        ),
      )
      .orderBy(asc(schema.cards.canvasZ))
      .all()
    return rows.map(cardFromRow)
  }

  listAll() {
    const rows = this.handle.db.select().from(schema.cards).all()
    return rows
      .filter((r) => r.deletedAt == null)
      .map(cardFromRow)
  }

  applyBatch(changes: CardBatchChange[]): boolean {
    const equal = (left: Card | null, right: Card | null) => {
      if (!left || !right) return left === right
      return JSON.stringify(cardToRow(left)) === JSON.stringify(cardToRow(right))
    }
    return this.handle.raw.transaction(() => {
      for (const change of changes) {
        if (!equal(this.getById(change.id), change.expected)) return false
      }
      for (const change of changes) {
        if (change.next && change.expected) this.update(change.next)
        else if (change.next) this.insert(change.next)
        else this.delete(change.id)
      }
      return true
    })()
  }
}

export class SqliteCanvasRepository implements CanvasRepository {
  constructor(private handle: DbHandle) {}

  insert(canvas: DomainCanvas) {
    this.handle.db.insert(schema.canvases).values(canvasToRow(canvas)).run()
  }

  getById(id: CanvasId) {
    const row = this.handle.db
      .select()
      .from(schema.canvases)
      .where(eq(schema.canvases.id, id))
      .get()
    return row ? canvasFromRow(row) : null
  }

  listByWorkspace(workspaceId: WorkspaceId) {
    const rows = this.handle.db
      .select()
      .from(schema.canvases)
      .where(eq(schema.canvases.workspaceId, workspaceId))
      .all()
    return rows.map(canvasFromRow)
  }
}

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  constructor(private handle: DbHandle) {}

  insert(workspace: DomainWorkspace) {
    this.handle.db.insert(schema.workspaces).values(workspaceToRow(workspace)).run()
  }

  getById(id: WorkspaceId) {
    const row = this.handle.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, id))
      .get()
    return row ? workspaceFromRow(row) : null
  }

  getDefault() {
    // ORDER BY createdAt asc so "default" is deterministic (the earliest
    // workspace) instead of "whatever row SQLite returns first". MVP has a
    // single workspace, but this future-proofs multi-workspace. (v0.37.0 review.)
    const row = this.handle.db
      .select()
      .from(schema.workspaces)
      .orderBy(asc(schema.workspaces.createdAt))
      .limit(1)
      .get()
    return row ? workspaceFromRow(row) : null
  }
}
