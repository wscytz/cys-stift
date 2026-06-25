'use client'

import { useI18n } from '@/lib/i18n'

/**
 * Skip-to-content link (a11y). First focusable element of <body>.
 * Visually hidden off-screen until focused, then snaps into view.
 * Bauhaus: white bg, black border, red accent on focus.
 *
 * Client component so it can read the active locale from useI18n();
 * rendered by the server-component root layout.
 */
export function SkipLink() {
  const { t } = useI18n()
  return (
    <a href="#main" className="skip-link">
      {t('common.skipToContent')}
    </a>
  )
}
