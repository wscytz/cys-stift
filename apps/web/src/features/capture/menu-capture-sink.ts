'use client'

import type {
  CardService,
  CardId,
  CaptureInput,
  CaptureSource,
} from '@cys-stift/domain'
import type { CaptureSink } from './capture-sink'
import { getDeviceId } from '@/lib/device-id'

/**
 * MenuCaptureSink — opens the global Mini Input from a menu bar / nav
 * action. The sink itself doesn't render UI; it just sets the source
 * discriminator so the persisted card reflects which entry-point was
 * used (spec §4.4 CaptureSource discriminated union).
 *
 * Symmetric with WebCaptureSink (Phase 6). Both implementations route
 * through `service.fromCapture` so the persistence path stays singular.
 */
export class MenuCaptureSink implements CaptureSink {
  constructor(private service: CardService) {}

  submit(input: Omit<CaptureInput, 'source'>): Promise<{ cardId: CardId }> {
    const card = this.service.fromCapture({
      ...input,
      source: { kind: 'menubar', deviceId: getDeviceId() } satisfies Extract<
        CaptureSource,
        { kind: 'menubar' }
      >,
    })
    return Promise.resolve({ cardId: card.id })
  }
}
