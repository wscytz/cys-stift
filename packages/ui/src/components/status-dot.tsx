import type { HTMLAttributes } from 'react'
import styles from './status-dot.module.css'

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  /** accent=品牌红(未保存/live,DESIGN.md Status Indicators);secondary=中性灰 */
  tone?: 'accent' | 'secondary'
  /** live 呼吸(PRD animated 稿 breathe 3s ease-in-out;reduced-motion 静态) */
  pulse?: boolean
}

/**
 * Swiss Editorial 状态点(DESIGN.md Shapes:功能性圆是唯一的圆角例外)。
 * 6px 实心圆,置于文字左侧或卡片右上角表示未保存/live。
 * 语义应由相邻文本承载(点本身 aria-hidden 默认交给消费者)。
 */
export function StatusDot({ tone = 'accent', pulse = false, className, ...rest }: StatusDotProps) {
  return (
    <span
      {...rest}
      aria-hidden="true"
      className={`${styles.dot} ${styles[tone]} ${pulse ? styles.pulse : ''} ${className ?? ''}`}
    />
  )
}
