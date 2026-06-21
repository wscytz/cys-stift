'use client'

/**
 * M3.5 — Card service accessor for canvas-only code paths. Mirrors the
 * `__canvasEditor` global that the canvas editor exposes (see
 * canvas-editor.tsx onMount) — the same lifetime contract applies: the
 * `__cardService` global is set when the editor mounts, cleared when the
 * EditorBindingBridge unmounts (canvas switch / page leave).
 *
 * The auto-relate helper is the only current consumer; if a second
 * canvas-only caller needs the service, add it here rather than touching
 * the global directly.
 */

import type { CardService } from '@cys-stift/domain'

export function getCardService(): CardService | null {
  if (typeof window === 'undefined') return null
  return (
    (window as unknown as { __cardService?: CardService }).__cardService ??
    null
  )
}