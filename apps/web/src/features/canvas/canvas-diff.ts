/**
 * 画布版本 diff(转义独占能力)。转义让画布=文字,两个画布状态能做 diff——
 * Excalidraw/tldraw/Figma 做不了(它们画布是对象图/二进制)。
 *
 * 元素级 diff:按 id 对比前后快照,分类 added/removed/changed(几何或颜色变化)。
 * 不引外部 diff 库(自研,YAGNI)。changed.fields 列出变化的字段名,供 UI 高亮。
 */
import type { CanvasElement } from '@cys-stift/canvas-engine'

export interface ChangedElement {
  id: string
  before: CanvasElement
  after: CanvasElement
  fields: string[]
}

export interface ElementDiff {
  added: CanvasElement[]
  removed: CanvasElement[]
  changed: ChangedElement[]
}

const COMPARE_FIELDS: (keyof CanvasElement)[] = [
  'x', 'y', 'w', 'h', 'rotation', 'color', 'dash', 'arrowhead', 'text', 'from', 'to',
  // 箭头路由变化(直线↔曲线↔折线 / 拖曲柄改 curve / 加折点改 elbow)需报 changed ——
  // 原漏这些字段,用户改箭头路由后版本对比显示"无变化",破坏 diff 信任。
  'route', 'curve', 'elbow',
]

export function diffCanvasSnapshots(
  before: CanvasElement[],
  after: CanvasElement[],
): ElementDiff {
  const beforeMap = new Map(before.map((e) => [e.id, e]))
  const afterMap = new Map(after.map((e) => [e.id, e]))
  const added: CanvasElement[] = []
  const removed: CanvasElement[] = []
  const changed: ChangedElement[] = []

  for (const [id, afterEl] of afterMap) {
    const beforeEl = beforeMap.get(id)
    if (!beforeEl) {
      added.push(afterEl)
      continue
    }
    const fields: string[] = []
    for (const f of COMPARE_FIELDS) {
      if (!sameValue(beforeEl[f], afterEl[f])) fields.push(String(f))
    }
    if (fields.length > 0) changed.push({ id, before: beforeEl, after: afterEl, fields })
  }
  for (const [id, beforeEl] of beforeMap) {
    if (!afterMap.has(id)) removed.push(beforeEl)
  }
  return { added, removed, changed }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // freedraw meta.points 是数组,浅比长度(精确点序列 diff 超出范围)。
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length
  return false
}
