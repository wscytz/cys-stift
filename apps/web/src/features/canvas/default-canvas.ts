import { toCanvasId } from '@cys-stift/domain'

/**
 * MVP single canvas (spec §1.4). A stable default canvas id so cards placed on
 * the canvas round-trip across reloads via `card.canvasPosition.canvasId`.
 * Multi-canvas UI is post-MVP (schema already supports it, spec §4.9).
 */
export const DEFAULT_CANVAS_ID = toCanvasId('default-canvas')
