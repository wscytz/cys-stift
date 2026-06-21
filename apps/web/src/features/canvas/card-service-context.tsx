'use client'

/**
 * CardServiceContext — F1.1 (v0.26.0).
 *
 * tldraw renders each shape via its ShapeUtil.component, which only receives
 * the shape — not arbitrary app state. To let the card shape render from the
 * domain CardService (single source of truth for title/body/type/pinned),
 * the editor wraps <Tldraw> in this Provider and the card component reads
 * the service via useCardService().
 *
 * Returns null outside the provider (defensive — the card component handles
 * null by rendering a placeholder).
 */
import { createContext, useContext } from 'react'
import type { CardService } from '@cys-stift/domain'

export const CardServiceContext = createContext<CardService | null>(null)

export function useCardService(): CardService | null {
  return useContext(CardServiceContext)
}
