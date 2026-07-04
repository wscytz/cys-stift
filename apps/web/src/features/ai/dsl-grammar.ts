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
export const DSL_VERSION = 1

/**
 * `@text("...")` / `@label("...")` 值的最大字符数。
 *
 * 防护:AI 输出不可信,可能产超长文本(幻觉 / 错误重复 / token 失控)→ 渲染溢出 / 存储
 * 膨胀 / 应用卡顿(DoS)。parser 在解析时把超长值**静默截断**到上限(不报错不 warn ——
 * parser 要 robust,坏一行不该整块丢)。
 *
 * 不 bump DSL_VERSION:这是 parser 防护,不改语法形态(语法层面 @text 仍接任意字符串,
 * 只是 parser 不接受超长)。200 覆盖正常画布标签/文本需求(标签通常 <20 字,文本标题 <50)。
 * STATE 缺口⑩。
 */
export const DSL_MAX_TEXT_LEN = 200

/** 指令种类(parser 识别 + serializer 序列化的集合;freedraw 是透传 no-op)。 */
export const DSL_KINDS = ['card', 'rect', 'frame', 'text', 'arrow', 'freedraw'] as const
export type DslKind = (typeof DSL_KINDS)[number]

/** Bauhaus-6 颜色(canonical)。grey 是 gray 的输入别名。 */
export const DSL_COLORS = ['red', 'yellow', 'blue', 'black', 'white', 'gray'] as const
export type DslColor = (typeof DSL_COLORS)[number]

/** 输入别名(parser 接受 canonical ∪ 这些别名键)。 */
export const DSL_COLOR_ALIASES: Record<string, DslColor> = { grey: 'gray' }

/**
 * cys-dsl 语法的规范文字描述。给所有 AI prompt 和用户向语法帮助 import。
 * 指令 shape 取自原 canvas-prompt.ts 的 GRAMMAR(权威,与 parser 一致)+ 版号行。
 * 故意不含 [freedraw #id]——AI 不该产手绘(freedraw 仍在 DSL_KINDS 给 parser/serializer 用)。
 */
export const DSL_GRAMMAR_REFERENCE = `cys-dsl grammar v${DSL_VERSION} (one element per line):
  [card #id] @pos(x, y) @size(w, h) @color(red|yellow|blue|black|white|gray|grey)
  [rect #id] @pos(x, y) @size(w, h) @color(c)
  [text #id] @pos(x, y) @text("...") @color(c)
  [frame #id] @pos(x, y) @size(w, h) @text("title") @color(c)   # themed group/section container
  [arrow #id] from #a to #b @label("...") @color(c) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)
  [arrow #id] @pos(x, y) @size(w, h) @color(c)   # free arrow (no from/to)
  # arrow route (optional, to bend or elbow around obstacles):
  #   @route(curve) @curve(cx,cy)                 # smooth quadratic curve via one control point
  #   @route(elbow) @elbow(x,y;x,y)               # 1-2 corner points (semicolon-separated)
  #   (omit @route for a straight line)
Rules: card is update-only (content comes from elsewhere, you may reposition but not create orphan cards);
  lines starting with # are comments and ignored; colors are the ${DSL_COLORS.length} Bauhaus tokens only.`
