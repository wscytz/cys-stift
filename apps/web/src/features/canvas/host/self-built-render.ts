'use client'

import type { CanvasElement, CanvasView } from './canvas-host'
import { arrowEndpoints, dashPattern, arrowheadPoints } from './self-built-arrow'

/**
 * 纯渲染函数:把元素画到 ctx 上,带相机(pan/zoom)变换。
 * - 先 clearRect 整个画布(背景色)。
 * - save → translate(panX,panY) → scale(zoom) → 画元素 → restore。
 * - card = 圆角矩形 + 类型标 + title + body 3 行 + pinned ★(从 getCardInfo);rect = 矩形。其它 kind 本期不画。
 *
 * 纯函数(无 DOM 副作用)以便单测(mock ctx)。
 *
 * 颜色/字体走设计 token(readToken 读 CSS 变量),不在绘制路径写裸 hex;
 * 仅 readToken 的 fallback 形参里保留 hex 兜底。
 */
export type CardInfo = { title: string; body: string; type: string; pinned: boolean }

export function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  view: CanvasView,
  cssWidth: number,
  cssHeight: number,
  getCardInfo: (id: string) => CardInfo | null,
  background: string,
): void {
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, cssWidth, cssHeight)

  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  for (const el of elements) {
    drawElement(ctx, el, elements, getCardInfo)
  }
  ctx.restore()
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  allElements: CanvasElement[],
  getCardInfo: (id: string) => CardInfo | null,
): void {
  switch (el.kind) {
    case 'card': {
      const info = getCardInfo(el.id)
      // 卡片背景 + 边框
      ctx.beginPath()
      ctx.roundRect(el.x, el.y, el.w, el.h, 4)
      ctx.fillStyle = readToken('--color-white', '#ffffff')
      ctx.fill()
      ctx.strokeStyle = readToken('--color-gray', '#e2e8f0')
      ctx.lineWidth = 1
      ctx.stroke()
      // 内容(对齐 card-shape-util:类型标 mono 灰 + title display + body 3 行)
      const pad = 10
      ctx.textBaseline = 'top'
      if (!info) {
        ctx.fillStyle = readToken('--color-gray', '#94a3b8')
        ctx.font = `12px ${readToken('--font-mono', 'monospace')}`
        ctx.fillText('(untitled)', el.x + pad, el.y + pad)
        break
      }
      // pinned ★ 右上
      if (info.pinned) {
        ctx.fillStyle = readToken('--color-yellow', '#eab308')
        ctx.font = `14px ${readToken('--font-mono', 'monospace')}`
        ctx.fillText('★', el.x + el.w - 18, el.y + 6)
      }
      // 类型标(mono 灰 大写)
      ctx.fillStyle = readToken('--color-gray', '#64748b')
      ctx.font = `10px ${readToken('--font-mono', 'monospace')}`
      ctx.fillText(info.type.toUpperCase(), el.x + pad, el.y + pad)
      // title(display,500)
      ctx.fillStyle = readToken('--color-black', '#0f172a')
      ctx.font = `500 15px ${readToken('--font-display', 'Inter, sans-serif')}`
      ctx.fillText(info.title || '(untitled)', el.x + pad, el.y + pad + 16)
      // body(3 行截断)
      if (info.body) {
        ctx.fillStyle = readToken('--color-black-soft', '#475569')
        ctx.font = `12px ${readToken('--font-body', 'Inter, sans-serif')}`
        const lines = wrapLines(info.body, el.w - pad * 2, ctx)
        for (let i = 0; i < Math.min(3, lines.length); i++) {
          ctx.fillText(lines[i]!, el.x + pad, el.y + pad + 38 + i * 16)
        }
      }
      break
    }
    case 'rect': {
      ctx.beginPath()
      ctx.rect(el.x, el.y, el.w, el.h)
      ctx.strokeStyle = colorOf(el.color)
      ctx.stroke()
      break
    }
    case 'freedraw': {
      const pts = (el.meta?.points as [number, number][] | undefined) ?? []
      if (pts.length === 0) break
      ctx.beginPath()
      ctx.moveTo(pts[0]![0], pts[0]![1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1])
      ctx.strokeStyle = colorOf(el.color)
      ctx.lineWidth = 2
      ctx.stroke()
      break
    }
    case 'arrow': {
      const { from, to } = arrowEndpoints(el, allElements)
      if (!from || !to) break
      const stroke = colorOf(el.color)
      // 线段(语义线型:dash)
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2
      ctx.setLineDash(dashPattern(el.dash))
      ctx.stroke()
      ctx.setLineDash([]) // 复位,免污染后续绘制
      // 箭头头(语义箭头形:arrow=开口V / triangle=实心 / none=无)
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      const headKind = el.arrowhead ?? 'arrow'
      const pts = arrowheadPoints(headKind, to, angle)
      if (pts.length === 3) {
        const [left, tip, right] = pts as [typeof to, typeof to, typeof to]
        if (headKind === 'triangle') {
          ctx.beginPath()
          ctx.moveTo(tip.x, tip.y)
          ctx.lineTo(left.x, left.y)
          ctx.lineTo(right.x, right.y)
          ctx.closePath()
          ctx.fillStyle = stroke
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.moveTo(left.x, left.y)
          ctx.lineTo(tip.x, tip.y)
          ctx.lineTo(right.x, right.y)
          ctx.stroke()
        }
      }
      if (el.text) {
        const mx = (from.x + to.x) / 2
        const my = (from.y + to.y) / 2
        ctx.fillStyle = stroke
        ctx.font = `12px ${readToken('--font-body', 'Inter, sans-serif')}`
        ctx.fillText(el.text, mx, my)
      }
      break
    }
    case 'text': {
      const lines = (el.text ?? '').split('\n')
      if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) break
      ctx.fillStyle = colorOf(el.color)
      ctx.font = `14px ${readToken('--font-body', 'Inter, sans-serif')}`
      ctx.textBaseline = 'top'
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i]!, el.x, el.y + i * 18)
      }
      break
    }
    default:
      // legacy — 后续 Task。
      break
  }
}

/**
 * 把 DSL/关系 color 名映射成设计 token(Bauhaus 6 原色,不写裸 hex)。
 *
 * 约束(packages/ui 铁律):6 原色 red/yellow/blue/black/white/gray,**不引第七色**。
 * 故这里**没有 green**(曾误映射 `green→--color-green`,但该 token 不存在且违反
 * 6 原色约束,已删)。`grey`/`gray` 都映射到 `--color-gray`(关系类型 related-to
 * 用 'grey',此前漏映射被回退成黑色——真 bug,此处修)。未知/缺省回退黑色 token。
 */
export function colorOf(c: string | undefined): string {
  const tokenFor: Record<string, string> = {
    blue: '--color-blue',
    red: '--color-red',
    yellow: '--color-yellow',
    gray: '--color-gray',
    grey: '--color-gray',
    white: '--color-white',
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

/**
 * 画选中高亮:对 selectedIds 命中的元素画 dashed 框(在相机变换内)。
 * lineWidth/dash 除以 zoom 抵消缩放,视觉宽度恒定。空选择不画。
 * 纯函数(自己 save/translate/scale/restore),便于单测。
 */
export function drawSelectionOutlines(
  ctx: CanvasRenderingContext2D,
  selectedIds: string[],
  elements: CanvasElement[],
  view: CanvasView,
): void {
  if (selectedIds.length === 0) return
  const sel = new Set(selectedIds)
  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  ctx.strokeStyle = readToken('--color-blue', '#1d4ed8')
  ctx.lineWidth = 1.5 / view.zoom
  ctx.setLineDash([6 / view.zoom, 4 / view.zoom])
  const hs = 3 / view.zoom // handle 半边长 → 6px 方块
  for (const el of elements) {
    if (!sel.has(el.id)) continue
    // dashed 选中框(外扩 2px)
    ctx.strokeRect(el.x - 2, el.y - 2, el.w + 4, el.h + 4)
    // 四角 handle 方块(白填 + 蓝描)
    const corners: [number, number][] = [
      [el.x, el.y],
      [el.x + el.w, el.y],
      [el.x, el.y + el.h],
      [el.x + el.w, el.y + el.h],
    ]
    ctx.setLineDash([])
    ctx.fillStyle = readToken('--color-white', '#ffffff')
    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2)
      ctx.strokeRect(cx - hs, cy - hs, hs * 2, hs * 2)
    }
    ctx.setLineDash([6 / view.zoom, 4 / view.zoom]) // 复位 dash 给下一个元素
  }
  ctx.restore()
}

/** 画框选预览矩形(dashed + 半透明填充,在相机变换内)。空 rect 不画。 */
export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  view: CanvasView,
): void {
  if (rect.w === 0 || rect.h === 0) return
  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  ctx.fillStyle = readToken('--color-blue', '#1d4ed8')
  ctx.globalAlpha = 0.1
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = readToken('--color-blue', '#1d4ed8')
  ctx.lineWidth = 1 / view.zoom
  ctx.setLineDash([4 / view.zoom, 4 / view.zoom])
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}

/** 按可用宽度把文本拆成行(Canvas 2D 无自动换行)。纯函数。 */
export function wrapLines(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (para === '') {
      out.push('')
      continue
    }
    let line = ''
    for (const ch of para) {
      const test = line + ch
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line)
        line = ch
      } else {
        line = test
      }
    }
    if (line) out.push(line)
  }
  return out
}
