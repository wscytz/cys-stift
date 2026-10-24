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
 * - 默认路由自动避障:直连段穿过卡/矩形时自动绕行走廊(L/Z 形候选,端点重贴边,全清才采纳);
 *   显式 route/curve/elbow 不干预。frame 是容器、text 无边界,都不算障碍。
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

/** 线段与矩形内域是否相交(Liang-Barsky;相交段要有实长,贴边擦过不算)。 */
function segHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edges: Array<[number, number]> = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const t = q / p
      if (p < 0) {
        if (t > t1) return false
        if (t > t0) t0 = t
      } else {
        if (t < t0) return false
        if (t < t1) t1 = t
      }
    }
  }
  return t1 - t0 > 0.01
}

function inRect(p: Pt, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h
}

function polyClear(pts: Pt[], rects: Rect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    for (const r of rects) if (segHitsRect(pts[i]!, pts[i + 1]!, r)) return false
  }
  for (const p of pts) {
    for (const r of rects) if (inRect(p, r)) return false
  }
  return true
}

function polyLen(pts: Pt[]): number {
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) {
    len += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y)
  }
  return len
}

/** 折线中点(按弧长走一半;label 锚点用)。 */
function polyMid(pts: Pt[]): Pt {
  const half = polyLen(pts) / 2
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y)
    if (acc + seg >= half && seg > 0) {
      const t = (half - acc) / seg
      return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t }
    }
    acc += seg
  }
  return pts[pts.length - 1]!
}

/** 一轴上障碍区间并集的空隙中点(空隙 ≥ minGap 才算可行走廊)。 */
function corridors(rects: Rect[], axis: 'x' | 'y', minGap: number): number[] {
  const ivals = rects
    .map((r) => (axis === 'x' ? [r.x, r.x + r.w] : [r.y, r.y + r.h]))
    .sort((a, b) => a[0]! - b[0]!)
  const merged: Array<[number, number]> = []
  for (const iv of ivals) {
    const last = merged[merged.length - 1]
    if (last && iv[0]! <= last[1]) last[1] = Math.max(last[1], iv[1]!)
    else merged.push([iv[0]!, iv[1]!])
  }
  const mids: number[] = []
  for (let i = 0; i < merged.length - 1; i++) {
    const start = merged[i]![1]
    const end = merged[i + 1]![0]
    if (end - start >= minGap) mids.push((start + end) / 2)
  }
  return mids
}

/**
 * 默认路由自动避障:直连段穿过障碍时,生成绕行路标再整段验证。候选三族:
 * L 形 2 个 / 命中包围盒外扩 Z 形 4 个 / 障碍间隙走廊 Z 形(两轴各若干——
 * 直连线同时擦到两簇障碍时,包围盒外扩走廊会全撞墙,列间走廊才是活路)。
 * 每个候选都把端点按新方向重新贴边(borderPoint),返回**整条路径**(含新端点)——
 * 调用方直接用,不再拼原端点(否则末端沿卡边滑行,箭头顺着边飘)。
 * 全部候选撞墙则退回 null(直连,诚实降级不硬凑)。margin=走廊与障碍的间距。
 */
export function routeAround(
  p1: Pt,
  p2: Pt,
  src: Rect,
  dst: Rect,
  obstacles: Rect[],
  margin = 16,
): Pt[] | null {
  // 内缩 2px:贴边端点(恰在原边界上)落进内缩矩形之外,不误报穿越
  const rects = obstacles
    .filter((r) => r.w > 12 && r.h > 12)
    .map((r) => ({ x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }))
  if (rects.length === 0) return null
  const hits = rects.filter((r) => segHitsRect(p1, p2, r))
  if (hits.length === 0) return null
  const minX = Math.min(...hits.map((r) => r.x))
  const minY = Math.min(...hits.map((r) => r.y))
  const maxX = Math.max(...hits.map((r) => r.x + r.w))
  const maxY = Math.max(...hits.map((r) => r.y + r.h))
  const cands: Pt[][] = [
    [{ x: p2.x, y: p1.y }],
    [{ x: p1.x, y: p2.y }],
    [{ x: p1.x, y: minY - margin }, { x: p2.x, y: minY - margin }],
    [{ x: p1.x, y: maxY + margin }, { x: p2.x, y: maxY + margin }],
    [{ x: minX - margin, y: p1.y }, { x: minX - margin, y: p2.y }],
    [{ x: maxX + margin, y: p1.y }, { x: maxX + margin, y: p2.y }],
  ]
  for (const c of corridors(rects, 'x', 8)) cands.push([{ x: c, y: p1.y }, { x: c, y: p2.y }])
  for (const c of corridors(rects, 'y', 8)) cands.push([{ x: p1.x, y: c }, { x: p2.x, y: c }])
  let best: Pt[] | null = null
  let bestScore = Infinity
  for (const w of cands) {
    const head = w[0]!
    const tail = w[w.length - 1]!
    const path = [borderPoint(src, head.x, head.y), ...w, borderPoint(dst, tail.x, tail.y)]
    if (!polyClear(path, rects)) continue
    const score = polyLen(path) + w.length * 8
    if (score < bestScore) {
      bestScore = score
      best = path
    }
  }
  return best
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

  // 第一遍:登记几何(箭头端点解析用);卡 + rect 同时登记为避障障碍(frame 是容器、text 无边界,不算)
  const geom = new Map<string, Rect>()
  const obstacles: Rect[] = []
  for (const op of ops) {
    if (op.type === 'card') {
      const r = { x: op.x, y: op.y, w: op.w ?? CARD_DEFAULT_W, h: op.h ?? CARD_DEFAULT_H }
      geom.set(String(op.cardId), r)
      obstacles.push(r)
    } else if (op.type === 'free' && op.id) {
      const isText = op.shape === 'text'
      const r = {
        x: op.x,
        y: op.y,
        w: op.w ?? (isText ? TEXT_DEFAULT_W : CARD_DEFAULT_W),
        h: op.h ?? (isText ? TEXT_DEFAULT_H : CARD_DEFAULT_H),
      }
      geom.set(op.id, r)
      if (op.shape === 'rect') obstacles.push(r)
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
    let srcRect: Rect | undefined
    let dstRect: Rect | undefined
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
      srcRect = src
      dstRect = dst
      p1 = borderPoint(src, dst.x + dst.w / 2, dst.y + dst.h / 2)
      p2 = borderPoint(dst, src.x + src.w / 2, src.y + src.h / 2)
      if (op.route === 'elbow' && op.elbow !== undefined) {
        mid = op.elbow
      } else if (op.route === undefined && op.curve === undefined) {
        // 默认路由自动避障:直连段穿过障碍才绕行;显式 route/curve 交给作者意图。
        // 返回整条重贴边路径,端点一并替换(箭头方向跟着新末端走,不沿卡边滑)
        const detour = routeAround(p1, p2, src, dst, obstacles)
        if (detour) {
          p1 = detour[0]!
          p2 = detour[detour.length - 1]!
          mid = detour.slice(1, -1)
        }
      }
    }
    const route = op.route ?? (op.curve !== undefined ? 'curve' : 'straight')
    let d: string
    let headFrom: Pt
    let labelAnchor: Pt
    if (route === 'curve') {
      const c = op.curve ?? { cx: (p1!.x + p2!.x) / 2, cy: (p1!.y + p2!.y) / 2 - 40 }
      d = `M ${p1!.x} ${p1!.y} Q ${c.cx} ${c.cy} ${p2!.x} ${p2!.y}`
      headFrom = { x: c.cx, y: c.cy }
      labelAnchor = { x: (p1!.x + p2!.x) / 2, y: (p1!.y + p2!.y) / 2 }
      grow({ x: p1!.x, y: p1!.y, w: 0, h: 0 })
      grow({ x: p2!.x, y: p2!.y, w: 0, h: 0 })
      grow({ x: c.cx, y: c.cy, w: 0, h: 0 })
    } else {
      const pts = [p1!, ...mid, p2!]
      d = `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
      headFrom = pts[pts.length - 2]!
      labelAnchor = polyMid(pts)
      for (const p of pts) grow({ x: p.x, y: p.y, w: 0, h: 0 })
    }
    arrowBodies.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2"${dashAttr(op.dash)}/>`)
    if (op.arrowhead !== 'none') {
      arrowBodies.push(arrowHead(p2!, headFrom, op.arrowhead ?? 'arrow', color))
    }
    if (op.label !== undefined) {
      arrowBodies.push(
        `<text x="${labelAnchor.x}" y="${labelAnchor.y - 6}" font-family="${FONT}" font-size="11" fill="${INK}" text-anchor="middle" stroke="${SURFACE}" stroke-width="3" paint-order="stroke">${esc(op.label)}</text>`,
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
