'use client'

/**
 * PageHeader — Toolbar 精简后的页面标题。
 *
 * 顶部只留 AppMenu 一条全宽条(品牌名+导航+Capture,active 高亮标当前页),
 * 各页不再有可见标题条 —— 位置靠 AppMenu active 表达。本组件渲染 sr-only
 * <h1>(a11y 保底每页一 h1,SR 靠标题导航)。
 *
 * 页面操作(计数/tab/按钮)已全部融入内容区(.ph-meta,无边框贴内容),不占
 * 独立条。详见 plans/2026-08-07-toolbar-simplification.md。
 */
export function PageHeader({ title }: { title: string }) {
  return <h1 className="sr-only">{title}</h1>
}
