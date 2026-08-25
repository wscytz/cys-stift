import { useId, type KeyboardEvent, type ReactNode } from 'react'
import styles from './tabs.module.css'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
}

export interface TabsProps<T extends string> {
  /** 项集合(顺序即渲染顺序)。 */
  tabs: readonly TabItem<T>[]
  active: T
  onChange: (id: T) => void
  /** tablist 的无障碍名(视图切换语境,如「收件箱视图」)。 */
  ariaLabel: string
}

/**
 * Swiss Editorial 标签页(DESIGN.md Data Tables/Typography 衍生):
 * 48px 行高、大写 display 字体、激活项 2px 手术红底线;hover 变墨、按压 100ms scale。
 * 键盘:左右箭头在标签间移动并激活(roving 由激活代替,免 tabindex 管理)。
 */
export function Tabs<T extends string>({ tabs, active, onChange, ariaLabel }: TabsProps<T>) {
  const listId = useId()
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = tabs.findIndex((t) => t.id === active)
    if (idx < 0) return
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (dir === 0) return
    e.preventDefault()
    const next = tabs[(idx + dir + tabs.length) % tabs.length]
    if (next) onChange(next.id)
  }
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${listId}-${t.id}`}
          aria-selected={t.id === active}
          className={styles.tab}
          onClick={() => onChange(t.id)}
          onKeyDown={onKeyDown}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
