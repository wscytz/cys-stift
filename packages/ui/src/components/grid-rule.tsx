import type { HTMLAttributes } from 'react'
import styles from './grid-rule.module.css'

export interface GridRuleProps extends HTMLAttributes<HTMLDivElement> {
  /** h=水平规线(默认);v=垂直规线(flex/grid 内自撑高) */
  direction?: 'h' | 'v'
}

/**
 * Swiss Editorial 规线:1px border-muted 结构线,替代一切阴影/gutter 的
 * 基础原语(DESIGN.md Layout: grid lines replace standard gutters)。
 * 纯装饰,语义分隔请用语义元素(<hr>/<section>)。
 */
export function GridRule({ direction = 'h', className, ...rest }: GridRuleProps) {
  return (
    <div
      {...rest}
      aria-hidden="true"
      className={`${styles.rule} ${direction === 'v' ? styles.v : styles.h} ${className ?? ''}`}
    />
  )
}
