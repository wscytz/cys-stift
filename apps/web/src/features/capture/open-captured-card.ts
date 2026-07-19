'use client'

import type { CardId } from '@cys-stift/domain'
import { workbenchStore } from '@/lib/workbench-store'

interface OpenCapturedCardArgs {
  cardId: CardId | string
  origin: string
  navigate: (href: string) => void
}

/** Preserve the complete in-app return route at the moment the action runs. */
export function routeFromLocation(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
): string {
  const route = `${location.pathname}${location.search}${location.hash}`
  return route.startsWith('/') ? route : '/'
}

/** Open a captured card through the same global workbench state used elsewhere. */
export function openCapturedCardInWorkbench({
  cardId,
  origin,
  navigate,
}: OpenCapturedCardArgs): void {
  const safeOrigin = origin.startsWith('/') ? origin : '/'
  // Capturing while already editing must not replace the route we originally
  // came from with `/workbench`, otherwise the workbench back action is a no-op.
  const returnTo = safeOrigin.startsWith('/workbench')
    ? workbenchStore.getOrigin() ?? '/canvas'
    : safeOrigin

  workbenchStore.open(String(cardId), returnTo)
  navigate('/workbench')
}
