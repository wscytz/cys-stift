/**
 * canvas-icons — 画布工具栏 / 侧栏 / 对齐工具条的图标(v0.39.2 跨平台适配)。
 *
 * 之前用 Unicode/emoji 字符(↖ ✎ 🗑 T ⇄ ...)当图标,Windows 上渲染成系统彩色 emoji
 * 或 Segoe UI Symbol,与 Bauhaus 黑白线条不搭且跨平台不一致。改用 lucide-react 纯
 * SVG 线条图标(1.5px 描边、currentColor),跨平台渲染一致。
 *
 * 显式 import + Map(非 import *):保 tree-shake,只打包用到的图标。
 */
import {
  MousePointer2, PenTool, Eraser, Type, ArrowRight,
  Asterisk, Square,
  Undo2, Redo2, Plus, Pencil, Trash2,
  LayoutTemplate, Download, Sparkles, Workflow, Link, Frame, List,
  LayoutGrid, Network, Braces, Upload, GitCompare, Keyboard, Loader2,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Expand,
  MoreHorizontal, Search,
  type LucideIcon,
} from 'lucide-react'

/** 画布图标 name(数据层用字符串,渲染查 Map)。 */
export type CanvasIconName =
  | 'select' | 'pen' | 'eraser' | 'text' | 'connect'
  // 橡皮子模式
  | 'erase-all' | 'erase-card'
  // 对齐分布
  | 'align-left' | 'align-center-h' | 'align-right'
  | 'align-top' | 'align-center-v' | 'align-bottom'
  | 'distribute-h' | 'distribute-v' | 'equalize'
  // 侧栏
  | 'undo' | 'redo' | 'new-canvas' | 'rename' | 'delete'
  | 'template' | 'import' | 'ai' | 'workflow' | 'relation'
  | 'frame' | 'outline' | 'overview' | 'auto-layout'
  | 'dsl' | 'export' | 'diff' | 'shortcuts' | 'search'
  | 'more'

const MAP: Record<CanvasIconName, LucideIcon> = {
  select: MousePointer2, pen: PenTool, eraser: Eraser, text: Type, connect: ArrowRight,
  'erase-all': Asterisk, 'erase-card': Square,
  'align-left': AlignHorizontalJustifyStart, 'align-center-h': AlignHorizontalJustifyCenter, 'align-right': AlignHorizontalJustifyEnd,
  'align-top': AlignVerticalJustifyStart, 'align-center-v': AlignVerticalJustifyCenter, 'align-bottom': AlignVerticalJustifyEnd,
  'distribute-h': AlignHorizontalDistributeCenter, 'distribute-v': AlignVerticalDistributeCenter, equalize: Expand,
  undo: Undo2, redo: Redo2, 'new-canvas': Plus, rename: Pencil, delete: Trash2,
  template: LayoutTemplate, import: Download, ai: Sparkles, workflow: Workflow, relation: Link,
  frame: Frame, outline: List, overview: LayoutGrid, 'auto-layout': Network,
  dsl: Braces, export: Upload, diff: GitCompare, shortcuts: Keyboard, more: MoreHorizontal, search: Search,
}

/** 画布图标。size 默认跟随 CSS(.tb-tool__icon 等);传 size 覆盖。 */
export function CanvasIcon({ name, size, strokeWidth = 1.5 }: { name: CanvasIconName; size?: number; strokeWidth?: number }) {
  const Cmp = MAP[name]
  if (!Cmp) return null
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}

/** 侧栏按钮 busy 态(AI 运行中)的旋转图标。 */
export function CanvasBusyIcon({ size }: { size?: number }) {
  return <Loader2 size={size} strokeWidth={1.5} className="cv-rail__busy-spin" aria-hidden="true" />
}
