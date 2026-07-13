import type { HTMLAttributes } from 'react'
import styles from './tag.module.css'
import type { ColorToken } from '../tokens'

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  color?: ColorToken
}

/**
 * Bauhaus tag: text on a soft tinted field, color-bordered. No fill, no shadow.
 *
 * a11y:文字/边框色对低对比情况单独覆盖(soft 背景仍派生自原色,是 tinted field):
 *  - yellow (#ffce00) on yellow-soft (#fff8dc) = 1.34:1(不可读)→ force black
 *  - gray (#666) on gray-soft (#d9d9d9) = 4.14:1(< 4.5 AA 小字)→ force black-soft
 *  - black (#0a0a0a) on black-soft (#2b2b2b) = ~1.5:1(不可读)→ force white  ← v0.59 bug 2 修
 * red/blue pass as-is(4.8:1 / 7:1)。
 * (旧注释「black pass as-is high」是错的 —— black on black-soft 不可读,已修 + 加守卫测。)
 */

/** Tag 文字色纯函数。导出供单测(防黑底黑字回归)。 */
export function tagTextColor(color: ColorToken): string {
  return color === 'yellow'
    ? 'var(--color-black)'
    : color === 'gray'
      ? 'var(--color-black-soft)'
      : color === 'black'
        ? 'var(--color-white)'
        : `var(--color-${color})`
}

export function Tag({ color = 'gray', children, className, ...rest }: TagProps) {
  const textColor = tagTextColor(color)
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
