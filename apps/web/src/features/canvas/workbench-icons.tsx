/**
 * workbench-icons — 工作台 / markdown 编辑器 / 标签管理的图标 hub。
 *
 * 沿用 canvas-icons 的模式：显式 named import + Record Map，保 tree-shake；
 * 线宽 1.5（匹配 Bauhaus 黑白线条 + canvas-icons）。跨平台渲染一致。
 * lucide-react 已装于 apps/web（v0.39.2 起画布页在用）。
 */
import {
  Bold, Italic, Strikethrough, Code, Link2, Heading2,
  List, ListChecks, Quote, Code2, Table,
  Maximize2, Minimize2, Search, Plus, Pencil, Trash2,
  type LucideIcon,
} from 'lucide-react'

/** 工作台图标 name（数据层用字符串，渲染查 Map）。 */
export type WorkbenchIconName =
  // markdown 工具栏
  | 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'h2'
  | 'ul' | 'task' | 'quote' | 'codeblock' | 'table'
  // 通用动作
  | 'expand' | 'collapse' | 'search' | 'plus' | 'pencil' | 'trash'

const MAP: Record<WorkbenchIconName, LucideIcon> = {
  bold: Bold, italic: Italic, strike: Strikethrough, code: Code, link: Link2, h2: Heading2,
  ul: List, task: ListChecks, quote: Quote, codeblock: Code2, table: Table,
  expand: Maximize2, collapse: Minimize2, search: Search, plus: Plus, pencil: Pencil, trash: Trash2,
}

/** 工作台图标。size 默认跟随 CSS；传 size 覆盖。strokeWidth 默认 1.5。 */
export function WorkbenchIcon({
  name,
  size,
  strokeWidth = 1.5,
}: {
  name: WorkbenchIconName
  size?: number
  strokeWidth?: number
}) {
  const Cmp = MAP[name]
  if (!Cmp) return null
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}
