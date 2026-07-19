import type {
  Card,
  CanvasId,
  CanvasPosition,
  CreateCardInput,
} from '@cys-stift/domain'

/** A card placement read from an inbox `[card ... create]` DSL line. */
export interface InboxCardPlacement {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Build the domain input for a pasted card without hard-coding a device id. */
export function buildInboxCardCreateInput(
  placement: InboxCardPlacement,
  canvasId: CanvasId,
  deviceId: string,
): CreateCardInput {
  return {
    title: '',
    source: { kind: 'manual', deviceId },
    canvasPosition: {
      canvasId,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      z: 0,
      rotation: 0,
    },
  }
}

/**
 * Parse the card-create subset accepted by the inbox paste bridge.
 *
 * The inbox intentionally does not apply arbitrary canvas DSL. It only
 * accepts card creation lines and leaves the other DSL forms to /canvas.
 * Keep the parser permissive for omitted position/size, matching the legacy
 * bridge defaults.
 */
export function parseInboxCardCreateLines(text: string): InboxCardPlacement[] {
  const placements: InboxCardPlacement[] = []
  for (const line of text.split('\n')) {
    if (!/^\s*\[card\b/i.test(line) || !/\bcreate\b/.test(line)) continue
    const idMatch = line.match(/#([a-zA-Z0-9_-]+)/)
    if (!idMatch) continue
    const posMatch = line.match(/@pos\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/)
    const sizeMatch = line.match(/@size\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/)
    placements.push({
      id: idMatch[1]!,
      x: posMatch ? Number(posMatch[1]) : 0,
      y: posMatch ? Number(posMatch[2]) : 0,
      w: sizeMatch ? Number(sizeMatch[1]) : 240,
      h: sizeMatch ? Number(sizeMatch[2]) : 120,
    })
  }
  return placements
}

/**
 * Apply parsed placements until the first persistence failure.
 *
 * `create` may return false for a skipped placement (for example an id that
 * already exists). Any thrown error stops the batch so a quota failure cannot
 * turn into an unhandled paste event or claim that later cards were saved.
 */
export function applyInboxCardPlacements(
  placements: readonly InboxCardPlacement[],
  create: (placement: InboxCardPlacement) => boolean | void,
): { created: number; stopped: boolean } {
  let created = 0
  for (const placement of placements) {
    try {
      if (create(placement) !== false) created++
    } catch {
      return { created, stopped: true }
    }
  }
  return { created, stopped: false }
}

/**
 * Stable capturedAt-descending order for archive/inbox views.
 * Invalid dates are kept at the end instead of producing a NaN comparator.
 */
export function sortCardsByCapturedAtDesc<T extends Pick<Card, 'capturedAt'>>(
  cards: readonly T[],
): T[] {
  return cards
    .map((card, index) => ({ card, index, time: finiteDateTime(card.capturedAt) }))
    .sort((a, b) => {
      if (a.time === b.time) return a.index - b.index
      if (a.time === Number.NEGATIVE_INFINITY) return 1
      if (b.time === Number.NEGATIVE_INFINITY) return -1
      return b.time - a.time
    })
    .map(({ card }) => card)
}

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

export interface InboxCanvasUndoResult {
  restored: number
  failed: number
  alreadyUndone: boolean
}

export interface InboxCanvasMoveResult {
  movedIds: string[]
  failedIds: string[]
  undo: () => InboxCanvasUndoResult
}

const BATCH_CARD_W = 200
const BATCH_CARD_H = 80
const BATCH_ORIGIN_X = 100
const BATCH_ORIGIN_Y = 100
const BATCH_STEP_X = 240
const BATCH_STEP_Y = 120
const BATCH_COLUMNS = 5

/**
 * Allocate a deterministic grid for an inbox batch. Existing cards are
 * treated as occupied rectangles, so the first free slot is chosen instead
 * of stacking every fifth card at the same coordinates.
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

/**
 * Apply planned placements and return a one-shot undo closure. A persistence
 * failure stops later writes (quota failures should not produce a toast per
 * remaining card). The remove callback receives the original placement so
 * callers can refuse to undo a card moved again after the batch.
 */
export function applyInboxCanvasPlacements(
  placements: readonly InboxCanvasPlacement[],
  move: (placement: InboxCanvasPlacement) => boolean | void,
  remove: (placement: InboxCanvasPlacement) => boolean | void,
): InboxCanvasMoveResult {
  const moved: InboxCanvasPlacement[] = []
  const failedIds: string[] = []

  for (let index = 0; index < placements.length; index++) {
    const placement = placements[index]!
    try {
      if (move(placement) === false) {
        failedIds.push(...placements.slice(index).map((item) => item.cardId))
        break
      }
      moved.push(placement)
    } catch {
      failedIds.push(...placements.slice(index).map((item) => item.cardId))
      break
    }
  }

  let undone = false
  const undo = (): InboxCanvasUndoResult => {
    if (undone) return { restored: 0, failed: 0, alreadyUndone: true }
    undone = true
    let restored = 0
    let failed = 0
    for (const placement of moved) {
      try {
        if (remove(placement) === false) failed++
        else restored++
      } catch {
        failed++
      }
    }
    return { restored, failed, alreadyUndone: false }
  }

  return {
    movedIds: moved.map((placement) => placement.cardId),
    failedIds,
    undo,
  }
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

function finiteDateTime(value: Date): number {
  const time = value instanceof Date ? value.getTime() : Number.NaN
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}
