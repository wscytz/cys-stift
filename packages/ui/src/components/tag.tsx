import type { HTMLAttributes } from 'react'
import styles from './tag.module.css'
import type { ColorToken } from '../tokens'

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  color?: ColorToken
}

/**
 * Bauhaus tag: text on a soft tinted field, color-bordered. No fill, no shadow.
 */
export function Tag({ color = 'gray', children, className, ...rest }: TagProps) {
  const style = {
    ['--tag-color' as never]: `var(--color-${color})`,
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
