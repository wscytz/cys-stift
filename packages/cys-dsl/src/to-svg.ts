/**
 * to-svg — cys-dsl ops → 独立 SVG(零依赖,预览级)。
 *
 * 执行意向书 Step 1 的 render 承诺:CLI `render --svg` 输出 SVG(默认输出 JSON Canvas)。
 * 自包含:色值直接落设计 token 实值(packages/ui tokens.css 浅色主题取值,2026-10),
 * 不 import canvas-engine(web 版 elements-to-svg 依赖宿主 token 注入,搬不动)。
 *
 * 保真边界(如实声明,不冒充完整渲染):
 * - **快照渲染器**:只画本条 ops/DSL 中带独立几何的元素。它不是增量补丁解释器 ——
 *   不绘制 existingGeometry 里的已有元素,也不把 delete / 纯内容编辑应用到已有画布。
 * - 卡片 = 描边矩形 + 标题 + 最多 3 行内容(超出省略号);不渲染 media/tag chips/组色带。
 * - @compute 不在此求值(CLI pipeline 只 parse→sanitize→solve):text 只有 compute 无 text 时
 *   渲染公式原文前缀 '='。
 * - 关系箭头端点**只在本批可画元素**(card/free,且非 delete/keepExistingPos)的几何里解析,
 *   贴边交点连线;端点缺失 → 跳过并留原因(带源行号)。existingGeometry 不参与端点解析。
 * - delete 指令是 no-op:不绘制、不登记几何(删除由 apply 层执行,快照不模拟画布变更)。
 * - 纯内容/属性编辑(keepExistingPos,op.x/y 是占位 0,0)没有独立几何 → skipped 留原因,
 *   绝不猜原点画到 (0,0)。
 * - 默认路由自动避障:直连段穿过卡/矩形时自动绕行走廊(L/Z 形候选,端点重贴边,全清才采纳);
 *   显式 route/curve/elbow 不干预。route=elbow 未给折点 = 正交自动路由(中线 Z / 避障绕行)。
 *   frame 是容器、text 无边界,都不算障碍。折线转角圆角化(渲染层美化,不改几何)。
 * - 路由 straight/curve/elbow 都画;arrowhead arrow=开口 V / triangle=实心三角 / none=无线帽。
 */
import type { DslOp } from './dsl-parser.js'
import { parseDslWithDiagnostics } from './dsl-parser.js'
import { sanitizeDslOps } from './dsl-sanitize.js'
import { solveRelational, type ExistingGeom } from './dsl-relational-solver.js'
import { planRoute } from './routing.js'

/** 外部 JSON ops 的坐标上限：超过后贝塞尔/折线数学可能溢出成 Infinity。 */
const SVG_COORD_LIMIT = 1e7

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

/** 可视化数值选项的门:必须是有限正数,否则回落缺省值。
 *  防 NaN/Infinity/0/负数经 JS 调用方(或 as any)进入 SVG 属性。 */
function positiveOption(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** 没画的 op 及原因(诚实留痕:不静默丢)。 */
export interface SvgSkip {
  /** 该 op 在传给 toSvg 的 ops 数组中的下标(跨阶段时以 line 为准,别拿它当源行号)。 */
  opIndex: number
  /** op 的可读标识(如 `card #a` / `arrow #e`)。 */
  op: string
  reason: string
  /** 源 DSL 行号(1-based;parse/sanitize/solve 透传,手工构造 ops 时可能缺失)。 */
  line?: number
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

/** 统一记账 skipped:自动带源行号(有则带),避免各分支漏 line 或错用 opIndex。 */
function recordSkip(skipped: SvgSkip[], opIndex: number, op: DslOp, label: string, reason: string): void {
  skipped.push({
    opIndex,
    op: label,
    reason,
    ...(op.line !== undefined ? { line: op.line } : {}),
  })
}

/** sanitize/solver 诊断 → 公共诊断:保留 opIndex,并用该阶段 ops 回填源行号。
 *  两个阶段的 opIndex 都指向各自阶段输出的 ops 数组;跨阶段定位请认 line。 */
function pushStageDiagnostic(
  diagnostics: RenderDslDiagnostic[],
  stage: 'sanitize' | 'solver',
  message: string,
  ops: DslOp[],
  opIndex: number,
): void {
  const line = ops[opIndex]?.line
  diagnostics.push({
    stage,
    message,
    opIndex,
    ...(line !== undefined ? { line } : {}),
  })
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
function arrowHead(tip: Pt, from: Pt, kind: 'arrow' | 'triangle', color: string, len = 12): string {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x)
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

/** 正交路由的无障碍缺省折点:按主方向取中线 Z;已对齐则直连(空)。 */
function midZWaypoints(p1: Pt, p2: Pt): Pt[] {
  if (p1.y === p2.y || p1.x === p2.x) return []
  if (Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y)) {
    const mx = (p1.x + p2.x) / 2
    return [{ x: mx, y: p1.y }, { x: mx, y: p2.y }]
  }
  const my = (p1.y + p2.y) / 2
  return [{ x: p1.x, y: my }, { x: p2.x, y: my }]
}

/** 折线路径转圆角路径:每个内点用二次贝塞尔切角(半径 ≤8 且 ≤两侧半段长;
 *  相邻重复点先去重)。端点与首末线段方向不变,箭头朝向不受影响;点数 <3 原样直连。 */
function roundedPolyPath(pts: Pt[]): string {
  const uniq = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y)
  if (uniq.length < 3) return `M ${uniq.map((p) => `${p.x} ${p.y}`).join(' L ')}`
  const R = 8
  let d = `M ${uniq[0]!.x} ${uniq[0]!.y}`
  for (let i = 1; i < uniq.length - 1; i++) {
    const prev = uniq[i - 1]!
    const cur = uniq[i]!
    const next = uniq[i + 1]!
    const lin = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const lout = Math.hypot(next.x - cur.x, next.y - cur.y)
    const r = Math.min(R, lin / 2, lout / 2)
    const inPt = { x: cur.x - ((cur.x - prev.x) / lin) * r, y: cur.y - ((cur.y - prev.y) / lin) * r }
    const outPt = { x: cur.x + ((next.x - cur.x) / lout) * r, y: cur.y + ((next.y - cur.y) / lout) * r }
    d += ` L ${inPt.x} ${inPt.y} Q ${cur.x} ${cur.y} ${outPt.x} ${outPt.y}`
  }
  d += ` L ${uniq[uniq.length - 1]!.x} ${uniq[uniq.length - 1]!.y}`
  return d
}

/**
 * 默认路由自动避障:直连段穿过障碍时,生成绕行路标再整段验证。候选四族:
 * L 形 2 个 / 命中包围盒外扩 Z 形 4 个 / 障碍间隙走廊 Z 形(两轴各若干——
 * 直连线同时擦到两簇障碍时,包围盒外扩走廊会全撞墙,列间走廊才是活路)/
 * 全部障碍外包盒四向兜底(前面全灭时宁可绕远不可穿模)。
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
  // 兜底族:绕开全部障碍的外包盒四向——前几族全灭时宁可绕远不可穿模
  // (长度天然最大,只在短候选都失败时胜出;源/目标被围死才算真无解)
  const gMinX = Math.min(...rects.map((r) => r.x))
  const gMinY = Math.min(...rects.map((r) => r.y))
  const gMaxX = Math.max(...rects.map((r) => r.x + r.w))
  const gMaxY = Math.max(...rects.map((r) => r.y + r.h))
  cands.push(
    [{ x: p1.x, y: gMinY - margin }, { x: p2.x, y: gMinY - margin }],
    [{ x: p1.x, y: gMaxY + margin }, { x: p2.x, y: gMaxY + margin }],
    [{ x: gMinX - margin, y: p1.y }, { x: gMinX - margin, y: p2.y }],
    [{ x: gMaxX + margin, y: p1.y }, { x: gMaxX + margin, y: p2.y }],
  )
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

/** 渲染观感选项(全部可缺省;缺省输出与 v10 逐字节一致,不破坏既有调用方)。
 *  动机:外部消费方(宣传视频/draw skill)过去只能手画箭头——层级、线宽、halo、
 *  标签字号都调不了。现在把产品 KIND_LAYER(箭头在卡之上)与物料观感开放成选项。
 *  数值选项契约:**有限正数**;NaN/Infinity/≤0 一律回落缺省值(不把毒值写进 SVG)。 */
export interface ToSvgOptions {
  /** 箭头层画在节点之上(与产品 KIND_LAYER 同序:arrow=3 > card=2)。
   *  缺省 false = 旧观感(箭头在卡之下,预览更干净)。 */
  arrowsOnTop?: boolean
  /** 关系线主宽(有限正数)。缺省 2。 */
  strokeWidth?: number
  /** 主线下先铺一条纸色 halo(线更突出,又不破纸面品牌感)。缺省 false。 */
  halo?: boolean
  /** 箭头头部长度(px,有限正数)。缺省 12。 */
  arrowHeadLength?: number
  /** 箭头标签字号(有限正数)。缺省 11;标签自带纸色描边底,宽度随字号缩放。 */
  labelFontSize?: number
}

export interface RenderDslSvgOptions extends ToSvgOptions {
  /** **仅相对布局求解上下文**:id → 矩形(可带 group)。传给 solveRelational 作锚点/碰撞避让;
   *  不绘制其中元素,也不参与箭头端点解析(只存在于这里的 id 不能作为 from/to)。
   *  delete / 纯内容编辑也不会被应用到这些几何上——renderDslSvg 是快照渲染器,不是补丁解释器。 */
  existingGeometry?: Record<string, ExistingGeom>
}

/** 渲染管线诊断。
 *  - parse/warning:带源行号(line)。
 *  - sanitize/solver:带 opIndex(该阶段 ops 数组下标,已由 renderDslSvg 回填源行号 line)。 */
export type RenderDslDiagnostic = {
  stage: 'parse' | 'warning' | 'sanitize' | 'solver'
  message: string
  /** 源 DSL 行号(1-based)。 */
  line?: number
  /** sanitize/solver 诊断对应的 op 下标(该阶段 ops 数组;跨阶段定位优先用 line)。 */
  opIndex?: number
}

/**
 * 本批 ops → 独立 SVG(**快照**,不做跨批/跨画布解析)。
 *
 * 箭头端点只在**本批可画元素**登记的几何中解析:card 与带 id 的 free;
 * `delete` 与纯内容编辑(keepExistingPos)不登记几何,因此也不能被箭头引用。
 * 端点缺失 → `skipped` 留原因(有源行号时一并带上),绝不产悬空线。
 *
 * `opIndex` 是传入 ops 数组下标;若调用方自行跨阶段拼接(parse→sanitize→solve),
 * 定位源行请用 `line`,不要假设 opIndex 等于行号。
 */
export function toSvg(ops: DslOp[], options: ToSvgOptions = {}): { svg: string; skipped: SvgSkip[] } {
  const skipped: SvgSkip[] = []
  const strokeWidth = positiveOption(options.strokeWidth, 2)
  const headLen = positiveOption(options.arrowHeadLength, 12)
  const labelFontSize = positiveOption(options.labelFontSize, 11)
  const labelHaloWidth = Math.max(3, Math.round(labelFontSize / 4))
  const arrowsOnTop = options.arrowsOnTop === true
  const halo = options.halo === true
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
  // 对抗性契约:坐标非有限(NaN/Infinity,可经 JSON 1e999 / 上游数值 bug 进入)→ 记 skipped
  // 不登记 —— 绝不让 "NaN"/"Infinity" 字面量落进 svg 属性毒化 viewBox 与整个渲染
  const finiteRect = (r: Rect): boolean =>
    Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!
    // delete 是画布变更指令,不是可画元素:快照不执行删除,也不登记它的占位几何
    // (否则会凭空多出一张 (0,0) 卡,并让箭头端点/避障误解析到被删元素)。
    if (op.delete) continue
    if (op.type === 'card') {
      // 纯内容/属性编辑:x/y 是 parser 占位 (0,0),没有独立几何 —— 不能猜原点。
      if (op.keepExistingPos === true) {
        recordSkip(skipped, i, op, `card ${op.cardId}`, '纯内容/属性编辑无 @pos(占位 0,0),快照渲染不猜原点')
        continue
      }
      const r = { x: op.x, y: op.y, w: op.w ?? CARD_DEFAULT_W, h: op.h ?? CARD_DEFAULT_H }
      if (!finiteRect(r)) {
        recordSkip(skipped, i, op, `card ${op.cardId}`, '坐标含 NaN/Infinity,不渲染')
        continue
      }
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
      if (!finiteRect(r)) {
        recordSkip(skipped, i, op, `free ${op.id}`, '坐标含 NaN/Infinity,不渲染')
        continue
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
    if (op.delete) continue // delete 永远不画(快照不执行画布变更)
    if (op.type === 'card') {
      if (op.keepExistingPos === true) continue // 首遍已记 skipped:无独立几何,不猜原点
      const r = geom.get(String(op.cardId))
      if (!r) continue // 首遍判非有限已记 skipped
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
      let r: Rect | undefined = op.id != null ? geom.get(op.id) : undefined
      if (op.id != null && !r) continue // 首遍判非有限已记 skipped(避免二次入 skipped)
      if (!r) {
        r = {
          x: op.x,
          y: op.y,
          w: op.w ?? (op.shape === 'text' ? TEXT_DEFAULT_W : CARD_DEFAULT_W),
          h: op.h ?? (op.shape === 'text' ? TEXT_DEFAULT_H : CARD_DEFAULT_H),
        }
        if (!finiteRect(r)) {
          recordSkip(skipped, i, op, `free ${i}`, '坐标含 NaN/Infinity,不渲染')
          continue
        }
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
      if (![p1.x, p1.y, p2.x, p2.y].every(Number.isFinite)) {
        recordSkip(skipped, i, op, `arrow ${op.id ?? ''}`.trim(), '坐标含 NaN/Infinity,不渲染')
        continue
      }
    } else {
      const src = geom.get(op.from)
      const dst = geom.get(op.to)
      if (!src || !dst) {
        recordSkip(
          skipped,
          i,
          op,
          `arrow ${op.id ?? `${op.from}→${op.to}`}`,
          `端点 ${!src ? `#${op.from}` : `#${op.to}`} 不存在于本批可画元素(快照只解析本批声明的 card/free;existingGeometry 不参与端点解析),不渲染`,
        )
        continue
      }
      srcRect = src
      dstRect = dst
      p1 = borderPoint(src, dst.x + dst.w / 2, dst.y + dst.h / 2)
      p2 = borderPoint(dst, src.x + src.w / 2, src.y + src.h / 2)
      // External JSON ops can carry non-finite / non-numeric curve points; they
      // are interpolated into the `d` attribute. Normalize and fall back to the
      // midpoint so a malformed op can never emit NaN or inject attributes.
      const elbowPoints = Array.isArray(op.elbow)
        ? op.elbow
            .map((point) => {
              if (!point || typeof point !== 'object') return null
              const x = Number((point as { x?: unknown }).x)
              const y = Number((point as { y?: unknown }).y)
              return Number.isFinite(x) && Number.isFinite(y) &&
                Math.abs(x) <= SVG_COORD_LIMIT && Math.abs(y) <= SVG_COORD_LIMIT
                ? { x, y }
                : null
            })
            .filter((point): point is { x: number; y: number } => point !== null)
        : []
      if (op.route === 'elbow' && elbowPoints.length > 0) {
        mid = elbowPoints
      } else if (op.route === 'elbow') {
        // route=elbow 未给折点:正交自动路由——求解器(A* 正交可见图)优先,
        // 无解退启发式绕行,再退主方向中线 Z(已对齐则直连);端点随路径重贴边
        const planned = planRoute(p1!, p2!, src, dst, obstacles, 'orthogonal')
        if (planned && planned.length >= 2) {
          p1 = planned[0]!
          p2 = planned[planned.length - 1]!
          mid = planned.slice(1, -1)
        } else {
          const detour = routeAround(p1!, p2!, src, dst, obstacles)
          const w = detour ? detour.slice(1, -1) : midZWaypoints(p1!, p2!)
          if (w.length > 0) {
            p1 = borderPoint(src, w[0]!.x, w[0]!.y)
            p2 = borderPoint(dst, w[w.length - 1]!.x, w[w.length - 1]!.y)
            mid = w
          }
        }
      } else if (op.route === undefined && op.curve === undefined) {
        // 默认路由自动避障:求解器规划(free 模式直连已清返回 null=保持直连),
        // null 且确有障碍挡路时退启发式候选族;显式 route/curve 交给作者意图。
        // 返回整条重贴边路径,端点一并替换(箭头方向跟着新末端走,不沿卡边滑)
        const planned = planRoute(p1!, p2!, src, dst, obstacles, 'free')
        if (planned && planned.length >= 2) {
          p1 = planned[0]!
          p2 = planned[planned.length - 1]!
          mid = planned.slice(1, -1)
        } else {
          const detour = routeAround(p1!, p2!, src, dst, obstacles)
          if (detour) {
            p1 = detour[0]!
            p2 = detour[detour.length - 1]!
            mid = detour.slice(1, -1)
          }
        }
      }
    }
    const route = op.route ?? (op.curve !== undefined ? 'curve' : 'straight')
    let d: string
    let headFrom: Pt
    let labelAnchor: Pt
    if (route === 'curve') {
      const curveX = Number(op.curve?.cx)
      const curveY = Number(op.curve?.cy)
      const c = op.curve !== undefined &&
        Number.isFinite(curveX) && Number.isFinite(curveY) &&
        Math.abs(curveX) <= SVG_COORD_LIMIT && Math.abs(curveY) <= SVG_COORD_LIMIT
        ? { cx: curveX, cy: curveY }
        : { cx: (p1!.x + p2!.x) / 2, cy: (p1!.y + p2!.y) / 2 - 40 }
      d = `M ${p1!.x} ${p1!.y} Q ${c.cx} ${c.cy} ${p2!.x} ${p2!.y}`
      headFrom = { x: c.cx, y: c.cy }
      labelAnchor = { x: (p1!.x + p2!.x) / 2, y: (p1!.y + p2!.y) / 2 }
      grow({ x: p1!.x, y: p1!.y, w: 0, h: 0 })
      grow({ x: p2!.x, y: p2!.y, w: 0, h: 0 })
      grow({ x: c.cx, y: c.cy, w: 0, h: 0 })
    } else {
      const pts = [p1!, ...mid, p2!]
      d = roundedPolyPath(pts)
      headFrom = pts[pts.length - 2]!
      labelAnchor = polyMid(pts)
      for (const p of pts) grow({ x: p.x, y: p.y, w: 0, h: 0 })
    }
    if (halo) {
      arrowBodies.push(
        `<path d="${d}" fill="none" stroke="${SURFACE}" stroke-width="${strokeWidth + 5}" stroke-linecap="round" opacity="0.92"/>`,
      )
    }
    arrowBodies.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"${dashAttr(op.dash)}/>`)
    if (op.arrowhead !== 'none') {
      arrowBodies.push(arrowHead(p2!, headFrom, op.arrowhead ?? 'arrow', color, headLen))
    }
    if (op.label !== undefined) {
      arrowBodies.push(
        `<text x="${labelAnchor.x}" y="${labelAnchor.y - 6}" font-family="${FONT}" font-size="${labelFontSize}" fill="${INK}" text-anchor="middle" stroke="${SURFACE}" stroke-width="${labelHaloWidth}" paint-order="stroke">${esc(op.label)}</text>`,
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
  const arrowGroup = `  <g>\n${arrowBodies.map((b) => `    ${b}`).join('\n')}\n  </g>`
  const nodeGroup = `  <g>\n${nodeBodies.map((b) => `    ${b}`).join('\n')}\n  </g>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">\n` +
    `  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${SURFACE}"/>\n` +
    (arrowsOnTop ? `${nodeGroup}\n${arrowGroup}\n` : `${arrowGroup}\n${nodeGroup}\n`) +
    `</svg>\n`
  return { svg, skipped }
}

/**
 * 一把梭 API:DSL 文本 → **快照** SVG。外部消费方(宣传视频/draw skill/CLI)不再自己串
 * parse→sanitize→solve→render,也不再手画箭头——避障路由、圆角折线、贴边端点、
 * 标签 halo 都在这条链里。
 *
 * ## 契约:快照渲染器,不是增量补丁解释器
 * - 只画本条 DSL 中**显式声明了独立几何**的 card/free,以及端点可解析的 arrow。
 * - `existingGeometry` **仅**喂 `solveRelational`(相对布局锚点/碰撞避让)。它不会:
 *   把已有元素画出来;让箭头端点解析到已有元素;把 delete/内容编辑应用到已有画布。
 *   因此 `[arrow] from #已有卡 to #本批卡` 会进 `skipped`(reason 带 #id,line 指向源行)。
 * - `delete` 是 no-op:不绘制、不登记几何(删除归 apply 层,快照不模拟画布变更)。
 * - 纯内容/属性编辑(keepExistingPos)没有独立几何 → 进 `skipped`,绝不猜 (0,0) 原点。
 * - 要预览「已有画布 + 增量修改」,请宿主先把目标元素序列化成带 @pos/@size 的完整 DSL;
 *   本函数不做 apply/补丁语义。
 *
 * 诊断(parse/warning/sanitize/solver)原样透出;sanitize/solver 诊断附 `opIndex` 并回填
 * `line`。`skipped[].opIndex` 是 solved ops 下标,`skipped[].line` 是源 DSL 行号——
 * 跨阶段定位请用 line,不要拿 opIndex 当行号。
 */
export function renderDslSvg(
  dsl: string,
  options: RenderDslSvgOptions = {},
): { svg: string; skipped: SvgSkip[]; diagnostics: RenderDslDiagnostic[] } {
  const parsed = parseDslWithDiagnostics(dsl)
  const diagnostics: RenderDslDiagnostic[] = []
  for (const error of parsed.errors ?? []) {
    diagnostics.push({ stage: 'parse', message: error.message, line: error.line })
  }
  for (const warning of parsed.warnings ?? []) {
    diagnostics.push({ stage: 'warning', message: warning.message, line: warning.line })
  }
  const sanitized = sanitizeDslOps(parsed.ops)
  for (const diagnostic of sanitized.diagnostics) {
    pushStageDiagnostic(diagnostics, 'sanitize', diagnostic.message, sanitized.ops, diagnostic.opIndex)
  }
  let existingGeometry: Map<string, ExistingGeom> | undefined
  if (options.existingGeometry) {
    existingGeometry = new Map(Object.entries(options.existingGeometry))
  }
  const solved = solveRelational(sanitized.ops, existingGeometry)
  for (const diagnostic of solved.diagnostics) {
    pushStageDiagnostic(diagnostics, 'solver', diagnostic.message, solved.ops, diagnostic.opIndex)
  }
  // existingGeometry 只服务相对求解,不向下传:toSvg 是快照层,不能借它画已有元素/解析端点。
  const { existingGeometry: _existingGeometry, ...toSvgOptions } = options
  const { svg, skipped } = toSvg(solved.ops, toSvgOptions)
  return { svg, skipped, diagnostics }
}
