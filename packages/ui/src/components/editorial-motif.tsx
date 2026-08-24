import styles from './editorial-motif.module.css'

export type EditorialMotifVariant = 'mark' | 'grid' | 'rule'

export interface EditorialMotifProps {
  /** variant:mark=品牌记号(红点+墨斜杠);grid=1px 网格+红点交点;rule=编辑基线组 */
  variant?: EditorialMotifVariant
  /** 像素宽,正方(mark/grid)或 3:1(rule)。默认 112。 */
  size?: number
}

/**
 * Swiss Editorial 装饰记号 —— 替代 BauhausMotif(后者保留为弃用别名)。
 * 纯 SVG + CSS 变量(零裸 hex),静态(brutalist 克制:装饰不动)。
 * - mark:favicon/品牌图标的记号语言 —— 暖纸底、一道锋利墨斜杠、一枚精确红点。
 * - grid:结构网格自指 —— 1px 弱线网格 + 一个红点落在交点上(蓝图感)。
 * - rule:编辑排版基线 —— 粗细递变的水平规线 + 基线红点。
 */
export function EditorialMotif({ variant = 'mark', size = 112 }: EditorialMotifProps) {
  const isRule = variant === 'rule'
  const h = isRule ? Math.round(size / 3) : size

  if (variant === 'grid') {
    return (
      <svg className={styles.motif} width={size} height={h} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        {/* 竖线 ×4 + 横线 ×5,交点红点 —— 网格是结构的,红点是唯一的强调 */}
        {[24, 48, 72, 96].map((x) => (
          <line key={`v${x}`} x1={x} y1="8" x2={x} y2="112" className={styles.ruleLine} strokeWidth="1" />
        ))}
        {[24, 48, 72, 96].map((y) => (
          <line key={`h${y}`} x1="8" y1={y} x2="112" y2={y} className={styles.ruleLine} strokeWidth="1" />
        ))}
        <circle cx="72" cy="48" r="5" className={styles.dot} />
      </svg>
    )
  }

  if (variant === 'rule') {
    return (
      <svg className={styles.motif} width={size} height={h} viewBox="0 0 120 40" fill="none" aria-hidden="true">
        <line x1="0" y1="8" x2="120" y2="8" className={styles.inkStroke} strokeWidth="2" />
        <line x1="0" y1="20" x2="120" y2="20" className={styles.ruleLine} strokeWidth="1" />
        <line x1="0" y1="32" x2="120" y2="32" className={styles.ruleLine} strokeWidth="1" />
        <circle cx="12" cy="32" r="4" className={styles.dot} />
      </svg>
    )
  }

  // mark(默认):墨斜杠 + 红点,品牌记号
  return (
    <svg className={styles.motif} width={size} height={h} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <rect x="0" y="0" width="80" height="80" className={styles.paper} />
      <line x1="16" y1="64" x2="64" y2="16" className={styles.inkStroke} strokeWidth="6" />
      <circle cx="58" cy="22" r="7" className={styles.dot} />
    </svg>
  )
}
