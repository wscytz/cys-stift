/**
 * to-svg — cys-dsl ops → 独立 SVG(零依赖,预览级)。
 *
 * 执行意向书 Step 1 的 render 承诺:CLI `render --svg` 输出 SVG(默认输出 JSON Canvas)。
 * 自包含:色值直接落设计 token 实值(packages/ui tokens.css 浅色主题取值,2026-10),
 * 不 import canvas-engine(web 版 elements-to-svg 依赖宿主 token 注入,搬不动)。
 *
 * 保真边界(如实声明,不冒充完整渲染):
 * - 卡片 = 描边矩形 + 标题 + 最多 3 行内容(超出省略号);不渲染 media/tag chips/组色带。
 * - @compute 不在此求值(CLI pipeline 只 parse→sanitize→solve):text 只有 compute 无 text 时
 *   渲染公式原文前缀 '='。
 * - 关系箭头端点按 id 解析到卡/自由元素几何,贴边交点连线;端点缺失 → 跳过并留原因。
 * - 路由 straight/curve/elbow 都画;arrowhead arrow=开口 V / triangle=实心三角 / none=无线帽。
 */
import type { DslOp } from './dsl-parser'

/** legacy 6 色名 → 设计 token 实值(浅色主题)。grey 是 gray 的冻结别名。 */
const COLOR_HEX: Record<string, string> = {
  red: '#b51b17',
  yellow: '#8f706b',
  blue: '#006480',
  black: '#1b1c1a',
  white: '#fbf9f6',
  gray: '#5e5e5c',
  grey: '#5e5e5c',
}

const INK = '#1b1c1a'
const SURFACE = '#fbf9f6'
const PAD = 40
const FONT = 'ui-sans-serif, system-ui, -apple-system, sans-serif'
const CARD_DEFAULT_W = 240
const CARD_DEFAULT_H = 120
const TEXT_DEFAULT_W = 200
const TEXT_DEFAULT_H = 60

export interface SvgSkip {
  opIndex: number
  op: string
  reason: string
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Pt {
  x: number
  y: number
}

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function hex(color?: string): string {
  return (color !== undefined && COLOR_HEX[color]) || INK
}

/** 贪心折行:分词 token(CJK 单字 / 英数连串 / 空白 / 其它标点),英文单词不拦腰断;
 *  单 token 超行宽按字强拆;超 maxLines 末行截 …。 */
function wrapLines(s: string, maxW: number, fontSize: number, maxLines: number): string[] {
  const charPx = (ch: string) => (ch.charCodeAt(0) > 0x2e7f ? fontSize : fontSize * 0.55)
  const tokens = s.match(/[　-鿿-￯]|[A-Za-z0-9]+|\s+|[^A-Za-z0-9\s　-鿿＀-￯]/g) ?? [s]
  const out: string[] = []
  let line = ''
  let w = 0
  let truncated = false
  for (const tok of tokens) {
    // 显式换行:含 \n 的空白 token 直接断行(首段并入当前行)
    if (/\s/.test(tok) && tok.includes('\n')) {
      const head = tok.replace(/\n[\s\S]*$/, '')
      if (head) line += head
      if (line.trim()) out.push(line.trimEnd())
      line = ''
      w = 0
      if (out.length === maxLines) {
        truncated = true
        break
      }
      continue
    }
    const tw = [...tok].reduce((a, c) => a + charPx(c), 0)
    if (w + tw > maxW && line.trim()) {
      out.push(line.trimEnd())
      line = ''
      w = 0
      if (out.length === maxLines) {
        truncated = true
        break
      }
      if (/^\s+$/.test(tok)) continue
    }
    if (tw > maxW && !line.trim()) {
      for (const ch of tok) {
        const cw = charPx(ch)
        if (w + cw > maxW && line) {
          out.push(line)
          line = ''
          w = 0
          if (out.length === maxLines) {
            truncated = true
            break
          }
        }
        line += ch
        w += cw
      }
      if (truncated) break
    } else {
      line += tok
      w += tw
    }
  }
  if (!truncated && line.trim()) out.push(line.trimEnd())
  if (truncated) out[out.length - 1] = out[out.length - 1]!.replace(/.$/, '') + '…'
  return out
}

/** 矩形中心到 (tx,ty) 方向与矩形边界的交点(箭头贴边)。 */
function borderPoint(r: Rect, tx: number, ty: number): Pt {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx !== 0 ? r.w / 2 / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? r.h / 2 / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

/** 箭头头部:tip 在线终点,方向由上一段决定。arrow=开口 V;triangle=实心三角。 */
function arrowHead(tip: Pt, from: Pt, kind: 'arrow' | 'triangle', color: string): string {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x)
  const len = 12
  const spread = 0.42
  const w1 = { x: tip.x - len * Math.cos(ang - spread), y: tip.y - len * Math.sin(ang - spread) }
  const w2 = { x: tip.x - len * Math.cos(ang + spread), y: tip.y - len * Math.sin(ang + spread) }
  if (kind === 'triangle') {
    return `<polygon points="${tip.x},${tip.y} ${w1.x},${w1.y} ${w2.x},${w2.y}" fill="${color}"/>`
  }
  return `<polyline points="${w1.x},${w1.y} ${tip.x},${tip.y} ${w2.x},${w2.y}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
}

function dashAttr(dash?: string): string {
  if (dash === 'dashed') return ' stroke-dasharray="8 6"'
  if (dash === 'dotted') return ' stroke-dasharray="2 5"'
  return ''
}

export function toSvg(ops: DslOp[]): { svg: string; skipped: SvgSkip[] } {
  const skipped: SvgSkip[] = []
  const bodies: string[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const grow = (r: Rect) => {
    if (r.x < minX) minX = r.x
    if (r.y < minY) minY = r.y
    if (r.x + r.w > maxX) maxX = r.x + r.w
    if (r.y + r.h > maxY) maxY = r.y + r.h
  }

  // 第一遍:登记几何(箭头端点解析用)
  const geom = new Map<string, Rect>()
  for (const op of ops) {
    if (op.type === 'card') {
      geom.set(String(op.cardId), { x: op.x, y: op.y, w: op.w ?? CARD_DEFAULT_W, h: op.h ?? CARD_DEFAULT_H })
    } else if (op.type === 'free' && op.id) {
      const isText = op.shape === 'text'
      geom.set(op.id, {
        x: op.x,
        y: op.y,
        w: op.w ?? (isText ? TEXT_DEFAULT_W : CARD_DEFAULT_W),
        h: op.h ?? (isText ? TEXT_DEFAULT_H : CARD_DEFAULT_H),
      })
    }
  }

  // 第二遍:逐 op 出 SVG 片段(顺序即 DSL 顺序;箭头画在卡之下——先箭头后卡更干净)
  const arrowBodies: string[] = []
  const nodeBodies: string[] = []

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!
    if (op.type === 'card') {
      const r = geom.get(String(op.cardId))!
      grow(r)
      const stroke = hex(op.color === 'white' ? 'black' : op.color) // 白卡白描边不可见 → 墨描边
      nodeBodies.push(
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" fill="${SURFACE}" stroke="${stroke}" stroke-width="2"/>`,
      )
      if (op.title !== undefined) {
        nodeBodies.push(
          `<text x="${r.x + 14}" y="${r.y + 26}" font-family="${FONT}" font-size="14" font-weight="700" fill="${INK}">${esc(op.title)}</text>`,
        )
      }
      if (op.content !== undefined) {
        const top = r.y + (op.title !== undefined ? 46 : 20)
        const lines = wrapLines(op.content, r.w - 28, 12, 3)
        lines.forEach((ln, k) => {
          nodeBodies.push(
            `<text x="${r.x + 14}" y="${top + k * 17}" font-family="${FONT}" font-size="12" fill="#5e5e5c">${esc(ln)}</text>`,
          )
        })
      }
      continue
    }
    if (op.type === 'free') {
      const r = geom.get(op.id ?? `anon-${i}`) ?? {
        x: op.x,
        y: op.y,
        w: op.w ?? (op.shape === 'text' ? TEXT_DEFAULT_W : CARD_DEFAULT_W),
        h: op.h ?? (op.shape === 'text' ? TEXT_DEFAULT_H : CARD_DEFAULT_H),
      }
      grow(r)
      if (op.shape === 'text') {
        const fill = hex(op.color)
        const src = op.text ?? (op.compute !== undefined ? `=${op.compute}` : '')
        const lines = wrapLines(src, r.w - 8, 13, Math.max(1, Math.floor(r.h / 18)))
        lines.forEach((ln, k) => {
          nodeBodies.push(
            `<text x="${r.x + 4}" y="${r.y + 15 + k * 18}" font-family="${FONT}" font-size="13" fill="${fill}">${esc(ln)}</text>`,
          )
        })
      } else if (op.shape === 'rect') {
        nodeBodies.push(
          `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${hex(op.color)}" stroke-width="2"/>`,
        )
      } else {
        // frame:主题容器 = 描边矩形 + 左上标题
        nodeBodies.push(
          `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${hex(op.color)}" stroke-width="2" stroke-dasharray="10 6"/>`,
        )
        if (op.text !== undefined) {
          nodeBodies.push(
            `<text x="${r.x + 10}" y="${r.y + 20}" font-family="${FONT}" font-size="13" font-weight="700" fill="${hex(op.color)}">${esc(op.text)}</text>`,
          )
        }
      }
      continue
    }
    // arrow
    const color = hex(op.color)
    let p1: Pt | undefined
    let p2: Pt | undefined
    let mid: Pt[] = []
    if (op.freeArrow === true) {
      p1 = { x: op.x ?? 0, y: op.y ?? 0 }
      p2 = { x: (op.x ?? 0) + (op.w ?? 0), y: (op.y ?? 0) + (op.h ?? 0) }
    } else {
      const src = geom.get(op.from)
      const dst = geom.get(op.to)
      if (!src || !dst) {
        skipped.push({
          opIndex: i,
          op: `arrow ${op.id ?? `${op.from}→${op.to}`}`,
          reason: `端点 ${!src ? `#${op.from}` : `#${op.to}`} 不存在,不渲染`,
        })
        continue
      }
      p1 = borderPoint(src, dst.x + dst.w / 2, dst.y + dst.h / 2)
      p2 = borderPoint(dst, src.x + src.w / 2, src.y + src.h / 2)
      if (op.route === 'elbow' && op.elbow !== undefined) mid = op.elbow
    }
    const route = op.route ?? (op.curve !== undefined ? 'curve' : 'straight')
    grow({ x: Math.min(p1!.x, p2!.x), y: Math.min(p1!.y, p2!.y), w: Math.abs(p2!.x - p1!.x), h: Math.abs(p2!.y - p1!.y) })
    let d: string
    let headFrom: Pt
    if (route === 'curve') {
      const c = op.curve ?? { cx: (p1!.x + p2!.x) / 2, cy: (p1!.y + p2!.y) / 2 - 40 }
      d = `M ${p1!.x} ${p1!.y} Q ${c.cx} ${c.cy} ${p2!.x} ${p2!.y}`
      headFrom = { x: c.cx, y: c.cy }
      grow({ x: c.cx, y: c.cy, w: 0, h: 0 })
    } else if (route === 'elbow' && mid.length > 0) {
      const pts = [p1!, ...mid, p2!]
      d = `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      headFrom = pts[pts.length - 2]!
      for (const p of mid) grow({ x: p.x, y: p.y, w: 0, h: 0 })
    } else {
      d = `M ${p1!.x} ${p1!.y} L ${p2!.x} ${p2!.y}`
      headFrom = p1!
    }
    arrowBodies.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2"${dashAttr(op.dash)}/>`)
    if (op.arrowhead !== 'none') {
      arrowBodies.push(arrowHead(p2!, headFrom, op.arrowhead ?? 'arrow', color))
    }
    if (op.label !== undefined) {
      const mx = (p1!.x + p2!.x) / 2
      const my = (p1!.y + p2!.y) / 2
      arrowBodies.push(
        `<text x="${mx}" y="${my - 6}" font-family="${FONT}" font-size="11" fill="${INK}" text-anchor="middle" stroke="${SURFACE}" stroke-width="3" paint-order="stroke">${esc(op.label)}</text>`,
      )
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 1
    maxY = 1
  }
  const vx = Math.floor(minX - PAD)
  const vy = Math.floor(minY - PAD)
  const vw = Math.ceil(maxX - minX) + PAD * 2
  const vh = Math.ceil(maxY - minY) + PAD * 2
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">\n` +
    `  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${SURFACE}"/>\n` +
    `  <g>\n${arrowBodies.map((b) => `    ${b}`).join('\n')}\n  </g>\n` +
    `  <g>\n${nodeBodies.map((b) => `    ${b}`).join('\n')}\n  </g>\n` +
    `</svg>\n`
  return { svg, skipped }
}
