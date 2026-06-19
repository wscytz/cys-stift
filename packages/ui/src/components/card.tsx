import type { HTMLAttributes, ReactNode } from 'react'
import styles from './card.module.css'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  heading?: ReactNode
  children?: ReactNode
}

/**
 * Bauhaus card: white field, hairline border, Space Grotesk title.
 * Use for Inbox cards, panel headers, anything that groups content.
 */
export function Card({ heading, children, className, ...rest }: CardProps) {
  return (
    <div {...rest} className={`${styles.card} ${className ?? ''}`}>
      {heading && <h3 className={styles.title}>{heading}</h3>}
      <div className={styles.body}>{children}</div>
    </div>
  )
}
