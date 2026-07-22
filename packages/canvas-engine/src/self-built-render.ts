
import type { CanvasElement, CanvasView } from './canvas-host'
import { arrowEndpoints, dashPattern, arrowheadPoints, arrowRoute, elbowSegments, arrowHeadAngle, autoElbowPath, cardObstacles } from './self-built-arrow'
import { normalizeBox } from './bounds'
import { freedrawPointsOf } from './self-built-freedraw'
import { smoothBezierSegments } from './smooth-path'
import { markdownPreview } from './markdown-preview'
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
export type CardInfo = { title: string; body: string; type: string; pinned: boolean; subtitle?: string }

/**
 * 卡片显示模式(密度切换,用户设置驱动,2026-07):
 * - `compact`(默认,现状):title + body 3 行截断。
 * - `auto`:title + body 全文 wrap 行(上限 CARD_AUTO_MAX_LINES),卡高随内容。
 * - `title`:仅 title + 类型标,不画 body(最大密度)。
 * - `subtitle`:title + 副标题(body 首个 `##` 或首行,web 层 getCardInfo 算好塞 CardInfo.subtitle)。
 * 模式决定卡高 + 行数(模式管高度,用户不拖卡高;宽度仍可拖)。视图设置,不进 DSL。
 */
export type CardDisplayMode = 'compact' | 'auto' | 'title' | 'subtitle'

// ── 卡片度量常量(与 drawElement 卡分支一致:pad=10 / 类型标 pad / title pad+16 / body pad+38 / 行高 16)──
export const CARD_PAD = 10
/** body 首行的 y 偏移(= pad + 38:类型标 + title 区)。 */
export const CARD_TITLE_AREA = 48
export const CARD_LINE_H = 16
export const CARD_BOTTOM_PAD = 10
/** auto 模式最大行数(超长文档不占满屏,截断)。 */
export const CARD_AUTO_MAX_LINES = 30

/**
 * 可注入的 token 解析器:把设计 token 名解析成具体值。
 * 默认实现 domTokenResolver 直接 getComputedStyle 读 CSS 变量(= cys-stift DOM 行为);
 * 消费者可注入自己的(如 SVG 导出 / 独立 package 上下文),引擎核心不耦合 DOM 也不认识 cys-stift 调色板。
 */
export type TokenResolver = (name: string, fallback: string) => string

/**
 * Token 值缓存(模块级)。getComputedStyle 是强制同步 reflow 的昂贵 DOM 操作;
 * 渲染每帧对每个可见元素查多次 token,50 元素 ≈ 600 次/帧 = 36000 次/秒 →
 * 长会话布局抖动 + GC 压力(真 bug,长会话卡顿主因)。token 集合固定(~15 key),
 * 值只在主题切换时变,缓存命中率 ≈ 100%。
 *
 * 失效:监听 <html> 的 data-theme 属性变化(主题切换的唯一入口,见 theme.ts)。
 * MutationObserver 是 DOM API,但 domTokenResolver 本身就是 DOM 实现(代表"引擎
 * 在 DOM 环境的默认 resolver"),在此耦合 DOM 不破坏引擎的框架无关性——纯
 * TokenResolver 接口仍可注入无 DOM 版。
 */
const _tokenCache = new Map<string, string>()
let _tokenCacheWired = false

function wireTokenCacheInvalidation(): void {
  if (_tokenCacheWired || typeof window === 'undefined') return
  _tokenCacheWired = true
  // 首次懒查时填充;主题变 → 清空,下次查重填。
  const ob = new MutationObserver(() => _tokenCache.clear())
  ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

export const domTokenResolver: TokenResolver = (name, fallback) => {
  if (typeof window === 'undefined') return fallback
  const cached = _tokenCache.get(name)
  if (cached !== undefined) return cached
  wireTokenCacheInvalidation()
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const resolved = v || fallback
  _tokenCache.set(name, resolved)
  return resolved
}

export function renderElements(
  ctx: CanvasRenderingContext2D,
  toDraw: CanvasElement[],
  view: CanvasView,
  cssWidth: number,
  cssHeight: number,
  getCardInfo: (id: string) => CardInfo | null,
  background: string,
  tokenResolver: TokenResolver = domTokenResolver,
  // 端点解析用全集:关系箭头的 from/to 端点指向其它元素(常是 card),渲染时靠
  // arrowEndpoints(arrow, allForResolution) find 出来。若传的只是「要画的」子集
  // (如视锥剔除后的可见列表),端点 card 被剔除→ find 不到→ from/to=null→ 箭头不画。
  // 故实时渲染时这里传 getSortedElements()(全集),SVG 导出等不剔除场景传同一全集两次。
  allForResolution: CanvasElement[] = toDraw,
  // 卡片显示模式(密度切换,web 层 settings 传入;默认 compact = 旧行为)。
  cardMode: CardDisplayMode = 'compact',
): void {
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, cssWidth, cssHeight)

  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  for (const el of toDraw) {
    // drawElement 接收的 allElements 是端点解析全集(非 toDraw),保证箭头即便其
    // 端点 card 被视锥剔除也能 resolve 端点画出来(高倍放大消失 bug 的根因)。
    drawElement(ctx, el, allForResolution, getCardInfo, tokenResolver, cardMode)
  }
  ctx.restore()
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  allElements: CanvasElement[],
  getCardInfo: (id: string) => CardInfo | null,
  tokenResolver: TokenResolver,
  cardMode: CardDisplayMode,
): void {
  switch (el.kind) {
    case 'card': {
      const info = getCardInfo(el.id)
      // 卡片背景 + 边框
      ctx.beginPath()
      ctx.roundRect(el.x, el.y, el.w, el.h, 4)
      ctx.fillStyle = tokenResolver('--color-white', '#ffffff')
      ctx.fill()
      ctx.strokeStyle = tokenResolver('--color-gray', '#d9d9d9')
      ctx.lineWidth = 1
      ctx.stroke()
      // 内容(对齐 card-shape-util:类型标 mono 灰 + title display + body 3 行)
      const pad = 10
      ctx.textBaseline = 'top'
      if (!info) {
        ctx.fillStyle = tokenResolver('--color-gray', '#666666')
        ctx.font = `12px ${tokenResolver('--font-mono', 'monospace')}`
        ctx.fillText('(untitled)', el.x + pad, el.y + pad)
        break
      }
      // pinned ★ 右上
      if (info.pinned) {
        ctx.fillStyle = tokenResolver('--color-yellow', '#eab308')
        ctx.font = `14px ${tokenResolver('--font-mono', 'monospace')}`
        ctx.fillText('★', el.x + el.w - 18, el.y + 6)
      }
      // 类型标(mono 灰 大写)
      ctx.fillStyle = tokenResolver('--color-gray', '#666666')
      ctx.font = `10px ${tokenResolver('--font-mono', 'monospace')}`
      ctx.fillText(info.type.toUpperCase(), el.x + pad, el.y + pad)
      // title(content 字体:用户卡片标题,带中文系统回退,Canvas ctx.font 按串内顺序回退)。
      ctx.fillStyle = tokenResolver('--color-black', '#0a0a0a')
      ctx.font = `500 15px ${tokenResolver('--font-content', 'Inter, "PingFang SC", "Microsoft YaHei UI", sans-serif')}`
      ctx.fillText(info.title || '(untitled)', el.x + pad, el.y + pad + 16)
      // body(content 字体,按 cardMode 渲染:title=0 行 / subtitle=1 行副标题 / compact=3 / auto=全行截断)
      const displayBody = markdownPreview(info.body, Number.POSITIVE_INFINITY)
      if (displayBody && cardMode !== 'title') {
        ctx.fillStyle = tokenResolver('--color-black-soft', '#475569')
        ctx.font = `12px ${tokenResolver('--font-content', 'Inter, "PingFang SC", "Microsoft YaHei UI", sans-serif')}`
        if (cardMode === 'subtitle') {
          // 副标题:web 层 getCardInfo 算好的首 ## / 首行(plainPreview 剥 markdown)。
          // wrap 取首行(副标题语义=1 行):subtitleOf 截 60 字,窄卡(默认 240px)放不下
          // 会横溢出边界,走 wrapLines 与 compact/auto 同口径自然截宽。
          if (info.subtitle) {
            const subLines = wrapLines(info.subtitle, el.w - pad * 2, ctx)
            if (subLines[0]) ctx.fillText(subLines[0], el.x + pad, el.y + pad + 38)
          }
        } else {
          // compact / auto:wrap 行,cap 截断(compact=3,auto=CARD_AUTO_MAX_LINES)。
          const lines = wrapLines(displayBody, el.w - pad * 2, ctx)
          const cap = cardMode === 'compact' ? 3 : CARD_AUTO_MAX_LINES
          const lineCount = Math.min(cap, lines.length)
          for (let i = 0; i < lineCount; i++) {
            ctx.fillText(lines[i]!, el.x + pad, el.y + pad + 38 + i * 16)
          }
        }
      }
      break
    }
    case 'frame': {
      // 主题分区容器:半透明填充 + 虚线边框 + 左上角标题(mono)。
      // 最底层(z=-1),作背景分区,卡片/箭头等压在其上。几何包含语义——
      // 卡片 bbox 在 frame 内即"属于"该分区(不存 children id,动态算)。
      ctx.save()
      ctx.fillStyle = colorOf(el.color, tokenResolver)
      ctx.globalAlpha = 0.06
      ctx.fillRect(el.x, el.y, el.w, el.h)
      ctx.globalAlpha = 1
      ctx.strokeStyle = colorOf(el.color, tokenResolver)
      ctx.lineWidth = 1.5
      ctx.setLineDash([8, 4])
      ctx.strokeRect(el.x, el.y, el.w, el.h)
      ctx.setLineDash([])
      // 标题(左上角,mono 小号,带半透明底条保证可读)。
      const title = el.text || ''
      if (title) {
        ctx.font = `11px ${tokenResolver('--font-mono', 'monospace')}`
        ctx.textBaseline = 'top'
        const tw = ctx.measureText(title).width
        ctx.fillStyle = tokenResolver('--color-white', '#ffffff')
        ctx.globalAlpha = 0.85
        ctx.fillRect(el.x, el.y, tw + 12, 18)
        ctx.globalAlpha = 1
        ctx.fillStyle = colorOf(el.color, tokenResolver)
        ctx.fillText(title, el.x + 6, el.y + 3)
      }
      ctx.restore()
      break
    }
    case 'rect': {
      ctx.beginPath()
      ctx.rect(el.x, el.y, el.w, el.h)
      ctx.strokeStyle = colorOf(el.color, tokenResolver)
      ctx.stroke()
      break
    }
    case 'freedraw': {
      const pts = freedrawPointsOf(el) ?? []
      if (pts.length === 0) break
      if (pts.length === 1) {
        // 单点 freedraw:只 moveTo 无 lineTo → stroke() 画不出东西 = 不可见幽灵。
        // 画一个小圆点(fill,与 SVG 导出 <circle> 两视图一致)。点坐标是绝对页坐标。
        ctx.beginPath()
        ctx.arc(pts[0]![0], pts[0]![1], 2, 0, Math.PI * 2)
        ctx.fillStyle = colorOf(el.color, tokenResolver)
        ctx.fill()
        break
      }
      ctx.beginPath()
      ctx.moveTo(pts[0]![0], pts[0]![1])
      // Catmull-Rom 平滑贝塞尔(与 SVG 导出同源 smoothBezierSegments → 五视图一致)。
      const segs = smoothBezierSegments(pts)
      for (const s of segs) ctx.bezierCurveTo(s.cp1[0], s.cp1[1], s.cp2[0], s.cp2[1], s.p1[0], s.p1[1])
      ctx.strokeStyle = colorOf(el.color, tokenResolver)
      ctx.lineWidth = 2
      ctx.stroke()
      break
    }
    case 'arrow': {
      const { from, to } = arrowEndpoints(el, allElements)
      if (!from || !to) break
      const stroke = colorOf(el.color, tokenResolver)
      const route = arrowRoute(el)
      const ctrl = route === 'curve' && el.curve ? { x: el.curve.cx, y: el.curve.cy } : null
      // elbow:用户手设(elbow 非空)→ elbowSegments 原路径;空 → autoElbowPath 自动绕障
      // (obstacles = 除 from/to 端点卡外的所有 card bbox)。避障是渲染层启发式,手动优先。
      const obstacles =
        route === 'elbow' && !(el.elbow && el.elbow.length > 0)
          ? cardObstacles(allElements, new Set([el.from, el.to].filter((v): v is string => !!v)))
          : []
      const segs =
        route === 'elbow'
          ? el.elbow && el.elbow.length > 0
            ? elbowSegments(el, from, to)
            : autoElbowPath(el, from, to, obstacles)
          : null
      // 线段(语义线型:dash)。route 决定路径形状:
      //  straight: from→to 直线 / curve: 二次贝塞尔 / elbow: 折线 polyline。
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      if (ctrl) ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y)
      else if (segs) for (let i = 1; i < segs.length; i++) ctx.lineTo(segs[i]!.x, segs[i]!.y)
      else ctx.lineTo(to.x, to.y)
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2
      ctx.setLineDash(dashPattern(el.dash))
      ctx.stroke()
      ctx.setLineDash([]) // 复位,免污染后续绘制
      // 箭头头:角度取终点切线(按 route + 实际渲染路径 segs/ctrl,见 arrowHeadAngle)。
      // 自动绕障 elbow 也走 segs(含折点),免得头朝向和折线不一致。
      const angle = arrowHeadAngle(route, from, to, { ctrl, segs })
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
        // label 放路径中点:直线/折线 = 折点序列中点;曲线 = 贝塞尔 t=0.5。
        let mx: number, my: number
        if (ctrl) {
          mx = 0.25 * from.x + 0.5 * ctrl.x + 0.25 * to.x
          my = 0.25 * from.y + 0.5 * ctrl.y + 0.25 * to.y
        } else if (segs) {
          const mid = segs[Math.floor(segs.length / 2)]!
          mx = mid.x; my = mid.y
        } else {
          mx = (from.x + to.x) / 2
          my = (from.y + to.y) / 2
        }
        // 半透明底条 halo:标签压在箭头线/笔画上时可读。textBaseline 显式 'top'
        // (本分支原本不设,继承上一处绘制 → 位置非确定;helper 内部统一)。
        drawTextWithHalo(
          ctx,
          [el.text],
          mx,
          my,
          `12px ${tokenResolver('--font-body', 'Inter, sans-serif')}`,
          12,
          stroke,
          tokenResolver,
        )
      }
      break
    }
    case 'text': {
      const lines = (el.text ?? '').split('\n')
      if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) break
      drawTextWithHalo(
        ctx,
        lines,
        el.x,
        el.y,
        `14px ${tokenResolver('--font-body', 'Inter, sans-serif')}`,
        18,
        colorOf(el.color, tokenResolver),
        tokenResolver,
      )
      break
    }
    default:
      // legacy — 后续 Task。
      break
  }
}

/**
 * 半透明底条(halo)+ 多行文本。镜像 frame title halo 模式(可读性底条),泛化到 N 行:
 * 设 textBaseline='top' → anchor (x,y) = 首行左上角;逐行 measureText 取最大宽;画
 * 画布色半透明 fillRect 底条;复位 alpha 后逐行 fillText。全空文本早退(不画底不画字)。
 * 供 arrow label + 独立 text 元素用;card 文字自带卡 fill 背景、frame title 自有 halo,
 * 均不走本函数。颜色/字体全走 tokenResolver,不写裸 hex。
 */
function drawTextWithHalo(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  font: string,
  lineHeight: number,
  color: string,
  tokenResolver: TokenResolver,
  padX = 6,
  padY = 3,
  alpha = 0.85,
): void {
  if (lines.every((ln) => ln.length === 0)) return
  ctx.font = font
  ctx.textBaseline = 'top'
  let maxW = 0
  for (const ln of lines) {
    const w = ctx.measureText(ln.length ? ln : ' ').width
    if (w > maxW) maxW = w
  }
  ctx.fillStyle = tokenResolver('--color-white', '#ffffff')
  ctx.globalAlpha = alpha
  ctx.fillRect(x - padX, y - padY, Math.ceil(maxW) + padX * 2, lines.length * lineHeight + padY * 2)
  ctx.globalAlpha = 1
  ctx.fillStyle = color
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, x, y + i * lineHeight)
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
export function colorOf(c: string | undefined, tokenResolver: TokenResolver = domTokenResolver): string {
  const tokenFor: Record<string, string> = {
    blue: '--color-blue',
    red: '--color-red',
    yellow: '--color-yellow',
    gray: '--color-gray',
    grey: '--color-gray',
    white: '--color-white',
    black: '--color-black',
  }
  return tokenResolver(tokenFor[c ?? 'black'] ?? '--color-black', '#0a0a0a')
}

/**
 * 读 CSS 变量(设计 token);SSR 或变量缺失时回退 fallback。
 *
 * = domTokenResolver 的别名(UI 层 self-canvas.tsx / dev/page.tsx 仍用此名,保留 DOM 调用)。
 * 引擎核心改走可注入的 tokenResolver;默认 = domTokenResolver(= 此函数),现有行为不变。
 */
export const readToken: TokenResolver = domTokenResolver

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
  tokenResolver: TokenResolver = domTokenResolver,
): void {
  if (selectedIds.length === 0) return
  const sel = new Set(selectedIds)
  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  ctx.strokeStyle = tokenResolver('--color-blue', '#1d4ed8')
  ctx.lineWidth = 1.5 / view.zoom
  ctx.setLineDash([6 / view.zoom, 4 / view.zoom])
  const hs = 3 / view.zoom // handle 半边长 → 6px 方块
  for (const el of elements) {
    if (!sel.has(el.id)) continue
    if (el.kind === 'arrow') {
      // 箭头:不画 bbox 框(w=h=0 的关系箭头框是点),改按 route 画手柄。
      //  - straight/curve:中点圆点(拖动设 curve 弯曲)
      //  - elbow:每个折点方块手柄(拖动改折点位置)
      const { from, to } = arrowEndpoints(el, elements)
      if (from && to) {
        const route = arrowRoute(el)
        ctx.setLineDash([])
        if (route === 'elbow') {
          // 折点手柄:方块(白填 + 蓝描),每个 elbow 一个。无折点时不画(退化直线段)。
          for (const ep of el.elbow ?? []) {
            ctx.fillStyle = tokenResolver('--color-white', '#ffffff')
            ctx.fillRect(ep.x - hs, ep.y - hs, hs * 2, hs * 2)
            ctx.strokeStyle = tokenResolver('--color-blue', '#1d4ed8')
            ctx.lineWidth = 1.5 / view.zoom
            ctx.strokeRect(ep.x - hs, ep.y - hs, hs * 2, hs * 2)
          }
        } else {
          // 中点手柄(蓝圆点):curve = 贝塞尔 t=0.5,straight = 线段中点。
          // straight 时也画——提示用户可拖出 curve(拖后 route 变 curve)。
          let mx: number, my: number
          if (route === 'curve' && el.curve) {
            mx = 0.25 * from.x + 0.5 * el.curve.cx + 0.25 * to.x
            my = 0.25 * from.y + 0.5 * el.curve.cy + 0.25 * to.y
          } else {
            mx = (from.x + to.x) / 2
            my = (from.y + to.y) / 2
          }
          ctx.fillStyle = tokenResolver('--color-blue', '#1d4ed8')
          ctx.beginPath()
          ctx.arc(mx, my, 4 / view.zoom, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = tokenResolver('--color-white', '#ffffff')
          ctx.lineWidth = 1.5 / view.zoom
          ctx.stroke()
        }
      }
      // 复位虚线选中框:箭头手柄用实线([]),text 在 arrow 之上层(KIND_LAYER 4>3),
      // 不复位会让后续 text 的选中框画成实线。与非箭头分支末尾的复位同构。
      ctx.setLineDash([6 / view.zoom, 4 / view.zoom])
      continue
    }
    const b = normalizeBox(el) // 负 bbox(自由箭头)归一化,选中框/handle 才画对
    // dashed 选中框(外扩 2px)
    ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
    // 四角 handle 方块(白填 + 蓝描)
    const corners: [number, number][] = [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x, b.y + b.h],
      [b.x + b.w, b.y + b.h],
    ]
    ctx.setLineDash([])
    ctx.fillStyle = tokenResolver('--color-white', '#ffffff')
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
  tokenResolver: TokenResolver = domTokenResolver,
): void {
  if (rect.w === 0 || rect.h === 0) return
  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  ctx.fillStyle = tokenResolver('--color-blue', '#1d4ed8')
  ctx.globalAlpha = 0.1
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = tokenResolver('--color-blue', '#1d4ed8')
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

/**
 * mode + body + width -> {lineCount, height}(纯函数,卡高派生核心)。
 *
 * - title:0 行,最小高。
 * - subtitle:body 非空 -> 1 行(副标题文本由 web 层 getCardInfo 算,这里只定几何)。
 * - compact:min(3, wrapped) 行。
 * - auto:min(CARD_AUTO_MAX_LINES, wrapped) 行(超长截断)。
 * height = CARD_TITLE_AREA + lineCount·CARD_LINE_H + CARD_BOTTOM_PAD。
 * 需 ctx 做 wrap 测量(compact/auto);title/subtitle 不依赖 ctx(但签名统一传)。
 */
export function resolveCardLayout(
  mode: CardDisplayMode,
  body: string,
  width: number,
  ctx: CanvasRenderingContext2D,
): { lineCount: number; height: number } {
  const baseH = CARD_TITLE_AREA + CARD_BOTTOM_PAD
  const displayBody = markdownPreview(body, Number.POSITIVE_INFINITY)
  if (mode === 'title' || !displayBody) return { lineCount: 0, height: baseH }
  if (mode === 'subtitle') return { lineCount: 1, height: baseH + CARD_LINE_H }
  const cap = mode === 'compact' ? 3 : CARD_AUTO_MAX_LINES
  const wrapped = wrapLines(displayBody, width - CARD_PAD * 2, ctx)
  const lineCount = Math.min(cap, wrapped.length)
  return { lineCount, height: baseH + lineCount * CARD_LINE_H }
}
