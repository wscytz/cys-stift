import styles from './bauhaus-motif.module.css'

export type BauhausMotifVariant = 'still' | 'pulse'

export interface BauhausMotifProps {
  /** `'still'` 空状态点缀;`'pulse'` 三形错峰呼吸,可当轻量 loader。 */
  variant?: BauhausMotifVariant
  /** 像素宽(高按 40/112 比例跟)。默认 112。 */
  size?: number
}

/**
 * Bauhaus 基础形三联 —— 黄三角 / 红圆 / 蓝方(Itten 的 Farbformen,包豪斯
 * 最经典的几何符号)。空状态与加载态的装饰点缀。
 *
 * 纯 SVG + CSS 颜色变量(浅/深主题自动适配),无裸 hex。`pulse` 变体三形
 * 错峰呼吸;尊重 prefers-reduced-motion(降级为静态)。
 */
export function BauhausMotif({ variant = 'still', size = 112 }: BauhausMotifProps) {
  const h = Math.round((size * 40) / 112)
  const className = [styles.motif, variant === 'pulse' ? styles.pulse : '']
    .filter(Boolean)
    .join(' ')
  return (
    <svg
      className={className}
      width={size}
      height={h}
      viewBox="0 0 112 40"
      fill="none"
      aria-hidden="true"
    >
      <polygon className={styles.tri} points="6,36 22,5 38,36" />
      <circle className={styles.cir} cx="58" cy="20" r="15" />
      <rect className={styles.sqr} x="78" y="5" width="30" height="30" />
    </svg>
  )
}
