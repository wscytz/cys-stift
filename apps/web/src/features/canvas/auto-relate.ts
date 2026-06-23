'use client'

/**
 * M3.5 — Canvas auto-relate action. Given a set of selected card IDs,
 * infer a relation type for each pair (using the M2.3 keyword matcher
 * — no AI model needed) and create one arrow per pair with the inferred
 * type applied (color + text label).
 *
 * v0.32.0 (Phase 2 子4): migrated off tldraw. Arrows are now created via
 * `host.upsert` (from/to = the card id pair + inferred relation color/text).
 * `createArrowFromHandle` (tldraw-specific) is retired. Pairs that produce
 * no keyword hit are skipped (the user didn't leave enough text on the
 * cards for the heuristic to fire — better to leave the canvas alone than
 * to plant a meaningless arrow).
 *
 * CardService is passed in as an argument (kept pure + unit-testable without
 * a window object).
 */

import type { CardId, CardService } from '@cys-stift/domain'
import { inferRelationTypeFromContext } from './relation-inference'
import type { CanvasHost } from './host/canvas-host'

export interface AutoRelateResult {
  arrowsCreated: number
}

export function autoRelate(
  host: CanvasHost,
  cardIds: string[],
  service: CardService,
): AutoRelateResult {
  if (cardIds.length < 2) return { arrowsCreated: 0 }
  let created = 0
  for (let i = 0; i < cardIds.length; i++) {
    const idA = cardIds[i]
    if (!idA) continue
    for (let j = i + 1; j < cardIds.length; j++) {
      const idB = cardIds[j]
      if (!idB) continue
      const a = service.get(idA as CardId)
      const b = service.get(idB as CardId)
      if (!a || !b) continue
      const relation = inferRelationTypeFromContext(a, b)
      if (!relation) continue
      const arrowId =
        'arrow-' +
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2))
      host.upsert({
        id: arrowId,
        kind: 'arrow',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        rotation: 0,
        from: idA,
        to: idB,
        color: relation.color,
        text: relation.id,
      })
      created++
    }
  }
  return { arrowsCreated: created }
}
