import type { CanvasElement } from '@cys-stift/canvas-engine'
import { normalizeBox } from '@cys-stift/canvas-engine'

/**
 * A member belongs to a frame only when its entire normalized bounding box is
 * inside the frame. Rotation is deliberately approximated by its axis-aligned
 * box: this is the existing export rule, now shared by scoped AI reads too.
 */
export function isFullyInsideFrame(member: CanvasElement, frame: CanvasElement): boolean {
  if (frame.kind !== 'frame') return false
  const memberBox = normalizeBox(member)
  const frameBox = normalizeBox(frame)
  return (
    memberBox.x >= frameBox.x &&
    memberBox.y >= frameBox.y &&
    memberBox.x + memberBox.w <= frameBox.x + frameBox.w &&
    memberBox.y + memberBox.h <= frameBox.y + frameBox.h
  )
}
