import type {
  Card,
  CanvasId,
  CanvasPosition,
  CreateCardInput,
} from '@cys-stift/domain'
// B-4:画布放置规划提到 features/canvas(未放置面板复用 collision-aware 排版),
// 这里 re-export 保持 inbox page / inbox-logic.test 的既有 import 不破。
export { nextCanvasZ, planInboxCanvasPlacements } from '@/features/canvas/canvas-placement'
// applyInboxCanvasPlacements 的签名仍用该类型(re-export 不建本地绑定,需显式 import)。
import type { InboxCanvasPlacement } from '@/features/canvas/canvas-placement'

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

function finiteDateTime(value: Date): number {
  const time = value instanceof Date ? value.getTime() : Number.NaN
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}
