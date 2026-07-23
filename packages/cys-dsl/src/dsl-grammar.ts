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
export const DSL_VERSION = 8

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
 * `@href(#a;#b;…)` 目标 id 的最大个数(v7:卡片显式语义引用列表)。
 *
 * 防护:AI 输出不可信,可能产超长引用列表(幻觉 / token 失控)→ 存储膨胀 / 应用卡顿(DoS)。
 * parser 解析 @href 时把目标数**静默截断**到上限(保前 N 个,不报错)。20 远超正常一张卡的
 * 出链需求(典型 <5)。
 *
 * 不 bump DSL_VERSION:parser 防护,不改语法形态(语法层面 @href 仍接任意长 `;` 列表)。
 */
export const DSL_MAX_HREF_TARGETS = 20

/**
 * `@tags(a;b;c)` 标签最大个数(v8:卡片标签列表)。
 *
 * 防护:AI 输出不可信,可能产超长标签列表 → 存储膨胀 / 渲染卡顿(DoS)。parser 解析 @tags
 * 时把个数**静默截断**到上限(保前 N 个,不报错)。20 远超正常一张卡的标签数(典型 <5)。
 *
 * 不 bump DSL_VERSION:parser 防护,不改语法形态(语法层面 @tags 仍接任意长 `;` 列表)。
 */
export const DSL_MAX_TAG_COUNT = 20

/**
 * `@links(<url>;…)` 链接最大个数(v8:卡片外链列表,仅 URL)。
 *
 * 防护同 @tags。10 覆盖正常一张卡的外链数(典型 1-3)。
 *
 * 不 bump DSL_VERSION:parser 防护,不改语法形态。
 */
export const DSL_MAX_LINK_COUNT = 10

/**
 * `@code(…)` 代码块最大个数(v8:卡片代码片段,可重复指令)。
 *
 * 防护:多 @code 指令累积,上限防 LLM 失控膨胀。8 远超正常一张卡的代码块数(典型 1)。
 *
 * 不 bump DSL_VERSION:parser 防护,不改语法形态。
 */
export const DSL_MAX_CODE_BLOCKS = 8

/**
 * `@quote(…)` 引文最大个数(v8:卡片引文,可重复指令)。
 *
 * 防护同 @code。8 远超正常一张卡的引文数(典型 1)。
 *
 * 不 bump DSL_VERSION:parser 防护,不改语法形态。
 */
export const DSL_MAX_QUOTES = 8

/**
 * `@type(…)` 合法值(v8:卡片语义类型,镜像 domain CardType)。
 *
 * 声明性事实,放语法单一可信源。parser(validEnum 收窄)与 sanitize(二次枚举校验)共用,
 * 消除两处重复列表。media 不进 DSL,故 image 卡只往返 type。
 *
 * 不 bump DSL_VERSION 于本常量本身:它是 @type 指令的值域(增删此枚举值 = 改语法 → bump,见上)。
 */
export const DSL_CARD_TYPES = ['note', 'image', 'link', 'code', 'quote'] as const
export type DslCardType = (typeof DSL_CARD_TYPES)[number]

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
  [card #id] @pos(x, y) @size(w, h) @color(red|yellow|blue|black|white|gray|grey) [@title("…")] [@content("…")] [@group("…")] [@href(#a;#b)] [@type(…)] [@tags(…)] [@links(…)] [@code(…)]… [@quote(…)]…
  [card #id create] @pos(x, y) @size(w, h) @color(c) [@title("…")] [@content("…")] [@type(…)] [@tags(…)] [@links(…)] [@code(…)]… [@quote(…)]…   # create a card; id must not exist
  #   @title: short card title (≤200 chars, int-tier). @content: long markdown body (≤8000 chars, long-tier).
  #   Quoted-string escapes: \\" = quote, \\\\ = backslash, \\n = newline, \\\` = backtick (so @content/@code carry multi-line markdown or code on one DSL line).
  #   @group("name") (v7): tag the card with a semantic group name (grouping/styling is a view concern, not DSL state).
  #     Assign a group to an EXISTING card without moving it: [card #id] @group("name") (no @pos needed).
  #   @href(#a;#b) (v7): declare explicit semantic links from this card to other card ids — a knowledge-graph edge
  #     with NO arrow drawn (distinct from body [[wikilinks]] which auto-build reference arrows). Semicolon-separated,
  #     leading # optional, deduped, ≤20 targets.
  #   @type(note|image|link|code|quote) (v8): the card's semantic type. One value. image carries no binary (media is
  #     excluded from DSL — heavy/privacy), so an image card round-trips its type only.
  #   @tags(a;b;c) (v8): the card's tags as one semicolon-separated list (each value URL-encoded, ≤20). Single directive.
  #   @links(<url>;…) (v8): the card's external links as one semicolon-separated list of URL-ENCODED urls (≤10).
  #     Only the URL round-trips (link-preview title/image are fetch-derived state, not DSL). Single directive.
  #   @code(lang,"code"[,"caption"]) (v8): one code block — lang is a bare token (ts/py/js/…), code is a quoted string
  #     (escapes carry newlines/quotes/backticks). REPEATABLE: emit one @code per block (≤8). caption optional.
  #   @quote("text"[,"attribution"[,"sourceUrl"]]) (v8): one quotation — text quoted, attribution/sourceUrl optional quoted.
  #     REPEATABLE: emit one @quote per quotation (≤8). Trailing args may be "" when a later one is present.
  #   Edit an EXISTING card's type/tags/links/code/quote in place WITHOUT moving it — omit @pos (geometry kept), same as @title/@content.
  # relational placement — PREFER for structured layouts (trees, lists, grids, hierarchies;
  #   anything row/column-shaped). The engine computes coords AND avoids overlaps, so you skip
  #   error-prone coordinate math. Reserve @pos for free/scattered positioning only:
  #   [card #id] right-of #anchor @gap(20)   # right of anchor, same row (x=anchor.x+w+gap; y=anchor.y)
  #   [card #id] below #anchor @gap(20)      # below anchor, same column (y=anchor.y+h+gap; x=anchor.x)
  #   (@gap defaults to 20 and is limited to 0..2000; anchor must be placed earlier or already exist)
  [rect #id] @pos(x, y) @size(w, h) @color(c) [@group("…")]
  [text #id] @pos(x, y) @text("...") @color(c) [@group("…")] [@compute("…")]
  #   @compute("expr") (v7, text only): a SAFE formula evaluated into the text's displayed value.
  #     Language: numbers, + - * / , parentheses, min/max/abs/round, and geometry refs #id.x|y|w|h.
  #     Example: [text #total] @pos(x,y) @compute("#a.w + #b.w"). NO code/eval; only element geometry
  #     (never card content). Recomputed on each apply (not live-reactive). On a failed formula the last text is kept.
  [frame #id] @pos(x, y) @size(w, h) @text("title") @color(c) [@group("…")]   # themed group/section container
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
  @type/@tags/@links/@code/@quote (v8) update an existing card's structured fields the same way (omit to leave unchanged).
  To edit an EXISTING card's content/color/size WITHOUT moving it, omit @pos (geometry is kept):
  [card #id] @title("…") @content("…")   # content-only edit, position preserved
  [card #id] @color(c)                   # recolor in place
  (@pos is still required to MOVE a card or to CREATE one.)
  IDs use letters, digits, underscore, hyphen, and colon. Lines starting with # are comments and ignored;
  colors are the ${DSL_COLORS.length} Bauhaus tokens only.`
