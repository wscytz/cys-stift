import type { ReactNode } from 'react'
import styles from './toolbar.module.css'

export interface ToolbarProps {
  /** Region identifier — controls the 8px colour stripe on the left. */
  region?: 'capture' | 'inbox' | 'canvas' | 'archive' | 'trash' | 'system'
  children: ReactNode
}

/**
 * Top toolbar with an 8px-wide colour stripe on the left, identifying the
 * current region. Per spec §5.3.
 */
export function Toolbar({ region = 'system', children }: ToolbarProps) {
  const stripeColor = `var(--color-${regionColorForStripe(region)})`
  return (
    <div className={styles.toolbar}>
      <div
        className={styles.stripe}
        style={{ background: stripeColor }}
        aria-hidden="true"
      />
      <div className={styles.content}>{children}</div>
    </div>
  )
}

function regionColorForStripe(region: ToolbarProps['region']): string {
  // capture / inbox share red; others default per §5.2
  if (region === 'capture' || region === 'inbox') return 'red'
  if (region === 'canvas') return 'black'
  if (region === 'archive') return 'blue'
  return 'gray'
}
