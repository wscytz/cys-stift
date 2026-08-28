import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
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
  /** 可选面板内容:传入时渲染 role="tabpanel" 并双向接线 aria-controls/aria-labelledby。 */
  children?: ReactNode
}

/**
 * Swiss Editorial 标签页(DESIGN.md Data Tables/Typography 衍生):
 * 48px 行高、大写 display 字体、激活项 2px 手术红底线;hover 变墨、按压 100ms scale。
 * 键盘(WAI-ARIA tabs 模式,选中随焦点):←/→ 在标签间移动并激活,Home/End 跳首/尾;
 * roving tabindex —— 激活项 tabIndex=0,其余 -1,Tab 只在 tablist 停留一站。
 */
export function Tabs<T extends string>({ tabs, active, onChange, ariaLabel, children }: TabsProps<T>) {
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const tabRefs = useRef(new Map<T, HTMLButtonElement>())
  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = tabs.findIndex((t) => t.id === active)
    if (idx < 0) return
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const home = e.key === 'Home'
    const end = e.key === 'End'
    if (dir === 0 && !home && !end) return
    e.preventDefault()
    const next = home ? tabs[0] : end ? tabs[tabs.length - 1] : tabs[(idx + dir + tabs.length) % tabs.length]
    if (!next) return
    tabRefs.current.get(next.id)?.focus()
    onChange(next.id)
  }
  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label={ariaLabel}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el)
              else tabRefs.current.delete(t.id)
            }}
            type="button"
            role="tab"
            id={`${baseId}-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={children ? panelId : undefined}
            tabIndex={t.id === active ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(t.id)}
            onKeyDown={move}
          >
            {t.label}
          </button>
        ))}
      </div>
      {children && (
        <div role="tabpanel" id={panelId} aria-labelledby={`${baseId}-${active}`}>
          {children}
        </div>
      )}
    </>
  )
}
