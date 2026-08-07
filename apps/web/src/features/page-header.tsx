'use client'

/**
 * PageHeader — page-content 内的页面标题/操作 sub-header(Toolbar 精简后)。
 *
 * 背景:顶部原两条 —— AppMenu(全局,全宽,品牌名+导航+Capture)+ 各页 Toolbar
 * (面包屑:品牌名 / 当前页 h1)。品牌名与「你在哪」重复(AppMenu active 高亮已
 * 表达位置)。精简:删各页 Toolbar,顶部只留 AppMenu 一条全宽条;页面标题/操作
 * 收进 page-content 内的 PageHeader(居中 max-width,属内容区,不顶满宽)。
 *
 * - title → <h1>(默认 sr-only:位置靠 AppMenu active 表达,视觉不重复;需可见
 *   标题的页传 titleVisible)。
 * - actions → 右侧 slot,承接原 Toolbar 的页面操作(tablist / 按钮 / 计数 Tag)。
 * - 无 actions 且 titleVisible=false(零度页):只渲染 <h1 class="sr-only">,零视觉,
 *   a11y 保底每页一 h1(SR 靠 h1 导航)。
 *
 * 详见私有仓 plans/2026-08-07-toolbar-simplification.md。
 */
import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  /** title 是否可见(默认 false = sr-only,顶部 AppMenu active 已表达位置)。 */
  titleVisible?: boolean
  /** 右侧操作 slot(承接原 Toolbar 的页面操作)。 */
  actions?: ReactNode
}

export function PageHeader({ title, titleVisible = false, actions }: PageHeaderProps) {
  // 零度页:无操作 + sr-only 标题 → 只渲染 sr-only h1,零视觉(顶部只剩 AppMenu)。
  if (!actions && !titleVisible) {
    return <h1 className="sr-only">{title}</h1>
  }
  return (
    <div className="ph">
      <h1 className={titleVisible ? 'ph__title' : 'sr-only'}>{title}</h1>
      {actions ? <div className="ph__actions">{actions}</div> : null}
    </div>
  )
}
