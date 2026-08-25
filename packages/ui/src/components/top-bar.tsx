import type { ReactNode } from 'react'
import styles from './top-bar.module.css'

export interface TopBarProps {
  /** 视图标题(DESIGN.md TopBar:视图标题优先用文字)。 */
  title: ReactNode
  /** 面包屑(如「cy's Stift / 索引」);省略则只渲染标题。 */
  crumb?: ReactNode
  /** 右侧全局动作区。 */
  actions?: ReactNode
}

/**
 * Swiss Editorial 顶栏(DESIGN.md TopBar):
 * 64px 高、1px 底线、crumb(大写 display)+ 视图标题 + 右侧动作;
 * 文字优先于图标,零阴影零圆角。
 */
export function TopBar({ title, crumb, actions }: TopBarProps) {
  return (
    <header className={styles.topbar}>
      {crumb !== undefined && (
        <span className={styles.crumb}>
          {crumb}
          <span className={styles.crumbSep} aria-hidden="true">
            /
          </span>
        </span>
      )}
      <span className={styles.title}>{title}</span>
      {actions !== undefined && <span className={styles.actions}>{actions}</span>}
    </header>
  )
}
