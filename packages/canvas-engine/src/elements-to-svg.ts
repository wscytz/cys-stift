
import type { CanvasElement, CanvasView } from './canvas-host'
import { sortByLayer } from './canvas-host'
import { colorOf, domTokenResolver, type TokenResolver } from './self-built-render'
import { arrowEndpoints, dashPattern, arrowheadPoints } from './self-built-arrow'
import { unionBounds, expandBounds, normalizeBox, type Bounds } from './bounds'

export interface ElementsToSvgOptions {
  background: boolean
  border: number
}

interface CardInfo {
  title: string
  body: string
  type: string
  pinned: boolean
}

/** CanvasElement[] → SVG 字符串(对齐 self-built-render 视觉;颜色 tokenResolver 解析具体值)。 */
export function elementsToSvg(
  elements: CanvasElement[],
  view: CanvasView,
  getCardInfo: (id: string) => CardInfo | null,
  opts: ElementsToSvgOptions,
  tokenResolver: TokenResolver = domTokenResolver,
): { svg: string; width: number; height: number } {
  // 0. 确定性 z 序:与实时渲染完全一致(防御性——即使调用方传未排序数组,SVG 仍按
  //    KIND_LAYER 出,五视图视觉对齐)。bbox 用全部元素算,与顺序无关。
  // bbox 归一化:自由箭头反向画时 w/h<0,unionBounds 用 x+w 算 maxX 会算反 → 尺寸为负
  // → 钳成 1×1px。归一化(负则翻转 x/y 到左上)与 hitTest/选中框/self-built-render 同源。
  const boxes: Bounds[] = elements.map((e) => normalizeBox(e))
  const raw = unionBounds(boxes) ?? { x: 0, y: 0, w: 1, h: 1 }
  const expanded = expandBounds(raw, opts.border)
  const width = Math.max(1, Math.round(expanded.w))
  const height = Math.max(1, Math.round(expanded.h))
  const dx = -expanded.x
  const dy = -expanded.y

  const layered = sortByLayer(elements)

  // 2. 颜色(tokenResolver 解析具体值;SVG 无 CSS 变量上下文)。
  const bg = opts.background ? tokenResolver('--color-white', '#ffffff') : 'transparent'
  const cardFill = tokenResolver('--color-white', '#ffffff')
  const cardStroke = tokenResolver('--color-gray', '#e2e8f0')
  const textCol = tokenResolver('--color-black', '#0f172a')
  const grayCol = tokenResolver('--color-gray', '#64748b')
  const yellow = tokenResolver('--color-yellow', '#eab308')
  const fontBody = tokenResolver('--font-body', 'Inter, sans-serif')
  const fontDisplay = tokenResolver('--font-display', 'Inter, sans-serif')
  const fontMono = tokenResolver('--font-mono', 'monospace')

  void view // 导出时 view 不参与坐标变换(导出通常 zoom=1,pan=0);保留参数为 Task 2-4 兼容。

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`)
  if (opts.background) {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`)
  }
  for (const el of layered) {
    parts.push(elementToSvg(el, dx, dy, getCardInfo, { cardFill, cardStroke, textCol, grayCol, yellow, fontBody, fontDisplay, fontMono }, layered, tokenResolver))
  }
  parts.push('</svg>')
  return { svg: parts.join(''), width, height }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function elementToSvg(
  el: CanvasElement,
  dx: number,
  dy: number,
  getCardInfo: (id: string) => CardInfo | null,
  c: { cardFill: string; cardStroke: string; textCol: string; grayCol: string; yellow: string; fontBody: string; fontDisplay: string; fontMono: string },
  allElements: CanvasElement[],
  tokenResolver: TokenResolver,
): string {
  const x = el.x + dx
  const y = el.y + dy
  switch (el.kind) {
    case 'card': {
      const info = getCardInfo(el.id)
      const parts = [`<rect x="${x}" y="${y}" width="${el.w}" height="${el.h}" rx="4" fill="${c.cardFill}" stroke="${c.cardStroke}"/>`]
      if (info) {
        if (info.pinned) parts.push(`<text x="${x + el.w - 14}" y="${y + 16}" fill="${c.yellow}" font-family="${c.fontMono}" font-size="14">★</text>`)
        parts.push(`<text x="${x + 10}" y="${y + 14}" fill="${c.grayCol}" font-family="${c.fontMono}" font-size="10">${esc(info.type.toUpperCase())}</text>`)
        parts.push(`<text x="${x + 10}" y="${y + 32}" fill="${c.textCol}" font-family="${c.fontDisplay}" font-size="15" font-weight="500">${esc(info.title || '(untitled)')}</text>`)
        if (info.body) {
          const lines = info.body.split('\n').slice(0, 3)
          lines.forEach((ln, i) => {
            parts.push(`<text x="${x + 10}" y="${y + 50 + i * 16}" fill="${c.textCol}" font-family="${c.fontBody}" font-size="12">${esc(ln.slice(0, 40))}</text>`)
          })
        }
      } else {
        parts.push(`<text x="${x + 10}" y="${y + 14}" fill="${c.grayCol}" font-family="${c.fontMono}" font-size="12">(untitled)</text>`)
      }
      return parts.join('')
    }
    case 'rect': {
      // 对齐实时渲染 self-built-render.ts:108-109:ctx.rect 支持负 w/h(从对角画);
      // SVG <rect> 负宽高不渲染 → 归一化到左上角正宽高(导入 upsert 不经 MIN_SIZE
      // clamp,可造出负 rect;与 hitTest/选中框/self-built-render 同源 normalizeBox)。
      const b = normalizeBox(el)
      return `<rect x="${b.x + dx}" y="${b.y + dy}" width="${b.w}" height="${b.h}" fill="none" stroke="${colorOf(el.color, tokenResolver)}"/>`
    }
    case 'ellipse':
      return `<ellipse cx="${x + el.w / 2}" cy="${y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="none" stroke="${colorOf(el.color, tokenResolver)}"/>`
    case 'freedraw': {
      const pts = (el.meta?.points as [number, number][] | undefined) ?? []
      if (pts.length === 0) return ''
      if (pts.length === 1) {
        // 单点 freedraw:d="M x y" 空 path 不画 = 不可见幽灵。画 <circle>(与实时渲染
        // arc 圆点两视图一致)。点坐标是绝对页坐标,SVG 加 dx/dy 偏移。
        return `<circle cx="${pts[0]![0] + dx}" cy="${pts[0]![1] + dy}" r="2" fill="${colorOf(el.color, tokenResolver)}"/>`
      }
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]! + dx} ${p[1]! + dy}`).join(' ')
      return `<path d="${d}" fill="none" stroke="${colorOf(el.color, tokenResolver)}" stroke-width="2"/>`
    }
    case 'text': {
      // 对齐实时渲染 self-built-render.ts:170-177:split('\n') 逐行 fillText,
      // textBaseline='top',行高 18px。SVG <text> 的 \n 不产生换行 → 逐行输出 <text>。
      const lines = (el.text ?? '').split('\n')
      // render line 171 早退:纯空文本(lines==[''])不画。
      if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) return ''
      return lines.map((ln, i) =>
        `<text x="${x}" y="${y + 14 + i * 18}" fill="${colorOf(el.color, tokenResolver)}" font-family="${c.fontBody}" font-size="14">${esc(ln)}</text>`,
      ).join('')
    }
    case 'arrow': {
      const { from, to } = arrowEndpoints(el, allElements)
      if (!from || !to) return ''
      const stroke = colorOf(el.color, tokenResolver)
      const fx = from.x + dx, fy = from.y + dy
      const tx = to.x + dx, ty = to.y + dy
      const dashArr = dashPattern(el.dash)
      const dashAttr = dashArr.length ? ` stroke-dasharray="${dashArr.join(' ')}"` : ''
      const ctrl = el.curve ? { x: el.curve.cx + dx, y: el.curve.cy + dy } : null
      const segs: string[] = []
      if (ctrl) {
        segs.push(`<path d="M ${fx} ${fy} Q ${ctrl.x} ${ctrl.y} ${tx} ${ty}" fill="none" stroke="${stroke}" stroke-width="2"${dashAttr}/>`)
      } else {
        segs.push(`<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="${stroke}" stroke-width="2"${dashAttr}/>`)
      }
      // 箭头头(与实时渲染同源几何;dash 不应用到箭头头)。曲线终点切线 = to-ctrl。
      const angle = ctrl
        ? Math.atan2(ty - ctrl.y, tx - ctrl.x)
        : Math.atan2(ty - fy, tx - fx)
      const headKind = el.arrowhead ?? 'arrow'
      const pts = arrowheadPoints(headKind, { x: tx, y: ty }, angle)
      if (pts.length === 3) {
        const [left, tip, right] = pts
        if (headKind === 'triangle') {
          segs.push(`<polygon points="${tip!.x},${tip!.y} ${left!.x},${left!.y} ${right!.x},${right!.y}" fill="${stroke}"/>`)
        } else {
          segs.push(`<polyline points="${left!.x},${left!.y} ${tip!.x},${tip!.y} ${right!.x},${right!.y}" fill="none" stroke="${stroke}" stroke-width="2"/>`)
        }
      }
      if (el.text) {
        // 曲线 label 放贝塞尔 t=0.5 点(曲线中点),直线放线段中点。
        let mx: number, my: number
        if (ctrl) {
          mx = 0.25 * fx + 0.5 * ctrl.x + 0.25 * tx
          my = 0.25 * fy + 0.5 * ctrl.y + 0.25 * ty
        } else {
          mx = (fx + tx) / 2; my = (fy + ty) / 2
        }
        segs.push(`<text x="${mx}" y="${my}" fill="${stroke}" font-family="${c.fontBody}" font-size="12">${esc(el.text)}</text>`)
      }
      return segs.join('')
    }
    default:
      return ''
  }
}
