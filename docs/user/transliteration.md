# 转义(Transliteration)手册

> **cy's Stift 的核心卖点。** 画布上的一切,能用一段确定的文字描述;这段文字,能反向改画布。
> 所以**任何 AI(或任何人)都能靠读写一段文字来驱动画布编辑**——不必碰几何 API、不必连某个 SDK、不必发手绘点序列。
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

这两向**对称、确定、对全部元素类型无损**(手绘除外,见 §五隐私)。这就是"转义"。

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

每行一个元素。`#id` 是元素标识(往返用),`@pos/@size/@color` 是几何与样式。

```
# 卡片(内容来自卡片库,DSL 只改几何/颜色——见 §五"update-only")
[card #<id>] @pos(<x>,<y>) @size(<w>,<h>) @color(red|yellow|blue|black|white|gray)

# 矩形 / 椭圆占位等自由形状
[rect #<id>] @pos(<x>,<y>) @size(<w>,<h>) @color(<c>)

# 文本
[text #<id>] @pos(<x>,<y>) @text("<内容>") @color(<c>)

# 主题分区(框住一组卡,2026-06-26 新增)
[frame #<id>] @pos(<x>,<y>) @size(<w>,<h>) @text("<标题>") @color(<c>)

# 关系箭头(三维语义签名:线型 + 箭头头 + 颜色)
[arrow #<id>] from #<a> to #b @label("<标签>") @color(<c>) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)

# 手绘(只发位置元数据,不发点序列——见 §五隐私)
[freedraw #<id>] @pos(<x>,<y>)
```

**颜色**:固定 Bauhaus 6 原色 + grey(`red`/`yellow`/`blue`/`black`/`white`/`gray`/`grey`)。越界色(如 green)不匹配 → 回退默认色(而非静默变黑)。

**注释**:`#` 开头的行被跳过(`serializeCanvasReadable` 给每张卡附 `# title: …` 注释,方便人读,不影响解析)。

**容错**:不认识的行 / 坏指令 → 记一条诊断(行号 + 原因),跳过它,继续处理其余。AI 写 10 行 7 对 3 错 → 应用 7 条 + 告诉你哪 3 行错了。**不静默丢、不崩溃。**

---

## 四、双向闭环(价值演示)

**场景**:一张乱画布,4 张散落的灵感卡(早睡 / 跑步 / 读书 / 冥想),没框没箭头。

**① 画布 → 文字**(AI 看到的,也是你在 DSL 模态编辑器里看到的):

```
[card #c1] @pos(50,50) @size(120,80)
  # title: 早睡
[card #c2] @pos(820,30) @size(120,80)
  # title: 跑步
[card #c3] @pos(180,640) @size(120,80)
  # title: 读书
[card #c4] @pos(900,720) @size(120,80)
  # title: 冥想
```

**② AI 输出重排**(AI 唯一要做的事——写一段文字,按主题分框、归位上色、连关系):

```
[frame #fr-health] @pos(40,40) @size(360,520) @text("健康") @color(blue)
[frame #fr-mind] @pos(440,40) @size(360,520) @text("心智") @color(red)
[card #c1] @pos(80,80) @color(blue)
[card #c2] @pos(80,320) @color(blue)
[card #c3] @pos(480,80) @color(red)
[card #c4] @pos(480,320) @color(red)
[arrow #a1] from #c1 to #c2 @label("相辅") @color(blue)
```

**③ 文字 → 画布**:解析 + 应用 → 画布瞬间结构化:两张主题分区框、卡片归位上色、一条关系箭头。

> 这套闭环是**可复跑、有测试证明**的,不是宣传话。见
> `apps/web/src/features/ai/__tests__/transliteration-walkthrough.test.ts`(上面这个场景的端到端断言)。
> 脏输入的优雅降级见 `dsl-robustness.test.ts`(28 对抗输入 + 500 随机 fuzz);
> 干净往返无损见 `dsl-e2e-roundtrip.test.ts`(逐字节比对)。

---

## 五、怎么用(三种方式)

1. **画布工具栏 →「DSL」按钮**(模态编辑器,所有用户可用,**不门控 AI**):
   - 打开即显示当前画布的文字形态(`serializeCanvasReadable`,带 title 注释)
   - 直接编辑 textarea / 粘贴一段 DSL →「应用」→ 画布变
   - 诊断列表告诉你哪行错了(行号 + 原因);反馈"应用 N 条,M 条跳过"
   - 还能「复制」(到剪贴板)/「下载」(.txt,拿走发任何地方)

2. **AI 排版按钮**(画布侧栏):把画布序列化喂给你配的 AI(OpenAI / Anthropic / 本地兼容),AI 回一段 DSL,静默应用。转义在背后跑,你看到的是"画布自动排好了"。

3. **复制 DSL 跨实例**:在 A 设备复制画布 DSL 文本 → 贴进 B 设备的 DSL 模态 → 应用。文本即交换格式,不需要 `.cystift` 文件(虽然也有)。

---

## 六、边界与隐私(诚实说明)

- **卡片 update-only**:DSL 不能 `[card #new]` 凭空建卡。卡片内容(title/body/媒体)来自卡片库(单一可信源),DSL 只改卡片的**几何和颜色**。要新建卡走捕获/inbox。这是有意设计——防 AI 建出内容空的孤儿卡。
- **关系箭头端点必须存在**:`from`/`to` 指向不存在的卡 → 那条 op 跳过(不崩,诊断会报)。
- **手绘(freedraw)单向**:DSL 只输出 `[freedraw #id] @pos(...)` 位置元数据 + 形状描述(如"像圆圈 85%"),**绝不输出点序列**。这是 **R2 隐私硬边界**:手绘是矢量,点数据留在本地引擎存储,永不进 AI prompt。所以 AI 看得到"这里有个像圆的手绘",改不了它,也不会拿走你的笔迹数据。
- **颜色固定 6+1**:越界色回退默认,不静默变黑。
- **不做 vision 模型**(永久):图像只发 `kind`(image/pdf)元数据,二进制永不外发。详见 [`privacy.md`](privacy.md)。

---

## 七、给 AI 的提示(如果你要让 AI 驱动画布)

告诉 AI:

> 这是一张画布的文字描述(DSL)。每行一个元素:`[kind #id] @pos(x,y) @size(w,h) @color(c)`。
> 卡片只能更新已存在的(改 pos/size/color),不能新建。关系箭头 `[arrow #id] from #a to #b @label("…")`。
> 输出一段 DSL 重排这张画布。坏行会被跳过,所以放心写,语法大致对就行。

DSL 模态编辑器里还内嵌了一份语法速查(可折叠 details),双语。

---

## 相关

- 隐私(字段级):[`privacy.md`](privacy.md)
- 设计与定位:[`../product-and-engine.md`](../product-and-engine.md)(转义 = 核心承诺)
- 当前状态:[`../STATE.md`](../STATE.md)
- 引擎(转义的技术承载):`packages/canvas-engine`(零业务依赖,可独立复用)
