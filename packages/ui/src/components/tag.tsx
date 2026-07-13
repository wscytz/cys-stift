import type { HTMLAttributes } from 'react'
import styles from './tag.module.css'
import type { ColorToken } from '../tokens'

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  color?: ColorToken
}

/**
 * Bauhaus tag: text on a soft tinted field, color-bordered. No fill, no shadow.
 *
 * a11y: the text/border color is overridden for low-contrast cases:
 *  - yellow (#ffce00) on yellow-soft (#fff8dc) = 1.34:1 (unreadable) → force black
 *  - gray (#666) on gray-soft (#d9d9d9) = 4.14:1 (fails 4.5 AA small) → force black-soft
 * The soft background stays derived from the original color (still a tinted field).
 * red/blue/black pass as-is (4.8:1 / 7:1 / high).
 */
export function Tag({ color = 'gray', children, className, ...rest }: TagProps) {
  const textColor =
    color === 'yellow'
      ? 'var(--color-black)'
      : color === 'gray'
        ? 'var(--color-black-soft)'
        : color === 'black'
          ? 'var(--color-white)'
          : `var(--color-${color})`
  const style = {
    ['--tag-color' as never]: textColor,
    ['--tag-color-soft' as never]: `var(--color-${color}-soft)`,
  }
  return (
    <span
      {...rest}
      className={`${styles.tag} ${className ?? ''}`}
      style={style}
    >
      {children}
    </span>
  )
}
