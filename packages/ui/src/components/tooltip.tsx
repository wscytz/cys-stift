import type { ReactNode } from 'react'
import styles from './tooltip.module.css'

export interface TooltipProps {
  label: ReactNode
  children: ReactNode
}

/**
 * Bauhaus tooltip: black background, white text, 2px radius. Wrap any focusable
 * element to label it on hover/focus.
 */
export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className={styles.wrap}>
      {children}
      <span role="tooltip" className={styles.tip}>
        {label}
      </span>
    </span>
  )
}
