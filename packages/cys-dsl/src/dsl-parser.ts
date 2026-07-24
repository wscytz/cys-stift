/**
 * DSL Parser — parses AI output (or pasted/edited DSL) for canvas layout.
 *
 * 架构(正则 → PEG 升级,2026-07):
 *   dsl.peggy(Peggy 语法,结构 tokenizer)—— pnpm gen:dsl → dsl-parser.gen.js
 *   本文件(TS 包装层)—— 按行调用生成 parser,做语义 coercion:
 *     Number / finite 守卫 / escape unescape / 颜色枚举校验 / elbow 拆分 / DSL_MAX_TEXT_LEN 截断
 *   永不抛错 + 坐标恒有限 + byte-equal round-trip 契约不变(见 dsl-* 测试)。
 *
 * 行级解析:按 \n 切行,逐行 parse Line 规则 → {kind, ds} 结构 → build{Card,Arrow,Free}
 * 组装 DslOp / 记 diagnostic。`#id` 也是 directive(等价旧"整行任意位置提取");directive*
 * 内的 skipChunk 吃未知残余 → 复刻旧正则的任意位置/任意顺序容错。
 */

import type { CardId, CardType, CodeBlock, Quote } from '@cys-stift/domain'
import {
  DSL_COLORS,
  DSL_COLOR_ALIASES,
  DSL_MAX_TEXT_LEN,
  DSL_MAX_CONTENT_LEN,
  DSL_MAX_HREF_TARGETS,
  DSL_MAX_TAG_COUNT,
  DSL_MAX_LINK_COUNT,
  DSL_MAX_CODE_BLOCKS,
  DSL_MAX_QUOTES,
  DSL_MAX_OPS,
  DSL_CARD_TYPES,
  truncateDslText,
} from './dsl-grammar'
// Peggy 生成;类型垫片见 dsl-parser.gen.d.ts
import { parse as parseLine } from './dsl-parser.gen.js'

// ── Operation types(导出签名零变更,下游 apply-layout/solver/sanitize/6 引用点依赖)────

export type DslCardOp = {
  type: 'card'
  cardId: CardId
  x: number
  y: number
  w?: number
  h?: number
  color?: string
  create?: boolean
  /** v5:卡片标题(短,≤DSL_MAX_TEXT_LEN)。serialize 由消费者注入;DSL apply 写回 Card.title。 */
  title?: string
  /** v5:卡片正文 markdown(长,≤DSL_MAX_CONTENT_LEN)。serialize 由消费者注入;DSL apply 写回 Card.body。 */
  content?: string
  /** B工程 pilot:关系式坐标。有 rel 时 x/y 是占位(0,0),求解器 solveRelational 填真值。
   *  right-of #anchor:x = anchor.x + anchor.w + gap;y = anchor.y
   *  below    #anchor:y = anchor.y + anchor.h + gap;x = anchor.x
   *  仅 AI 输入路径;serializeCanvas 永不 emit rel(rel 解决后画布存绝对坐标)。 */
  rel?: { dir: 'right-of' | 'below'; anchor: string; gap: number }
  /** v5(E):无 @pos 的"纯属性/内容编辑"标志。无 @pos(且非 create、非 rel)但携带
   *  title/content/color/size 之一时置真 —— apply 时(planCard)沿用现有卡几何,只更那些字段;
   *  x/y 为占位(0,0),apply 期忽略。serializeCanvas 永不 emit(始终绝对坐标)→ 输入专用。 */
  keepExistingPos?: boolean
  /** v7:语义分组名(directive,非新 kind)。落 element.meta.group;组样式/折叠是视图层,不进 DSL。 */
  group?: string
  /** v7:卡片显式语义引用目标 id 列表(KG 边,不画线)。落 element.meta.href。
   *  区别于正文 [[...]]→自动 references 箭头:这是 DSL 里直接声明的语义边。 */
  href?: string[]
  /** v8:卡片语义类型(@type)。media 不进 DSL,故 image 卡只往返 type。apply 写回 Card.type。 */
  cardType?: CardType
  /** v8:卡片标签**值**列表(@tags;颜色由 apply 层按 stableTagColor 指派,parser 不知色)。
   *  apply 映射成 TagRef[]。 */
  tags?: string[]
  /** v8:卡片外链 **URL** 列表(@links;仅 URL,预览 title/image 是抓取派生态不往返)。
   *  apply 映射成 LinkPreview[](fetchedAt=new Date())。 */
  links?: string[]
  /** v8:卡片代码块(@code,可重复)。apply 写回 Card.codeSnippets。 */
  code?: CodeBlock[]
  /** v8:卡片引文(@quote,可重复)。apply 写回 Card.quotes。 */
  quotes?: Quote[]
}

export type DslFreeOp =
  | {
      type: 'free'
      shape: 'rect'
      /** Element id (round-trip with serializeCanvas's `[rect #id]`). */
      id?: string
      x: number
      y: number
      w?: number
      h?: number
      color?: string
      /** v7:语义分组名。落 element.meta.group。 */
      group?: string
    }
  | {
      type: 'free'
      shape: 'text'
      /** Element id (round-trip with serializeCanvas's `[text #id]`). */
      id?: string
      x: number
      y: number
      w?: number
      h?: number
      text?: string
      color?: string
      /** v7:语义分组名。落 element.meta.group。 */
      group?: string
      /** v7:安全公式原文(仅 text 元素)。apply 时用受限递归下降求值器算(禁裸 eval),
       *  只引用元素几何 #id.x/y/w/h,结果写 element.text,原式存 element.meta.compute。 */
      compute?: string
    }
  | {
      type: 'free'
      shape: 'frame'
      /** Element id (round-trip with serializeCanvas's `[frame #id]`). */
      id?: string
      x: number
      y: number
      w?: number
      h?: number
      text?: string
      color?: string
      /** v7:语义分组名。落 element.meta.group。 */
      group?: string
    }

export type DslArrowOp = {
  type: 'arrow'
  /** Arrow element id (round-trip with serializeCanvas's `[arrow #id]`). When
   *  present and the host already has this arrow, applyArrowOp updates it in
   *  place (changing its relation signature) instead of creating a new one. */
  id?: string
  from: string
  to: string
  label?: string
  color?: string
  /** Relation signature line style (semantics): solid/dashed/dotted. */
  dash?: 'solid' | 'dashed' | 'dotted'
  /** Relation signature terminal (semantics): arrow/triangle/none. */
  arrowhead?: 'arrow' | 'triangle' | 'none'
  /** 自由箭头标记:无 from/to,pos+size 编码线段 bbox。 */
  freeArrow?: boolean
  /** 自由箭头 bbox(仅 freeArrow=true 时有意义)。 */
  x?: number
  y?: number
  w?: number
  h?: number
  /** 弯曲控制点(二次贝塞尔,绝对页坐标)。关系/自由箭头均可。 */
  curve?: { cx: number; cy: number }
  /** 箭头路由形态:straight(直线)/curve(弯曲)/elbow(折线)。缺省 straight。
   *  向后兼容:无 route 但有 curve → 当 curve(serialize 不为 straight 主动输出 route,
   *  除非显式切过)。 */
  route?: 'straight' | 'curve' | 'elbow'
  /** 折线折点(1-2 个,绝对页坐标)。route='elbow' 时用。 */
  elbow?: { x: number; y: number }[]
  /** 显式 wikilink 标记:仅 meta.wikilink===true 的箭头序列化时 emit `@wikilink`。
   *  区分自动建(wikilink)箭头与手动 references 箭头,让标记在 DSL round-trip 中存活。
   *  应用时(applyArrowOp)→ host 元素 meta.wikilink=true。 */
  wikilink?: boolean
}

export type DslOp = DslCardOp | DslFreeOp | DslArrowOp

/** A diagnostic describing a single malformed DSL line that was dropped. */
export type DslDiagnostic = {
  /** 1-based original line number in the source text. */
  line: number
  /** The trimmed source line that failed to parse. */
  text: string
  /** Short technical reason (English, dev-facing — dialog prefixes i18n). */
  message: string
}

// ── Grammar 产出结构(Peggy Line 规则返回值;unknown 经 LineResult 解释)─────────────

type DirectiveTuple =
  | ['id', string]
  | ['pos', string, string]
  | ['size', string, string]
  | ['color', string]
  | ['label', string]
  | ['text', string]
  | ['title', string]
  | ['content', string]
  | ['dash', string]
  | ['arrowhead', string]
  | ['route', string]
  | ['curve', string, string]
  | ['elbow', string]
  | ['rel', string, string]
  | ['gap', string]
  | ['create', true]
  | ['from', string]
  | ['to', string]
  | ['wikilink', true]
  | ['group', string]
  | ['href', string]
  | ['compute', string]
  | ['type', string]
  | ['tags', string]
  | ['links', string]
  | ['code', string, string, string | null]
  | ['quote', string, string | null, string | null]

/** directive* 收集的元组列表(null = skipChunk 消费的未知残余,过滤掉)。 */
type LineResult =
  | null // prose / 注释 / 围栏 / 空(静默 skip)
  | { kind: 'unknown' } // [ 开头但非已知 kind → unrecognized([freedraw] 也落此:freedraw 已出 DSL)
  | { kind: 'card'; ds: unknown[] }
  | { kind: 'arrow'; ds: unknown[] }
  | { kind: 'rect'; ds: unknown[] }
  | { kind: 'text'; ds: unknown[] }
  | { kind: 'frame'; ds: unknown[] }

// ── 语义 coercion(算法搬迁自旧 extract*,行为等价)──────────────────────────────

/** parser 接受的颜色集合 = DSL_COLORS ∪ aliases 键(dsl-sync 锁)。grey 存原样不归一。 */
const ACCEPTED_COLORS: ReadonlySet<string> = new Set([
  ...DSL_COLORS,
  ...Object.keys(DSL_COLOR_ALIASES),
])

/** 字符串 → 有限数;非有限(NaN/Infinity)归 0 —— 守 robustness 契约"坐标恒有限"。 */
function finiteNum(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** 颜色校验:接受 canonical ∪ 别名键;越界(green 等)→ undefined(不静默变黑)。 */
function validColor(raw: string): string | undefined {
  return ACCEPTED_COLORS.has(raw) ? raw : undefined
}

/** 枚举校验:grammar 捕获原始串(`[^)]+`),这里收窄到合法值;越界 → undefined。 */
function validEnum<T extends string>(raw: string, list: readonly T[]): T | undefined {
  return (list as readonly string[]).includes(raw) ? (raw as T) : undefined
}

/** 默认截断到 DSL_MAX_TEXT_LEN(@text/@label/@title,int 级)。@content 用
 *  truncateDslText(…, DSL_MAX_CONTENT_LEN)(long 级)。截断实现共用 dsl-grammar 的
 *  truncateDslText —— 代理对安全(不劈开 emoji),且 parser/sanitize 单一实现(G/H)。 */
function truncate(v: string): string {
  return truncateDslText(v, DSL_MAX_TEXT_LEN)
}

/** quoted-string 解码,是 escapeQuoted 的逆。Peggy escChar = '\\' . —— 任何 \X 转义对;
 *  \n→换行(v5,@content 多行 markdown),其余 \X→X(\"→", \\→\)。 */
function unescapeQuoted(v: string): string {
  return v.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c))
}

/** @elbow(x,y;x,y) 拆分:分号分隔,每个折点 x,y(支持负);过滤坏点,保好点(复刻 extractElbow)。 */
function parseElbow(raw: string): { x: number; y: number }[] | undefined {
  const pts = raw
    .split(';')
    .map((pair) => pair.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/))
    .filter(Boolean)
    .map((pm) => ({ x: Number(pm![1]), y: Number(pm![2]) }))
  return pts.length >= 1 ? pts.slice(0, 2) : undefined
}

/** @href(#a;#b) 拆分(v7):`;` 分隔目标 id,每个可有可无 `#` 前缀(归一去掉)。
 *  校验每个目标匹配 idChars(字母/数字/_/:-);过滤坏目标保好的,去重(保序),
 *  截断到 DSL_MAX_HREF_TARGETS(防 LLM 失控膨胀)。无有效目标 → undefined。 */
function parseHref(raw: string): string[] | undefined {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(';')) {
    const id = part.trim().replace(/^#/, '')
    if (!/^[a-zA-Z0-9_:-]+$/.test(id)) continue // 空 / 含非法字符 → 丢
    if (seen.has(id)) continue // 去重保序
    seen.add(id)
    out.push(id)
    if (out.length >= DSL_MAX_HREF_TARGETS) break // 截断到上限
  }
  return out.length >= 1 ? out : undefined
}

/** v8:卡片类型枚举用 dsl-grammar 的 DSL_CARD_TYPES(单一可信源;parser/sanitize 共用)。 */

/** v8:可重复指令(strict 模式 dup 检查豁免)—— @code/@quote 一指令一块/条,多个是合法的多块/多引文,
 *  不是重复错误。@tags/@links 仍是单指令列表(重复算 dup)。 */
const REPEATABLE_DIRECTIVES: ReadonlySet<string> = new Set(['code', 'quote'])

/** @tags(a;b;c) 拆分(v8):`;` 分隔,每个 trim + decodeURIComponent(序列化侧 encode 防碰撞);
 *  过滤空值,去重保序,截断到 DSL_MAX_TAG_COUNT。无有效 tag → undefined。是 metaTags 的逆。 */
function parseTagList(raw: string): string[] | undefined {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(';')) {
    let value = part.trim()
    if (value === '') continue
    try {
      value = decodeURIComponent(value)
    } catch {
      // 非法百分号编码(如裸 `%`)→ 用原串,不丢
    }
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= DSL_MAX_TAG_COUNT) break
  }
  return out.length >= 1 ? out : undefined
}

/** @links(<enc-url>;…) 拆分(v8):`;` 分隔,每个 trim + decodeURIComponent(序列化侧 encode,
 *  URL 含 `;`/`=`/`&`);过滤空值,去重保序,截断到 DSL_MAX_LINK_COUNT。无有效 url → undefined。
 *  产出 **URL 字符串列表**(apply 层映射 LinkPreview + fetchedAt)。是 metaLinks 的逆。 */
function parseLinkList(raw: string): string[] | undefined {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(';')) {
    let url = part.trim()
    if (url === '') continue
    try {
      url = decodeURIComponent(url)
    } catch {
      // 非法百分号编码 → 用原串,不丢
    }
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length >= DSL_MAX_LINK_COUNT) break
  }
  return out.length >= 1 ? out : undefined
}

// ── fold:directive 元组列表 → 结构化字段(首遇优先,复刻旧正则"首个 match"语义)────────

interface Folded {
  id?: string
  pos?: [number, number]
  size?: { w: number; h: number }
  color?: string
  label?: string
  text?: string
  title?: string
  content?: string
  dash?: string
  arrowhead?: string
  route?: string
  curve?: { cx: number; cy: number }
  elbow?: { x: number; y: number }[]
  rel?: { dir: string; anchor: string }
  gap?: number
  create?: boolean
  from?: string
  to?: string
  wikilink?: boolean
  group?: string
  href?: string[]
  compute?: string
  cardType?: CardType
  tags?: string[]
  links?: string[]
  code?: CodeBlock[]
  quotes?: Quote[]
}

function fold(ds: unknown[]): Folded {
  const a: Folded = {}
  for (const d of ds) {
    if (!Array.isArray(d)) continue // null(skipChunk)/非元组 → 跳过
    const [tag, v1, v2, v3] = d as [string, unknown, unknown, unknown]
    switch (tag) {
      case 'id': if (a.id === undefined) a.id = String(v1); break
      case 'pos': if (!a.pos) a.pos = [finiteNum(String(v1)), finiteNum(String(v2))]; break
      case 'size': if (!a.size) a.size = { w: finiteNum(String(v1)), h: finiteNum(String(v2)) }; break
      case 'color': if (a.color === undefined) a.color = validColor(String(v1)); break
      case 'label': if (a.label === undefined) a.label = truncate(unescapeQuoted(String(v1))); break
      case 'text': if (a.text === undefined) a.text = truncate(unescapeQuoted(String(v1))); break
      case 'title': if (a.title === undefined) a.title = truncate(unescapeQuoted(String(v1))); break
      case 'content': if (a.content === undefined) a.content = truncateDslText(unescapeQuoted(String(v1)), DSL_MAX_CONTENT_LEN); break
      case 'dash': if (!a.dash) a.dash = validEnum(String(v1), ['solid', 'dashed', 'dotted']); break
      case 'arrowhead': if (!a.arrowhead) a.arrowhead = validEnum(String(v1), ['arrow', 'triangle', 'none']); break
      case 'route': if (!a.route) a.route = validEnum(String(v1), ['straight', 'curve', 'elbow']); break
      case 'curve': if (!a.curve) a.curve = { cx: finiteNum(String(v1)), cy: finiteNum(String(v2)) }; break
      case 'elbow': if (!a.elbow) a.elbow = parseElbow(String(v1)); break
      case 'rel': if (!a.rel) a.rel = { dir: String(v1), anchor: String(v2) }; break
      case 'gap': if (a.gap === undefined) a.gap = finiteNum(String(v1)); break
      case 'create': if (!a.create) a.create = true; break
      case 'from': if (!a.from) a.from = String(v1); break
      case 'to': if (!a.to) a.to = String(v1); break
      case 'wikilink': if (!a.wikilink) a.wikilink = true; break
      case 'group': if (a.group === undefined) a.group = truncate(unescapeQuoted(String(v1))); break
      case 'href': if (!a.href) a.href = parseHref(String(v1)); break
      case 'compute': if (a.compute === undefined) a.compute = truncate(unescapeQuoted(String(v1))); break
      case 'type': {
        if (a.cardType === undefined) {
          const t = validEnum(String(v1), DSL_CARD_TYPES)
          if (t !== undefined) a.cardType = t // 非法 type(green 等)→ 不设,不静默变 note
        }
        break
      }
      case 'tags': if (a.tags === undefined) a.tags = parseTagList(String(v1)); break
      case 'links': if (a.links === undefined) a.links = parseLinkList(String(v1)); break
      case 'code': {
        // 可重复指令 → 累积成数组(非首遇优先);截断到 DSL_MAX_CODE_BLOCKS。code 走 long 级截断。
        if (a.code === undefined) a.code = []
        if (a.code.length < DSL_MAX_CODE_BLOCKS) {
          const code = truncateDslText(unescapeQuoted(String(v2)), DSL_MAX_CONTENT_LEN)
          const caption = v3 == null ? undefined : unescapeQuoted(String(v3))
          a.code.push({
            language: String(v1),
            code,
            ...(caption ? { caption } : {}),
          })
        }
        break
      }
      case 'quote': {
        // 可重复指令 → 累积成数组;截断到 DSL_MAX_QUOTES。text 走 long 级截断;空串占位归一 undefined。
        if (a.quotes === undefined) a.quotes = []
        if (a.quotes.length < DSL_MAX_QUOTES) {
          const text = truncateDslText(unescapeQuoted(String(v1)), DSL_MAX_CONTENT_LEN)
          const attribution = v2 == null ? undefined : unescapeQuoted(String(v2))
          const sourceUrl = v3 == null ? undefined : unescapeQuoted(String(v3))
          a.quotes.push({
            text,
            ...(attribution ? { attribution } : {}),
            ...(sourceUrl ? { sourceUrl } : {}),
          })
        }
        break
      }
    }
  }
  return a
}

// ── build:结构 → DslOp 或 diagnostic ──────────────────────────────────────────

type BuildResult = { op: DslOp } | { diag: string } | null

/** v8:把 fold 出的结构化字段(type/tags/links/code/quotes)拷到 card op —— 镜像 title/content/group/href
 *  的 if-set(缺省不带,apply 侧"缺省不改")。三个 buildCard 分支共用,消除重复。 */
function applyCardFieldsV8(op: DslCardOp, d: Folded): void {
  if (d.cardType !== undefined) op.cardType = d.cardType
  if (d.tags !== undefined) op.tags = d.tags
  if (d.links !== undefined) op.links = d.links
  if (d.code !== undefined) op.code = d.code
  if (d.quotes !== undefined) op.quotes = d.quotes
}

function buildCard(ds: unknown[]): BuildResult {
  const d = fold(ds)
  if (d.id === undefined) return { diag: 'missing #id' }
  if (d.rel) {
    const op: DslCardOp = {
      type: 'card',
      cardId: d.id as CardId,
      x: d.pos ? d.pos[0] : 0,
      y: d.pos ? d.pos[1] : 0,
      w: d.size?.w,
      h: d.size?.h,
      color: d.color,
      rel: {
        dir: d.rel.dir as 'right-of' | 'below',
        anchor: d.rel.anchor,
        gap: d.gap ?? 20,
      },
    }
    if (d.create) op.create = true
    if (d.title !== undefined) op.title = d.title
    if (d.content !== undefined) op.content = d.content
    if (d.group !== undefined) op.group = d.group
    if (d.href !== undefined) op.href = d.href
    applyCardFieldsV8(op, d)
    return { op }
  }
  if (d.pos) {
    const op: DslCardOp = {
      type: 'card',
      cardId: d.id as CardId,
      x: d.pos[0],
      y: d.pos[1],
      w: d.size?.w,
      h: d.size?.h,
      color: d.color,
    }
    if (d.create) op.create = true
    if (d.title !== undefined) op.title = d.title
    if (d.content !== undefined) op.content = d.content
    if (d.group !== undefined) op.group = d.group
    if (d.href !== undefined) op.href = d.href
    applyCardFieldsV8(op, d)
    return { op }
  }
  // v5(E):无 @pos 的非 create 卡片行,若携带 title/content/color/size 之一 = "纯属性/内容编辑"
  // (几何沿用现有卡,由 planCard 处理)。x/y 占位(0,0);裸行(无任何字段)与 create 仍 missing @pos。
  // v7:group/href 同为"无几何属性编辑"——给现有卡分组/加出链不该要求 @pos。
  // v8:type/tags/links/code/quotes 同理——给现有卡改结构化字段不要求 @pos。
  if (
    !d.create &&
    (d.title !== undefined || d.content !== undefined || d.color !== undefined || d.size !== undefined ||
      d.group !== undefined || d.href !== undefined || d.cardType !== undefined || d.tags !== undefined ||
      d.links !== undefined || d.code !== undefined || d.quotes !== undefined)
  ) {
    const op: DslCardOp = {
      type: 'card',
      cardId: d.id as CardId,
      x: 0,
      y: 0,
      keepExistingPos: true,
      ...(d.color !== undefined ? { color: d.color } : {}),
      ...(d.size ? { w: d.size.w, h: d.size.h } : {}),
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.content !== undefined ? { content: d.content } : {}),
      ...(d.group !== undefined ? { group: d.group } : {}),
      ...(d.href !== undefined ? { href: d.href } : {}),
    }
    applyCardFieldsV8(op, d)
    return { op }
  }
  return { diag: 'missing @pos' }
}

function buildArrow(ds: unknown[]): BuildResult {
  const d = fold(ds)
  const common = {
    id: d.id,
    label: d.label,
    color: d.color,
    dash: d.dash as 'solid' | 'dashed' | 'dotted' | undefined,
    arrowhead: d.arrowhead as 'arrow' | 'triangle' | 'none' | undefined,
    curve: d.curve,
    route: d.route as 'straight' | 'curve' | 'elbow' | undefined,
    elbow: d.elbow,
    wikilink: d.wikilink || undefined,
  }
  if (d.from && d.to) {
    const op: DslArrowOp = {
      type: 'arrow',
      from: d.from,
      to: d.to,
      ...common,
    }
    return { op }
  }
  if (d.pos && d.size) {
    const op: DslArrowOp = {
      type: 'arrow',
      from: '',
      to: '',
      freeArrow: true,
      x: d.pos[0],
      y: d.pos[1],
      w: d.size.w,
      h: d.size.h,
      ...common,
    }
    return { op }
  }
  return { diag: 'free arrow missing @pos/@size' }
}

function buildFree(kind: 'rect' | 'text' | 'frame', ds: unknown[]): BuildResult {
  const d = fold(ds)
  if (d.id === undefined) return { diag: 'missing #id' }
  if (!d.pos) return { diag: 'missing @pos' }
  if (kind === 'rect') {
    const op: DslFreeOp = {
      type: 'free', shape: 'rect', id: d.id,
      x: d.pos[0], y: d.pos[1], w: d.size?.w, h: d.size?.h, color: d.color,
      ...(d.group !== undefined ? { group: d.group } : {}),
    }
    return { op }
  }
  if (kind === 'text') {
    const op: DslFreeOp = {
      type: 'free', shape: 'text', id: d.id,
      x: d.pos[0], y: d.pos[1], text: d.text, color: d.color,
      ...(d.group !== undefined ? { group: d.group } : {}),
      ...(d.compute !== undefined ? { compute: d.compute } : {}),
    }
    return { op }
  }
  const op: DslFreeOp = {
    type: 'free', shape: 'frame', id: d.id,
    x: d.pos[0], y: d.pos[1], w: d.size?.w, h: d.size?.h, text: d.text, color: d.color,
    ...(d.group !== undefined ? { group: d.group } : {}),
  }
  return { op }
}

function buildOp(r: LineResult): BuildResult {
  if (r === null) return null // 静默 skip
  if (r.kind === 'unknown') return { diag: 'unrecognized element kind' }
  if (r.kind === 'card') return buildCard(r.ds)
  if (r.kind === 'arrow') return buildArrow(r.ds)
  return buildFree(r.kind, r.ds) // rect / text / frame
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a DSL block into ops AND per-line diagnostics for dropped lines.
 *
 * 行分类(保留 1-based 原始行号,编辑器告诉用户哪行被丢、为什么 —— 转义核心卖点的反信任问题):
 *
 * - empty / `# comment` / 非 `[` 散文 / 围栏 → 静默 skip(无 error)
 * - `[` 行解析后缺关键字段 → 记 {@link DslDiagnostic}
 *
 * 永不抛错:grammar 本身因尾部 `.*` 对任何 `[` 行都 succeed;极端输入(控制字符等)若仍
 * 抛 → 该行静默跳过(不崩整块)。坐标恒 finite(finiteNum 守卫)。
 */
export function parseDslWithDiagnostics(dslText: string): {
  ops: DslOp[]
  errors: DslDiagnostic[]
} {
  const ops: DslOp[] = []
  const errors: DslDiagnostic[] = []

  const rawLines = dslText.split('\n')
  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1
    const line = rawLines[i]!.trim()
    if (!line) continue

    let result: LineResult
    try {
      result = parseLine(line, { startRule: 'Line' }) as LineResult
    } catch {
      // grammar 理论上不抛(尾部 .* 兜底);真抛了 → 静默跳过该行(永不抛错契约)
      continue
    }

    const built = buildOp(result)
    if (built === null) continue // prose skip
    if ('op' in built) {
      if (ops.length >= DSL_MAX_OPS) {
        errors.push({ line: lineNo, text: line, message: `元素数已达上限 ${DSL_MAX_OPS},本行及后续被截断` })
        break
      }
      ops.push(built.op)
    } else {
      errors.push({ line: lineNo, text: line, message: built.diag })
    }
  }

  return { ops, errors }
}

/**
 * Strict AI mode. User-pasted legacy text keeps using the compatibility parser,
 * while model output must contain only complete directives. Unknown residual
 * chunks and duplicate directives are errors instead of being swallowed by
 * Peggy's compatibility skipChunk rule.
 */
export function parseDslStrictWithDiagnostics(dslText: string): {
  ops: DslOp[]
  errors: DslDiagnostic[]
} {
  const ops: DslOp[] = []
  const errors: DslDiagnostic[] = []
  const rawLines = dslText.split('\n')
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index]!.trim()
    const lineNo = index + 1
    if (!line) continue
    // grammar 承诺"Lines starting with # are comments and ignored";strict 比 graceful 严在
    // 拒散文,但**注释行照放行**(与 grammar 一致,也让 AI 输出里夹带的 # 注释不报错)。
    if (line.startsWith('#')) continue
    if (!line.startsWith('[')) {
      errors.push({ line: lineNo, text: line, message: 'unexpected prose or markdown' })
      continue
    }
    let result: LineResult
    try {
      result = parseLine(line, { startRule: 'Line' }) as LineResult
    } catch {
      errors.push({ line: lineNo, text: line, message: 'malformed directive' })
      continue
    }
    if (result === null || result.kind === 'unknown') {
      errors.push({ line: lineNo, text: line, message: 'unrecognized directive' })
      continue
    }
    const tuples = result.ds.filter(Array.isArray) as DirectiveTuple[]
    const seen = new Set<string>()
    const duplicate = tuples.find(([tag]) => {
      if (REPEATABLE_DIRECTIVES.has(tag)) return false // v8:@code/@quote 可重复(一指令一块/条),不算 dup
      if (seen.has(tag)) return true
      seen.add(tag)
      return false
    })
    if (duplicate) {
      errors.push({ line: lineNo, text: line, message: `duplicate ${duplicate[0]} directive` })
      continue
    }
    const headerClosed = result.kind === 'arrow'
      ? /^\[arrow(?:\s+#[a-zA-Z0-9_:-]+)?\]/.test(line)
      : new RegExp(`^\\[${result.kind}\\s+#[a-zA-Z0-9_:-]+(?:\\s+create)?\\]`).test(line)
    const allowedClosingChunk = line.startsWith('[arrow]') ? 0 : 1
    const unknownChunks = result.ds.filter((entry) => entry === null).length
    if (!headerClosed || unknownChunks > allowedClosingChunk) {
      errors.push({ line: lineNo, text: line, message: 'unknown residual text' })
      continue
    }
    const built = buildOp(result)
    if (built === null) {
      errors.push({ line: lineNo, text: line, message: 'unsupported directive' })
    } else if ('op' in built) {
      if (ops.length >= DSL_MAX_OPS) {
        errors.push({ line: lineNo, text: line, message: `元素数已达上限 ${DSL_MAX_OPS},本行及后续被截断` })
        break
      }
      ops.push(built.op)
    } else {
      errors.push({ line: lineNo, text: line, message: built.diag })
    }
  }
  return { ops, errors }
}

/**
 * Parse a DSL block (the AI's output) into a list of layout operations.
 *
 * Graceful: unrecognized lines are skipped (no throw). The DSL is
 * intended for AI-to-machine communication — if the AI produces
 * invalid syntax, we silently ignore bad lines.
 *
 * Thin wrapper over {@link parseDslWithDiagnostics}: returns only the ops
 * (the diagnostics are irrelevant for the AI path). Behavior is unchanged.
 */
export function parseDsl(dslText: string): DslOp[] {
  return parseDslWithDiagnostics(dslText).ops
}
