'use client'

/**
 * M3.5 — Canvas auto-relate action. Given a set of selected card IDs,
 * infer a relation type for each pair (using the M2.3 keyword matcher
 * — no AI model needed) and create one arrow per pair with the inferred
 * type applied.
 *
 * Reuses M2.1's `createArrowFromHandle` so the arrow + 2-binding
 * construction stays in one verified place. Pairs that produce no
 * keyword hit are skipped (the user didn't leave enough text on the
 * cards for the heuristic to fire — better to leave the canvas alone
 * than to plant a meaningless arrow).
 */

import type { Editor, TLShapeId } from '@tldraw/tldraw'
import type { Card, CardId } from '@cys-stift/domain'
import { inferRelationTypeFromContext } from './relation-inference'
import { applyRelationType } from './relation-types'
import { createArrowFromHandle } from './card-handles'
import { getCardService } from './card-service-access'

export interface AutoRelateResult {
  arrowsCreated: number
}

export function autoRelate(
  editor: Editor,
  cardIds: string[],
): AutoRelateResult {
  if (cardIds.length < 2) return { arrowsCreated: 0 }
  const svc = getCardService()
  if (!svc) return { arrowsCreated: 0 }
  let created = 0
  for (let i = 0; i < cardIds.length; i++) {
    const idA = cardIds[i]
    if (!idA) continue
    for (let j = i + 1; j < cardIds.length; j++) {
      const idB = cardIds[j]
      if (!idB) continue
      const a: Card | null = svc.get(idA as CardId)
      const b: Card | null = svc.get(idB as CardId)
      if (!a || !b) continue
      const relation = inferRelationTypeFromContext(a, b)
      if (!relation) continue
      const targetBounds = editor.getShapePageBounds(
        `shape:${idB}` as TLShapeId,
      )
      if (!targetBounds) continue
      const arrowId = createArrowFromHandle(editor, idA as CardId, targetBounds.center)
      if (arrowId) {
        applyRelationType(editor, arrowId, relation, relation.id)
        created++
      }
    }
  }
  return { arrowsCreated: created }
}