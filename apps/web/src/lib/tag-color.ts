import { normalizeTagColor } from '@cys-stift/domain'

/**
 * Return the CSS variables used by tag chips and the foreground that keeps
 * their text readable.  Tag colors are persisted data, so this helper also
 * normalizes legacy values before they reach an inline style.
 */
export function solidTagChipStyle(color: unknown): { background: string; color: string } {
  const background = normalizeTagColor(color)
  const foreground = solidTagTextColor(background)
  return { background, color: foreground }
}

/**
 * The canonical palette has four dark solid surfaces (red/blue/black/gray)
 * and two light surfaces (yellow/white). White text on yellow is low
 * contrast, so the foreground is derived from the actual token rather than
 * from a generic "selected" class.
 */
export function solidTagTextColor(color: unknown): 'var(--color-black)' | 'var(--color-white)' {
  switch (normalizeTagColor(color)) {
    case 'var(--color-red)':
    case 'var(--color-blue)':
    case 'var(--color-black)':
    case 'var(--color-gray)':
      return 'var(--color-white)'
    default:
      return 'var(--color-black)'
  }
}

/** A one-pixel section/bar needs visible contrast even for the white chip. */
export function solidTagBarColor(color: unknown): string {
  const normalized = normalizeTagColor(color)
  return normalized === 'var(--color-white)' ? 'var(--color-gray)' : normalized
}
