
import type { CanvasElement } from './canvas-host'

/** 方向键 → 偏移(1px,shift 时 10px)。非方向键 → null。 */
export function arrowKeyDelta(key: string, shift: boolean): { dx: number; dy: number } | null {
  const step = shift ? 10 : 1
  switch (key) {
    case 'ArrowUp': return { dx: 0, dy: -step }
    case 'ArrowDown': return { dx: 0, dy: step }
    case 'ArrowLeft': return { dx: -step, dy: 0 }
    case 'ArrowRight': return { dx: step, dy: 0 }
    default: return null
  }
}

/** 全选:返回所有元素 id。 */
export function selectAllIds(elements: CanvasElement[]): string[] {
  return elements.map((e) => e.id)
}

/**
 * 键盘动作判定(undo/redo/selectAll)。不判 isComposing——adapter 层守。
 * - Ctrl/Cmd+Z(无 shift)→ undo
 * - Ctrl/Cmd+Shift+Z 或 Ctrl+Y → redo
 * - Ctrl/Cmd+A → selectAll
 */
export function parseKeyboardAction(e: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}): 'undo' | 'redo' | 'selectAll' | null {
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return null
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) return 'undo'
  if ((k === 'z' && e.shiftKey) || k === 'y') return 'redo'
  if (k === 'a') return 'selectAll'
  return null
}
