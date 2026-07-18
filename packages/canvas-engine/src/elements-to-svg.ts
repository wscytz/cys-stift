
import type { CanvasElement, CanvasView } from './canvas-host'
import { sortByLayer } from './canvas-host'
import { colorOf, domTokenResolver, type TokenResolver } from './self-built-render'
import { arrowEndpoints, dashPattern, arrowheadPoints, arrowRoute, elbowSegments, arrowHeadAngle, autoElbowPath, cardObstacles } from './self-built-arrow'
import { unionBounds, expandBounds, normalizeBox, type Bounds } from './bounds'
import { freedrawPointsOf } from './self-built-freedraw'
import { buildSmoothPath } from './smooth-path'
import { markdownPreview } from './markdown-preview'

/** SVG 无 ctx.measureText,用字符宽度估算软换行(近似实时渲染 wrapLines 的视觉)。
 *  CJK/全角(code≥0x1100)按字号(12px),latin 按约 0.58 字号(7px)。
 *  替代旧的硬截断 slice(0,40):窄卡不再溢出、宽卡不再被截。返回 ≤maxLines 行。 */
function estimateSoftWrap(text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = []
  const w = Math.max(maxW, 20)
  for (const para of text.split('\n')) {
    if (out.length >= maxLines) break
    let line = ''
    let width = 0
    for (const ch of para) {
      const code = ch.codePointAt(0) ?? 0
      const cw = code >= 0x1100 ? 12 : 7
      if (width + cw > w && line) {
        out.push(line)
        if (out.length >= maxLines) return out
        line = ch
        width = cw
      } else {
        line += ch
        width += cw
      }
    }
    out.push(line)
  }
  return out.slice(0, maxLines)
}

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
  const cardStroke = tokenResolver('--color-gray', '#d9d9d9')
  const textCol = tokenResolver('--color-black', '#0a0a0a')
  const grayCol = tokenResolver('--color-gray', '#666666')
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
        const displayBody = markdownPreview(info.body, Number.POSITIVE_INFINITY)
        if (displayBody) {
          const lines = estimateSoftWrap(displayBody, el.w - 20, 3)
          lines.forEach((ln, i) => {
            parts.push(`<text x="${x + 10}" y="${y + 50 + i * 16}" fill="${c.textCol}" font-family="${c.fontBody}" font-size="12">${esc(ln)}</text>`)
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
    case 'frame': {
      // 对齐实时渲染:半透明填充 + 虚线边框 + 左上角标题。SVG 用 fill-opacity + stroke-dasharray。
      const b = normalizeBox(el)
      const stroke = colorOf(el.color, tokenResolver)
      const title = el.text
        ? `<rect x="${b.x + dx}" y="${b.y + dy}" width="${Math.min(el.text.length * 7 + 12, b.w)}" height="18" fill="white" fill-opacity="0.85"/><text x="${b.x + dx + 6}" y="${b.y + dy + 14}" font-family="${c.fontMono}" font-size="11" fill="${stroke}">${esc(el.text)}</text>`
        : ''
      return `<rect x="${b.x + dx}" y="${b.y + dy}" width="${b.w}" height="${b.h}" fill="${stroke}" fill-opacity="0.06" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="8,4"/>${title}`
    }
    case 'ellipse':
      return `<ellipse cx="${x + el.w / 2}" cy="${y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="none" stroke="${colorOf(el.color, tokenResolver)}"/>`
    case 'freedraw': {
      const pts = freedrawPointsOf(el) ?? []
      if (pts.length === 0) return ''
      if (pts.length === 1) {
        // 单点 freedraw:d="M x y" 空 path 不画 = 不可见幽灵。画 <circle>(与实时渲染
        // arc 圆点两视图一致)。点坐标是绝对页坐标,SVG 加 dx/dy 偏移。
        return `<circle cx="${pts[0]![0] + dx}" cy="${pts[0]![1] + dy}" r="2" fill="${colorOf(el.color, tokenResolver)}"/>`
      }
      // Catmull-Rom 平滑贝塞尔 d(与实时渲染同源 buildSmoothPath → 五视图一致)。点加 dx/dy 偏移。
      const offset = pts.map((p) => [p[0]! + dx, p[1]! + dy] as [number, number])
      const d = buildSmoothPath(offset)
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
      const route = arrowRoute(el)
      const ctrl = route === 'curve' && el.curve ? { x: el.curve.cx + dx, y: el.curve.cy + dy } : null
      const ctrlPage = route === 'curve' && el.curve ? { x: el.curve.cx, y: el.curve.cy } : null
      // 实际 elbow 渲染路径(页坐标):手设 → elbowSegments;空 → autoElbowPath 自动绕障。
      // polyline 渲染 + 箭头头角度共用 —— 自动绕障也走这份,免得头朝向和折线不一致。
      let elbowPts: { x: number; y: number }[] | null = null
      const segs: string[] = []
      if (ctrl) {
        segs.push(`<path d="M ${fx} ${fy} Q ${ctrl.x} ${ctrl.y} ${tx} ${ty}" fill="none" stroke="${stroke}" stroke-width="2"${dashAttr}/>`)
      } else if (route === 'elbow') {
        // 折线:<polyline> from→elbows→to。点序列含端点 + 折点。
        // 手设 elbow → elbowSegments;空 → autoElbowPath 自动绕障(obstacles 排除 from/to 卡),
        // 与实时渲染 / hitTest 同源(三视图视觉一致)。
        const hasManual = !!(el.elbow && el.elbow.length > 0)
        elbowPts = hasManual
          ? elbowSegments(el, from, to)
          : autoElbowPath(
              el,
              from,
              to,
              cardObstacles(allElements, new Set([el.from, el.to].filter((v): v is string => !!v))),
            )
        if (elbowPts && elbowPts.length >= 2) {
          const coords = elbowPts.map((p) => `${p.x + dx},${p.y + dy}`).join(' ')
          segs.push(`<polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2"${dashAttr}/>`)
        }
      } else {
        segs.push(`<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="${stroke}" stroke-width="2"${dashAttr}/>`)
      }
      // 箭头头(与实时渲染同源几何;dash 不应用到箭头头;角度 = 终点切线,按实际路径 segs/ctrl)。
      const angle = arrowHeadAngle(route, from, to, { ctrl: ctrlPage, segs: elbowPts })
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
        // label 放路径中点:直线/折线 = 折点序列中点;曲线 = 贝塞尔 t=0.5。
        let mx: number, my: number
        if (ctrl) {
          mx = 0.25 * fx + 0.5 * ctrl.x + 0.25 * tx
          my = 0.25 * fy + 0.5 * ctrl.y + 0.25 * ty
        } else if (route === 'elbow') {
          // 与折线绘制同源取路径中点(手设/自动绕障一致),让 label 落在路径上。
          const hasManual = !!(el.elbow && el.elbow.length > 0)
          const ep = hasManual
            ? elbowSegments(el, from, to)
            : autoElbowPath(
                el,
                from,
                to,
                cardObstacles(allElements, new Set([el.from, el.to].filter((v): v is string => !!v))),
              )
          const mid = ep ? ep[Math.floor(ep.length / 2)]! : { x: from.x, y: from.y }
          mx = mid.x + dx; my = mid.y + dy
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
