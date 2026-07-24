/**
 * DSL playground 预设示例(cys-dsl v8)。
 *
 * 每条都是**合法、空 host 可 apply** 的完整画布 DSL。关键:playground 每次从空 host
 * 重建,普通 `[card #id]`(update)在空 host 上会被 skipped —— 所以**所有 card 都用
 * `create`**。free shape(frame/rect/text)和 arrow 不需要 create(arrow 需端点已存在)。
 *
 * 这些预设既是 demo 内容,也展示 v8 各能力:关系式布局 / 结构化字段 / 三维箭头签名 /
 * @compute 安全公式 / @group 语义分组。
 */
export interface DslPreset {
  id: string
  label: string
  /** 一句话说这条展示什么 */
  hint: string
  dsl: string
}

export const DSL_PRESETS: readonly DslPreset[] = [
  {
    id: 'relational-tree',
    label: '关系式树',
    hint: 'right-of / below —— 引擎算坐标,AI/人不算坐标',
    dsl: `[frame #fr] @pos(40,40) @size(560,360) @text("关系式布局") @color(blue)
[card #root create] @pos(80,80) @size(140,80) @color(yellow) @title("根节点")
[card #c1 create] right-of #root @gap(24) @size(140,80) @color(blue) @title("子 A")
[card #c2 create] below #root @gap(24) @size(140,80) @color(blue) @title("子 B")
[card #c3 create] below #c1 @gap(24) @size(140,80) @color(blue) @title("孙")
[arrow #a1] from #root to #c1 @label("派生") @color(black) @dash(solid) @arrowhead(arrow)
[arrow #a2] from #root to #c2 @label("派生") @color(black) @dash(dashed) @arrowhead(triangle)
[arrow #a3] from #c1 to #c3 @label("细化") @color(gray) @dash(dotted) @arrowhead(none)`,
  },
  {
    id: 'v8-structured',
    label: 'v8 结构化卡',
    hint: '@type/@tags/@code/@quote —— 能 parse+apply+roundtrip(渲染不区分显示,见页面说明)',
    dsl: `[card #note create] @pos(60,60) @size(260,140) @color(red) @title("v8 结构化卡") @content("这张卡带类型/标签/代码/引文。") @type(code) @tags(前端;实验) @code(ts,"const x: number = 1\\nconsole.log(x)","示例") @quote("简单优于复杂。", "设计原则")
[card #link create] @pos(60,240) @size(260,90) @color(blue) @title("外链卡") @type(link) @links(https%3A%2F%2Fexample.com)`,
  },
  {
    id: 'arrow-signatures',
    label: '箭头三维签名',
    hint: 'dash + arrowhead + color = 关系语义签名',
    dsl: `[card #a create] @pos(60,60) @size(100,70) @color(blue) @title("A")
[card #b create] @pos(320,60) @size(100,70) @color(blue) @title("B")
[card #cc create] @pos(60,220) @size(100,70) @color(blue) @title("C")
[card #d create] @pos(320,220) @size(100,70) @color(blue) @title("D")
[arrow #r1] from #a to #b @label("实线") @color(black) @dash(solid) @arrowhead(arrow)
[arrow #r2] from #a to #cc @label("虚线") @color(red) @dash(dashed) @arrowhead(triangle)
[arrow #r3] from #b to #d @label("点线") @color(gray) @dash(dotted) @arrowhead(none)
[arrow #r4] from #cc to #d @label("曲线") @color(blue) @route(curve) @curve(260,160)`,
  },
  {
    id: 'compute-formula',
    label: '@compute 安全公式',
    hint: '只读几何 #id.x|y|w|h,禁 eval,每次 apply 重算',
    dsl: `[card #a create] @pos(60,60) @size(120,80) @color(yellow) @title("卡片 A")
[card #b create] @pos(240,60) @size(200,80) @color(yellow) @title("卡片 B")
[text #sum] @pos(60,180) @text("0") @color(black) @compute("#a.w + #b.w")
[text #maxh] @pos(60,210) @text("0") @color(black) @compute("max(#a.h, #b.h)")
[text #avg] @pos(60,240) @text("0") @color(red) @compute("(#a.w + #b.w) / 2")`,
  },
  {
    id: 'group-bands',
    label: '@group 语义分组',
    hint: '同名 @group 共享组色带(组名 hash → Bauhaus 色)',
    dsl: `[frame #fr1] @pos(40,40) @size(300,220) @text("战略") @color(blue)
[frame #fr2] @pos(380,40) @size(300,220) @text("执行") @color(red)
[card #s1 create] @pos(70,80) @size(130,70) @color(blue) @title("目标") @group("战略")
[card #s2 create] @pos(70,170) @size(130,70) @color(blue) @title("路径") @group("战略")
[card #e1 create] @pos(410,80) @size(130,70) @color(red) @title("本周") @group("执行")
[card #e2 create] @pos(410,170) @size(130,70) @color(red) @title("下周") @group("执行")`,
  },
] as const

/** 默认预填:关系式树(最直观展示转义核心)。 */
export const DEFAULT_DSL = DSL_PRESETS[0]!.dsl
