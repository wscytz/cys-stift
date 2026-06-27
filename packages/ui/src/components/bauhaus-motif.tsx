import styles from './bauhaus-motif.module.css'

export type BauhausMotifVariant = 'still' | 'pulse' | 'overlap' | 'linear' | 'orbit'

export interface BauhausMotifProps {
  /** variant: still/pulse=原三形横排;overlap=重叠构图(Kandinsky);linear=线条(Bayer);orbit=圆叠加(Itten) */
  variant?: BauhausMotifVariant
  /** 像素宽。overlap/orbit 按正方渲染;still/pulse/linear 按原比例。默认 112。 */
  size?: number
}

/**
 * Bauhaus 几何装饰 —— 多 variant 覆盖不同美学。原 still/pulse(三形横排)保留
 * 向后兼容;overlap/linear/orbit 是更精致的构图(形状重叠/线条/圆叠加)。
 * 纯 SVG + CSS 变量(主题感知),prefers-reduced-motion 降级。
 */
export function BauhausMotif({ variant = 'still', size = 112 }: BauhausMotifProps) {
  const className = [styles.motif, styles[variant] ?? '', variant === 'pulse' ? styles.pulse : '']
    .filter(Boolean)
    .join(' ')

  // overlap/orbit:正方构图(size×size);still/pulse/linear:原比例(size×size*40/112)
  const isSquare = variant === 'overlap' || variant === 'orbit'
  const h = isSquare ? size : Math.round((size * 40) / 112)

  if (variant === 'overlap') {
    // Kandinsky 风:大圆居中,三角穿入左上,方叠加右下,半透明层次
    return (
      <svg className={className} width={size} height={h} viewBox="0 0 80 80" fill="none" aria-hidden="true">
        <circle className={styles.sqr} cx="40" cy="44" r="26" opacity="0.85" />
        <polygon className={styles.tri} points="10,30 32,6 44,34" opacity="0.9" />
        <rect className={styles.cir} x="46" y="42" width="24" height="24" opacity="0.85" />
      </svg>
    )
  }
  if (variant === 'linear') {
    // Bayer 风:描边三形 + 横线贯穿
    return (
      <svg className={className} width={size} height={h} viewBox="0 0 120 40" fill="none" aria-hidden="true">
        <line x1="4" y1="20" x2="116" y2="20" className={styles.lineStroke} strokeWidth="1" />
        <polygon points="12,32 26,8 40,32" className={styles.triStroke} />
        <circle cx="60" cy="20" r="12" className={styles.cirStroke} />
        <rect x="82" y="10" width="24" height="24" className={styles.sqrStroke} />
      </svg>
    )
  }
  if (variant === 'orbit') {
    // Itten 风:三圆部分重叠,mix-blend-mode 产生中间色
    return (
      <svg className={className} width={size} height={h} viewBox="0 0 80 80" fill="none" aria-hidden="true" style={{ mixBlendMode: 'multiply' }}>
        <circle className={styles.tri} cx="30" cy="32" r="22" opacity="0.9" />
        <circle className={styles.cir} cx="50" cy="32" r="22" opacity="0.9" />
        <circle className={styles.sqr} cx="40" cy="52" r="22" opacity="0.9" />
      </svg>
    )
  }
  // 默认 still/pulse:原三形横排
  return (
    <svg className={className} width={size} height={h} viewBox="0 0 112 40" fill="none" aria-hidden="true">
      <polygon className={styles.tri} points="6,36 22,5 38,36" />
      <circle className={styles.cir} cx="58" cy="20" r="15" />
      <rect className={styles.sqr} x="78" y="5" width="30" height="30" />
    </svg>
  )
}
