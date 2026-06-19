/**
 * SQLite-backed repository. Drizzle handles the SQL; the codec translates
 * rows ↔ domain entities (branded IDs + JSON columns).
 */

import { eq, and, isNull, desc, asc } from 'drizzle-orm'
import type { Card, CardId, CanvasId, Canvas as DomainCanvas, Workspace as DomainWorkspace, WorkspaceId } from '@cys-stift/domain'
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
    const row = this.handle.db
      .select()
      .from(schema.workspaces)
      .limit(1)
      .get()
    return row ? workspaceFromRow(row) : null
  }
}
