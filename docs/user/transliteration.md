# 转义(Transliteration)手册

> **cy's Stift 的核心卖点。** 画布上的可转义结构元素,能用一段确定的文字描述;这段文字,能反向改画布。
> 所以**任何 AI(或任何人)都能靠读写一段文字来提出画布编辑**——不必碰几何 API、不必连某个 SDK、不必发手绘点序列。
>
> 这份手册给"想理解 / 想用好转义"的人:是什么 / 语法 / 双向闭环 / AI 与人怎么驱动 / 边界与隐私。

---

## 一、转义是什么

大多数画布工具(tldraw / Miro / Excalidraw)的画布是**图形**——只有看得见、用鼠标改。我们的画布是**可被文字完全描述、且文字可改的图形**。

同一段画布,既是屏幕上的几何,也是这样一段文字:

```
[frame #fr-health] @pos(40,40) @size(360,520) @text("健康") @color(blue)
[card #c1] @pos(80,80) @size(120,80) @color(blue)
[card #c2] @pos(80,320) @size(120,80) @color(blue)
[arrow #a1] from #c1 to #c2 @label("相辅") @color(blue)
```

- **画布 → 文字**:序列化(serialize)。整张画布压成一段可读文本。
- **文字 → 画布**:解析 + 应用(parse + apply)。一段文本变回画布上的几何。

这两向**对称、确定**:卡片几何/颜色、文本/框、关系签名和自由箭头可往返;卡片正文、媒体和手绘点序列有意留在本地存储,不进入 DSL(见 §六隐私)。这就是"转义"。

---

## 二、为什么这是卖点

| | 普通画布 | cy's Stift 转义 |
|---|---|---|
| AI 想改画布 | 要调专有 API / 接 SDK / 塞 JSON schema | **读写一段文字** |
| 换设备/换实例 | 导出私有格式文件 | **文本本身就是交换格式**,复制粘贴即可 |
| 版本/差异 | 二进制 blob,看不出改了啥 | **diff 一目了然**(就是文本 diff) |
| 自动化/脚本 | 要逆向工程内部结构 | **DSL 即脚本** |

一句话:**把画布编辑的门槛,从"懂这个软件的 API"降到"会读会写一段文字"。** 任何 AI 都够格。

---

## 三、DSL 语法速查

每行一个元素。`#id` 是元素标识(往返用),`@pos/@size/@color` 是几何与样式。当前语法是 **cys-dsl v7**(v5 加卡片内容;v6 将 freedraw 移出 DSL;v7 加语义分组 `@group` / 卡片显式引用 `@href` / 安全公式 `@compute`)。

```
# 卡片:默认更新既有卡;可改几何/颜色/title/content
[card #<id>] @pos(<x>,<y>) @size(<w>,<h>) @color(red|yellow|blue|black|white|gray) @title("<标题>") @content("<Markdown 正文>")

# 纯内容/属性编辑可省 @pos:沿用现有几何
[card #<id>] @title("新标题") @content("新正文")
[card #<id>] @color(red)

# 明确 create:先持久化新卡再写入画布(不能与已有 id 冲突;内容可选)
[card #<new-id> create] @pos(<x>,<y>) @size(<w>,<h>) @color(<c>) @title("标题") @content("正文")

# 空串显式清空;省略 token = 保持内容不变
[card #<id>] @title("") @content("")

# v7 语义分组:给卡打组名(无 @pos 可给现有卡分组);组的样式/折叠是视图层,不进 DSL
[card #<id>] @group("Q3 规划")

# v7 卡片显式引用(KG 边,不画线;区别于正文 [[wikilink]]→自动箭头);;分隔,≤20 个
[card #<id>] @href(#<目标1>;#<目标2>)

# 矩形等自由形状(v7 可加 @group)
[rect #<id>] @pos(<x>,<y>) @size(<w>,<h>) @color(<c>)

# 文本(v7 可加 @group / @compute)
[text #<id>] @pos(<x>,<y>) @text("<内容>") @color(<c>)

# v7 安全公式(仅 text):只引用元素几何 #id.x|y|w|h,算出显示值(禁裸 eval,不碰卡片内容)
[text #<id>] @pos(<x>,<y>) @compute("#a.w + #b.w")

# 主题分区(v7 可加 @group)
[frame #<id>] @pos(<x>,<y>) @size(<w>,<h>) @text("<标题>") @color(<c>)

# 关系箭头(三维语义签名:线型 + 箭头头 + 颜色)
[arrow #<id>] from #<a> to #<b> @label("<标签>") @color(<c>) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)
```

**freedraw 不在 DSL**:手绘由程序的 R2 存储 + canvas-engine 渲染负责;`serializeCanvas` 不输出 freedraw,`[freedraw #id]` 输入会报 `unrecognized directive`。AI 的单向画布快照仍可看到本地计算的 shape 描述符,但不是 DSL 往返的一部分。

**内容转义**:`@title/@content/@text/@label` 使用引号字符串;`\"` 表示引号、`\\` 表示反斜杠、`\n` 表示正文换行。`@title` 最长 200 字符,`@content` 最长 8000 字符。

**颜色**:固定 Bauhaus 6 原色 + grey(`red`/`yellow`/`blue`/`black`/`white`/`gray`/`grey`)。越界色(如 green)不匹配 → 回退默认色(而非静默变黑)。

**注释**:`#` 开头的行在 graceful/strict 两种 parser 中都被跳过;非注释散文在 strict AI 模式中会报错。

**容错**:不认识的行 / 坏指令 → 记一条诊断(行号 + 原因),跳过它,继续处理其余。AI 写 10 行 7 对 3 错 → 应用 7 条 + 告诉你哪 3 行错了。**不静默丢、不崩溃。**

---

## 四、双向闭环(价值演示)

**场景**:一张乱画布,4 张散落的灵感卡(早睡 / 跑步 / 读书 / 冥想),没框没箭头。

**① 画布 → 文字**(DSL 模态编辑器的人读全量视图;AI 使用程序按任务构造的独立快照/上下文):

```
[card #c1] @pos(50,50) @size(120,80) @title("早睡") @content("尽量在 23:00 前睡")
[card #c2] @pos(820,30) @size(120,80) @title("跑步")
[card #c3] @pos(180,640) @size(120,80) @title("读书")
[card #c4] @pos(900,720) @size(120,80) @title("冥想")
```

**② AI 输出重排**(AI 写一段文字,按主题分框、归位上色、连关系):

```
[frame #fr-health] @pos(40,40) @size(360,520) @text("健康") @color(blue)
[frame #fr-mind] @pos(440,40) @size(360,520) @text("心智") @color(red)
[card #c1] @pos(80,80) @color(blue)
[card #c2] @pos(80,320) @color(blue)
[card #c3] @pos(480,80) @color(red)
[card #c4] @pos(480,320) @color(red)
[arrow #a1] from #c1 to #c2 @label("相辅") @color(blue)
```

**③ 文字 → 画布**:解析 → 只读预演 → 变更预览 → 你确认后应用。AI/Agent 的应用会显示 before/after 缩略图与变更摘要,用户确认后才写入;一次确认对应一次可撤销 mutation。手动 DSL 模态也必须点「应用」才写入。

> 这套闭环是**可复跑、有测试证明**的,不是宣传话。见
> `apps/web/src/features/ai/__tests__/transliteration-walkthrough.test.ts`(上面这个场景的端到端断言)。
> 脏输入的优雅降级见 `dsl-robustness.test.ts`(28 对抗输入 + 500 随机 fuzz);
> 已覆盖字段的干净往返见 `dsl-e2e-roundtrip.test.ts`(逐字节比对);这不是对卡片正文、媒体或 freedraw 点序列的承诺。

---

## 五、怎么用(三种方式)

1. **画布工具栏 →「DSL」按钮**(模态编辑器,所有用户可用,**不门控 AI**):
   - 打开即显示当前画布的文字形态(`serializeCanvasReadable`,card 带真实 `@title/@content` token)
   - 先在画布按顺序选中两张卡(第一张是参照,第二张会移动),打开后直接点「放到右侧」或「放到下方」；编辑器会改写目标卡那一行并立即显示真实 diff
   - 直接编辑 textarea / 粘贴一段 DSL →「应用」→ 画布变
   - 诊断列表在输入时就告诉你哪行错了(行号 + 原因);ApplyReport 反馈 applied / skipped / failed 的逐条结果与汇总
   - 如果编辑期间画布变化,旧文本不会覆盖新状态；可在模态内「载入最新画布」重新开始
   - 还能「复制」(到剪贴板)/「下载」(.txt,拿走发任何地方)

2. **AI 排版按钮**(画布侧栏):把允许的画布上下文喂给你配的 AI(OpenAI / Anthropic / 本地兼容),AI 回一段 DSL,然后打开确认门。你先看预览,确认后才应用;拒绝不会改画布。

3. **复制 DSL 跨实例**:在 A 设备复制画布 DSL 文本 → 贴进 B 设备的 DSL 模态 → 应用。文本即交换格式,不需要 `.cystift` 文件(虽然也有)。

---

## 六、边界与隐私(诚实说明)

- **卡片默认更新既有 id**:普通 `[card #id]` 可改几何/颜色和 `@title/@content`;纯内容/属性编辑可省 `@pos` 并保持原几何。`@title("")`/`@content("")` 显式清空,省略 token 则保持不变。显式 `[card #id create]` 可创建带内容的新卡;先持久化成功再写入 host,ID 冲突/配额失败会报告且不留 ghost card。
- **关系箭头端点必须存在**:`from`/`to` 指向不存在的卡 → 那条 op 跳过(不崩,诊断会报)。
- **freedraw 已出 DSL**:手绘由程序(R2 + canvas-engine)存储/渲染;DSL 不输出位置或点序列,也不创建/修改手绘。AI 单向 snapshot 可附本地计算的 shape 标签/标量特征,但永不带笔迹点。
- **颜色固定 6+1**:越界色回退默认,不静默变黑。
- **vision 当前未接入**:默认只保留 `kind`(image/pdf)元数据,二进制永不外发。Settings 的 Labs 区会明确显示没有可开启的 Vision consumer;详见 [`privacy.md`](privacy.md)。

### DSL coverage（当前 v7）

| 字段 | DSL 状态 |
|---|---|
| card/rect/frame/text 的 id、位置、尺寸、颜色 | 可序列化、可解析、可回写 |
| card `@title` / `@content` | 可序列化、可解析、可回写;空串清空;无 `@pos` 可纯内容编辑 |
| relation/free arrow 的端点、标签、颜色、线型、箭头头、curve/elbow route、wikilink 标记 | 可序列化、可解析、可回写 |
| `create` 卡 | 显式 `create`;可带 title/content;持久化失败标 failed,不留 ghost |
| v7 `@group`(语义分组) | card/rect/text/frame 均可;落 `element.meta.group`;空串清空;组的样式/折叠是视图层 |
| v7 `@href(#a;#b)`(卡片显式引用) | 落 `element.meta.href`(裸 id 列表);去重 ≤20;不画线,区别于正文 wikilink→箭头 |
| v7 `@compute("公式")`(安全公式) | 仅 text;只引用几何 `#id.x\|y\|w\|h`,apply 时求值写 text;禁裸 eval、不碰卡片内容;每次 apply 重算(非 live) |
| 正文内 links/wikilink、code、quotes、media 二进制 | 不属于 DSL;仍由程序/CardService/导出数据管理(卡片间的**显式**引用可走 `@href`) |
| freedraw | **不属于 DSL**;位置/点序列均不进文本,由程序 R2 + 渲染管理 |

---

## 七、给 AI 的提示(如果你要让 AI 驱动画布)

告诉 AI:

> 这是一张 cys-dsl v7 画布描述。每行一个元素;使用 grammar 给出的 `[kind #id]` 与 `@directive(...)` 形式。
> 卡片默认更新既有 id;可按任务改几何/颜色/`@title`/`@content`;纯内容编辑可省 `@pos`,确实新建时才使用 `[card #new-id create] @pos(...)`,且 ID 必须不存在。语义分组用 `@group("名")`,卡片间显式引用用 `@href(#a;#b)`,文本公式用 `@compute("#id.w + …")`(只读几何)。freedraw 不属于 DSL。
> 输出一段 DSL 重排或编辑这张画布。应用前会预演、校验并显示确认门;坏行会被诊断并跳过,不会静默成功。

DSL 模态编辑器里还内嵌了一份语法速查(可折叠 details),双语。

---

## 相关

- **想深入理解引擎内部(为什么这么设计 + 代码怎么跑):[`../architecture/dsl-engine.md`](../architecture/dsl-engine.md)(学习指南)** — 本手册讲「写什么」,学习指南讲「为什么 + 怎么跑」
- 隐私(字段级):[`privacy.md`](privacy.md)
- 设计与定位:[`../product-brief.md`](../product-brief.md)(转义 = 核心承诺)
- 当前状态:[`../STATE.md`](../STATE.md)
- 引擎(转义的技术承载):`packages/canvas-engine`(零业务依赖,可独立复用)
