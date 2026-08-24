import type { HTMLAttributes } from 'react'
import styles from './tag.module.css'
import type { ColorToken } from '../tokens'

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  color?: ColorToken
}

/**
 * Swiss Editorial tag: text on a soft tinted field, color-bordered. No fill, no shadow.
 *
 * a11y:文字/边框色对低对比情况单独覆盖(soft 背景仍派生自原色,是 tinted field)。
 * 数值按 Swiss Editorial 色板(v0.2 重算):
 *  - yellow (#8f706b) on yellow-soft (#e4beb9) ≈ 2.5:1(不可读)→ force ink
 *  - gray (#5e5e5c) on gray-soft (#dbdad7) ≈ 4.7:1(勉强过 AA,近阈值)→ 保守 force
 *    on-surface-variant(守卫保留:小字 12px 上限即下,别赌余量)
 *  - black (#1b1c1a) on black-soft (#5b403c) ≈ 1.8:1(不可读)→ force paper  ← v0.59 bug 2 修
 * red/blue pass as-is(均 ≈5.2:1)。
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
