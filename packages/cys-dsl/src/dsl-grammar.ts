/**
 * dsl-grammar — cys-dsl 语法的单一可信源。
 *
 * 持有所有「声明性事实」:版号、指令种类、颜色枚举、规范文字描述(给 prompt/help)。
 * parser(dsl-parser.ts)和 serializer(canvas-dsl.ts)的代码级语法从此 import KINDS/COLORS;
 * AI prompt 和用户向语法帮助 import DSL_GRAMMAR_REFERENCE。
 *
 * 加新指令 = 改这里 + parser/serializer 各一处 + bump DSL_VERSION;prompt 自动跟随。
 * 这是为 (c2) prompt 加固做的联动准备——改 prompt 届时只改 REFERENCE 一处。
 *
 * bump 规则:增删指令种类 / 增删属性 / 改颜色枚举 → bump DSL_VERSION。
 * 纯改 prompt 措辞、改 parser 正则细节(不动语法)→ 不 bump。
 */
export const DSL_VERSION = 6

/**
 * `@text("...")` / `@label("...")` / `@title("...")` 值的最大字符数(int 级)。
 *
 * 防护:AI 输出不可信,可能产超长文本(幻觉 / 错误重复 / token 失控)→ 渲染溢出 / 存储
 * 膨胀 / 应用卡顿(DoS)。parser 在解析时把超长值**静默截断**到上限(不报错不 warn ——
 * parser 要 robust,坏一行不该整块丢)。
 *
 * 不 bump DSL_VERSION:这是 parser 防护,不改语法形态(语法层面 @text 仍接任意字符串,
 * 只是 parser 不接受超长)。200 覆盖正常画布标签/文本需求(标签通常 <20 字,文本标题 <50)。
 */
export const DSL_MAX_TEXT_LEN = 200

/**
 * `@content("...")` 值的最大字符数(v5:卡片正文 markdown,long 级)。
 *
 * 与 @title/@text 的 DSL_MAX_TEXT_LEN(int 级 200)区分:@content 是 long 级 —— 卡片正文是
 * markdown body,远长于标签/标题。8000 覆盖正常长笔记(~1000 词),同时防 LLM 失控膨胀(DoS)。
 * parser + sanitize 都按此截断(静默,不报错)。
 *
 * 不 bump DSL_VERSION:parser 防护,不改语法形态。
 */
export const DSL_MAX_CONTENT_LEN = 8000

/**
 * 文本截断到 max 个 UTF-16 码元,**不劈开代理对**(emoji / 增补平面字符占 2 码元)。
 *
 * 若切点正好落在高代理位(其配对的低代理位在 max 处、会被切掉),回退一位 —— 避免产生
 * 孤立代理位(渲染成坏字符、JSON.stringify 出 `\udxxx` 孤值)。parser(dsl-parser.ts)与
 * sanitize(dsl-sanitize.ts)共用这一处实现(消除两处重复 truncateTo;H 代理对安全)。
 *
 * max 为 0 / 空串安全:charCodeAt(-1)=NaN,不满足高代理位区间,slice(0,0)=''。
 */
export function truncateDslText(v: string, max: number): string {
  if (v.length <= max) return v
  let end = max
  const code = v.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1 // 高代理位 → 回退,不劈开
  return v.slice(0, end)
}

/** 指令种类(parser 识别 + serializer 序列化的集合)。freedraw 不在 DSL——程序自管(R2 + 渲染),
 *  非 DSL 可表达(点序列重、意义低、隐私);serialize 按 DSL_KINDS 过滤,freedraw 同 legacy 被丢。 */
export const DSL_KINDS = ['card', 'rect', 'frame', 'text', 'arrow'] as const
export type DslKind = (typeof DSL_KINDS)[number]

/** Bauhaus-6 颜色(canonical)。grey 是 gray 的输入别名。 */
export const DSL_COLORS = ['red', 'yellow', 'blue', 'black', 'white', 'gray'] as const
export type DslColor = (typeof DSL_COLORS)[number]

/** 输入别名(parser 接受 canonical ∪ 这些别名键)。 */
export const DSL_COLOR_ALIASES: Record<string, DslColor> = { grey: 'gray' }

/**
 * cys-dsl 语法的规范文字描述。给所有 AI prompt 和用户向语法帮助 import。
 * 指令 shape 取自原 canvas-prompt.ts 的 GRAMMAR(权威,与 parser 一致)+ 版号行。
 * 故意不含 [freedraw #id]——freedraw 不在 DSL(程序自管:R2 + 渲染;点序列重/意义低/隐私),AI 不该也不产。
 */
export const DSL_GRAMMAR_REFERENCE = `cys-dsl grammar v${DSL_VERSION} (one element per line):
  [card #id] @pos(x, y) @size(w, h) @color(red|yellow|blue|black|white|gray|grey) [@title("…")] [@content("…")]
  [card #id create] @pos(x, y) @size(w, h) @color(c) [@title("…")] [@content("…")]   # create a card; id must not exist
  #   @title: short card title (≤200 chars, int-tier). @content: long markdown body (≤8000 chars, long-tier).
  #   Quoted-string escapes: \\" = quote, \\\\ = backslash, \\n = newline (so @content carries multi-line markdown on one DSL line).
  # relational placement — PREFER for structured layouts (trees, lists, grids, hierarchies;
  #   anything row/column-shaped). The engine computes coords AND avoids overlaps, so you skip
  #   error-prone coordinate math. Reserve @pos for free/scattered positioning only:
  #   [card #id] right-of #anchor @gap(20)   # right of anchor, same row (x=anchor.x+w+gap; y=anchor.y)
  #   [card #id] below #anchor @gap(20)      # below anchor, same column (y=anchor.y+h+gap; x=anchor.x)
  #   (@gap defaults to 20 and is limited to 0..2000; anchor must be placed earlier or already exist)
  [rect #id] @pos(x, y) @size(w, h) @color(c)
  [text #id] @pos(x, y) @text("...") @color(c)
  [frame #id] @pos(x, y) @size(w, h) @text("title") @color(c)   # themed group/section container
  [arrow #id] from #a to #b @label("...") @color(c) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none) [@wikilink]
  [arrow #id] @pos(x, y) @size(w, h) @color(c)   # free arrow (no from/to)
  # arrow route (optional, to bend or elbow around obstacles):
  #   @route(curve) @curve(cx,cy)                 # smooth quadratic curve via one control point
  #   @route(elbow) @elbow(x,y;x,y)               # 1-2 corner points (semicolon-separated)
  #   (omit @route for a straight line)
  # @wikilink (optional, relation/free arrow): only on wikilink-auto arrows
  #   (meta.wikilink===true); distinguishes auto-built wikilink arrows from
  #   manual references arrows so the marker survives DSL round-trip.
Rules: card updates are the default; explicit create persists a new card before its host element (title/content optional).
  @title/@content (v5) update an existing card's title/body; "" clears it, omit to leave unchanged.
  To edit an EXISTING card's content/color/size WITHOUT moving it, omit @pos (geometry is kept):
  [card #id] @title("…") @content("…")   # content-only edit, position preserved
  [card #id] @color(c)                   # recolor in place
  (@pos is still required to MOVE a card or to CREATE one.)
  IDs use letters, digits, underscore, hyphen, and colon. Lines starting with # are comments and ignored;
  colors are the ${DSL_COLORS.length} Bauhaus tokens only.`
