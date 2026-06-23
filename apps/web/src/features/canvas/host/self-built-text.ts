// apps/web/src/features/canvas/host/self-built-text.ts
'use client'

/**
 * text(文本编辑)纯函数:度量 + IME 守卫。
 * - measureText:commit 时算 text 元素 bbox(传入 ctx 便于 mock 测)。
 * - textEditKeyAction:textarea onKeyDown 的动作判定(IME 组合态不拦截)。
 */

/** 度量文本(支持多行)的包围盒。空行按空格度量避免 0 宽。 */
export function measureText(
  text: string,
  ctx: CanvasRenderingContext2D,
  font: string,
  lineHeight: number,
): { w: number; h: number } {
  ctx.font = font
  const lines = text.split('\n')
  let w = 0
  for (const line of lines) {
    const m = ctx.measureText(line.length > 0 ? line : ' ')
    if (m.width > w) w = m.width
  }
  return { w: Math.ceil(w), h: lines.length * lineHeight }
}

/** textarea onKeyDown 动作判定。IME 组合态(isComposing)一律返回 null(不拦截)。 */
export function textEditKeyAction(e: {
  isComposing: boolean
  key: string
  metaKey: boolean
  ctrlKey: boolean
}): 'commit' | 'cancel' | null {
  if (e.isComposing) return null
  if (e.key === 'Escape') return 'cancel'
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return 'commit'
  return null
}
