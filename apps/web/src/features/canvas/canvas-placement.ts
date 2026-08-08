import type { Card, CanvasId, CanvasPosition } from '@cys-stift/domain'

// ── canvas 卡片放置规划(B-4 安全增量,从 app/inbox/inbox-logic 抽出共享)──────────
// 原本只在 inbox 批量「发送到画布」用;canvas「未放置」面板按同一套 collision-aware
// 自动排版放卡,故提到 features/canvas(features 层不得依赖 app 层)。

/** Return the first free z layer, ignoring malformed persisted values. */
export function nextCanvasZ(
  cards: readonly Pick<Card, 'canvasPosition'>[],
): number {
  let max = Number.NEGATIVE_INFINITY
  for (const card of cards) {
    const z = card.canvasPosition?.z
    if (typeof z === 'number' && Number.isFinite(z)) max = Math.max(max, z)
  }
  return Number.isFinite(max) ? max + 1 : 0
}

export interface InboxCanvasPlacement {
  cardId: string
  position: CanvasPosition
}

const BATCH_CARD_W = 200
const BATCH_CARD_H = 80
const BATCH_ORIGIN_X = 100
const BATCH_ORIGIN_Y = 100
const BATCH_STEP_X = 240
const BATCH_STEP_Y = 120
const BATCH_COLUMNS = 5

/**
 * Allocate a deterministic grid for an inbox batch (or canvas「未放置」面板单卡)。
 * Existing cards are treated as occupied rectangles, so the first free slot is
 * chosen instead of stacking every fifth card at the same coordinates.
 */
export function planInboxCanvasPlacements(
  cardIds: readonly string[],
  existing: readonly Pick<Card, 'canvasPosition'>[],
  canvasId: CanvasId,
): InboxCanvasPlacement[] {
  const occupied = existing
    .map((card) => card.canvasPosition)
    .filter((position): position is CanvasPosition => isUsablePosition(position))
  const startZ = nextCanvasZ(existing)
  const placements: InboxCanvasPlacement[] = []
  let slot = 0

  for (const cardId of cardIds) {
    while (true) {
      const column = slot % BATCH_COLUMNS
      const row = Math.floor(slot / BATCH_COLUMNS)
      const candidate: CanvasPosition = {
        canvasId,
        x: BATCH_ORIGIN_X + column * BATCH_STEP_X,
        y: BATCH_ORIGIN_Y + row * BATCH_STEP_Y,
        w: BATCH_CARD_W,
        h: BATCH_CARD_H,
        z: startZ + placements.length,
      }
      slot++
      if (occupied.every((other) => !rectanglesOverlap(candidate, other))) {
        occupied.push(candidate)
        placements.push({ cardId, position: candidate })
        break
      }
    }
  }
  return placements
}

function isUsablePosition(position: CanvasPosition | undefined): position is CanvasPosition {
  return Boolean(
    position &&
      Number.isFinite(position.x) &&
      Number.isFinite(position.y) &&
      Number.isFinite(position.w) &&
      Number.isFinite(position.h) &&
      position.w > 0 &&
      position.h > 0,
  )
}

function rectanglesOverlap(a: CanvasPosition, b: CanvasPosition): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}
