'use client'

import type { CanvasElement, CanvasView } from './canvas-host'

/**
 * 纯渲染函数:把元素画到 ctx 上,带相机(pan/zoom)变换。
 * - 先 clearRect 整个画布(背景色)。
 * - save → translate(panX,panY) → scale(zoom) → 画元素 → restore。
 * - card = 圆角矩形 + 标签(从 getCardLabel);rect = 矩形。其它 kind 本期不画。
 *
 * 纯函数(无 DOM 副作用)以便单测(mock ctx)。
 *
 * 颜色/字体走设计 token(readToken 读 CSS 变量),不在绘制路径写裸 hex;
 * 仅 readToken 的 fallback 形参里保留 hex 兜底。
 */
export function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  view: CanvasView,
  cssWidth: number,
  cssHeight: number,
  getCardLabel: (id: string) => string,
  background: string,
): void {
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, cssWidth, cssHeight)

  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  for (const el of elements) {
    drawElement(ctx, el, getCardLabel)
  }
  ctx.restore()
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  getCardLabel: (id: string) => string,
): void {
  switch (el.kind) {
    case 'card': {
      ctx.beginPath()
      ctx.roundRect(el.x, el.y, el.w, el.h, 4)
      ctx.fillStyle = readToken('--color-white', '#ffffff')
      ctx.fill()
      ctx.strokeStyle = readToken('--color-gray', '#e2e8f0')
      ctx.stroke()
      ctx.fillStyle = readToken('--color-black', '#0f172a')
      ctx.font = `500 14px ${readToken('--font-body', 'Inter, sans-serif')}`
      ctx.fillText(getCardLabel(el.id) || '(untitled)', el.x + 10, el.y + 20)
      break
    }
    case 'rect': {
      ctx.beginPath()
      ctx.rect(el.x, el.y, el.w, el.h)
      ctx.strokeStyle = colorOf(el.color)
      ctx.stroke()
      break
    }
    default:
      // freedraw/text/arrow/legacy — 后续 Task。
      break
  }
}

/** 把 DSL color 名(blue/red/...)映射成设计 token(不是裸 hex);未知/缺省回退黑色 token。 */
function colorOf(c: string | undefined): string {
  const tokenFor: Record<string, string> = {
    blue: '--color-blue',
    red: '--color-red',
    green: '--color-green',
    black: '--color-black',
  }
  return readToken(tokenFor[c ?? 'black'] ?? '--color-black', '#0f172a')
}

/** 读 CSS 变量(设计 token);SSR 或变量缺失时回退 fallback。 */
export function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
