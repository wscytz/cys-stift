/**
 * Capture-success redirect actions (spec §4.2 / plan Task 8). Builds the 3
 * inline toast actions offered after a card is captured: move to the active
 * canvas, archive, or open the card detail. Each action swallows errors and
 * routes them to `onError` (so a quota failure on redirect surfaces as an
 * error toast instead of an unhandled throw).
 *
 * z computation mirrors the timeline page: max(existing z) + 1 over the
 * cards currently on the target canvas, or 0 if none. We read the live card
 * list from the service (listAll) so the position is correct even right
 * after capture.
 */
import type { CardId, CardService, CanvasId } from '@cys-stift/domain'
import type { ToastAction } from '@/lib/toast-store'

export interface BuildRedirectArgs {
  cardId: CardId
  service: CardService
  activeCanvasId: CanvasId
  openCard: (id: CardId) => void
  onError: (message: string) => void
  /** Localized message for a persistence API that reports failure as false. */
  moveToCanvasFailedMessage?: string
}

/** Default placement geometry for a freshly-moved card (matches timeline). */
const PLACE_W = 240
const PLACE_H = 140

function nextZ(service: CardService, canvasId: CanvasId): number {
  try {
    const onCanvas = service
      .listAll()
      .filter((c) => c.canvasPosition?.canvasId === canvasId)
    if (onCanvas.length === 0) return 0
    return Math.max(...onCanvas.map((c) => c.canvasPosition?.z ?? 0)) + 1
  } catch {
    return 0
  }
}

export function buildCaptureRedirectActions(args: BuildRedirectArgs): ToastAction[] {
  const {
    cardId,
    service,
    activeCanvasId,
    openCard,
    onError,
    moveToCanvasFailedMessage,
  } = args
  const safe = (fn: () => void | boolean, falseMessage?: string) => () => {
    try {
      if (fn() === false) {
        onError(falseMessage ?? 'The action could not be completed')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      onError(msg)
    }
  }
  const z = nextZ(service, activeCanvasId)
  const stagger = z % 5
  return [
    {
      label: '→ canvas',
      onClick: safe(
        () => service.moveToCanvas(cardId, {
          canvasId: activeCanvasId,
          x: 100 + stagger * 40,
          y: 100 + stagger * 40,
          w: PLACE_W,
          h: PLACE_H,
          z,
        }),
        moveToCanvasFailedMessage ?? 'The card could not be moved to the canvas',
      ),
    },
    {
      label: '→ archive',
      onClick: safe(() => service.archive(cardId)),
    },
    {
      label: 'open',
      onClick: safe(() => openCard(cardId)),
    },
  ]
}
