import { normalizeTagColor, TAG_COLORS } from '@cys-stift/domain'
import type { TagRef } from '@cys-stift/domain'

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

/**
 * 稳定派生 tag 颜色:value hash → 调色板取色(同 value 永远同色)。
 * 用于建卡时快速打标签(MiniInput / 工作台等),color 存进 TagRef。
 */
export function stableTagColor(value: string): TagRef['color'] {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length] ?? TAG_COLORS[0]!
}
