import type { MessageKey } from '@/lib/i18n/messages'
import type { Card } from '@cys-stift/domain'

/**
 * Maps Card.type to i18n MessageKey for type labels.
 * Only handles the 5 known types; anything unknown falls back to 'note'.
 */
export function typeKeyOf(type: Card['type']): MessageKey {
  switch (type) {
    case 'note': return 'card.typeNote'
    case 'image': return 'card.typeImage'
    case 'link': return 'card.typeLink'
    case 'code': return 'card.typeCode'
    case 'quote': return 'card.typeQuote'
    default: return 'card.typeNote'
  }
}
