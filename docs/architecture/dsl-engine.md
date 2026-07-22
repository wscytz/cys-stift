# 转义引擎学习指南 — cys-dsl:从文字到画布再回来

> 这是 cy's Stift 核心(转义 / DSL)的**学习文档**——讲「为什么这么设计」和「引擎内部怎么跑」。
> 它**不是**语法手册:写什么语法、有哪些 directive,看 [`../user/transliteration.md`](../user/transliteration.md)。
> 它**不是**架构地图:仓库怎么分包、数据怎么流,看 [`overview.md`](overview.md)。
>
> 读完这份,你能:说清一张画布怎么变成一段文字、又怎么变回来;看懂 `packages/cys-dsl` 每个文件的职责;
> 判断一个新想法「该不该进 DSL」。

---

## 0. 这份文档写给谁

- **想真正理解 cy's Stift 的人**——不满足于"会用",想知道底下到底怎么回事
- **新加入的贡献者**——先建立心智模型,再读代码会快得多
- **想给画布加新能力、又拿不准放哪一层的人**——文末有判定清单(§5)

读法:从头到尾递进;每节末「在代码里」指路;最后一节给你动手入口。已经懂某一节就跳过,各节相对独立。

---

## 1. 心智模型:画布即文字

大多数画布工具(tldraw / Miro / Excalidraw)的画布是**图形**——只有看得见、只有用鼠标改得了。它的"结构"藏在二进制对象里,只有它自家软件能读能写。

cy's Stift 的画布有一个不一样的性质(**「转义」**):

> 画布上每一个**结构性元素**(卡片 / 矩形 / 文本 / 框 / 关系箭头),都能用**一行确定的文字**完整描述;
> 反过来,这段文字也能驱动画布变化。

同一张画布,既是屏幕上的几何,**也是**这样一段文字:

```
[frame #fr-health] @pos(40,40) @size(360,520) @text("健康") @color(blue)
[card #c1] @pos(80,80) @size(120,80) @color(blue)
[card #c2] @pos(80,320) @size(120,80) @color(blue)
[arrow #a1] from #c1 to #c2 @label("相辅") @color(blue)
```

**这件事的产品含义是机制性的,不是营销话**:文字是最通用的交换格式——

- 任何 AI、任何脚本、任何人不需适配专有 API、不需联网某服务器,读写这段文字就能提出画布编辑
- 文字天然可 diff,改了什么一目了然
- 文字天然可复制粘贴,跨设备/跨实例迁移就是一段文本

本指南要讲的就是:**这段文字与画布之间,引擎是怎么把它来回转的,以及为什么这样转。**

> 在代码里:这段文字的"形状"由 [`packages/cys-dsl/src/dsl-grammar.ts`](../../packages/cys-dsl/src/dsl-grammar.ts) 的 `DSL_GRAMMAR_REFERENCE` 单一声明。

---

## 2. 方向一:画布 → 文字(serialize)

序列化把一张画布压成一段可读文本。入口在 [`packages/cys-dsl/src/canvas-dsl.ts`](../../packages/cys-dsl/src/canvas-dsl.ts):

- `serializeCanvas(...)` — 整张画布 → 文本(AI / 交换用)
- `serializeCanvasReadable(...)` — 同上,但卡片的 `@title`/`@content` 带真实内容(DSL 模态编辑器的人读视图)
- `serializeElement(...)` — 单个元素 → 一行

**一个元素 = 一行**。拿一张卡片走一遍:它的 `#id`、`@pos(x,y)`、`@size(w,h)`、`@color(...)`、`@title("...")`、`@content("...")` 拼成一行。v7 的 `@group` / `@href` / `@compute` 是挂在元素 `meta` 上的,序列化时由 `metaGroup` / `metaHref` / `metaCompute` 几个小助手补到行尾。

**这里有个关键设计,新手最容易踩坑**:卡片的**正文(title / body)并不在画布元素上**。画布上的 card 元素只存**几何 + 一个 `cardId` 引用**;正文活在域层的 `Card` 对象里(由 `CardService` 管)。序列化卡片那行时,`@title`/`@content` 是**通过一个 resolver 现查现拼**出来的,不是元素自带的字段。

这就是架构总览里的「**Card 为唯一真相源**」原则:你在 inbox 改了卡片正文,画布上立刻反映,不需要 reload——因为画布渲染和序列化都去查同一个 `CardService`。

**什么不会被序列化**(先记住,§5 解释为什么):

- 手绘(freedraw)的笔迹点序列
- 媒体二进制(图片/PDF 的 dataUrl)
- 视图状态(zoom / pan / 网格模式)

> 在代码里:`canvas-dsl.ts` 的 `serializeElement`,以及它调用的 `metaGroup` / `metaHref` / `metaCompute` 助手。

---

## 3. 方向二:文字 → 画布(parse + apply)

这是更有意思的一向:一段文本怎么变回画布上的几何。分两步:**解析(parse)**产出"意图清单",**应用(apply)**把它落成画布变更。

### 3a. 解析:文本 → DslOp[]

入口在 [`packages/cys-dsl/src/dsl-parser.ts`](../../packages/cys-dsl/src/dsl-parser.ts),三个函数,严格度不同:

- `parseDsl(text)` — 最宽松,只返回 ops(AI 路径用)
- `parseDslWithDiagnostics(text)` — 同样宽松,但同时返回诊断(给 DSL 模态编辑器显示"第几行错了")
- `parseDslStrictWithDiagnostics(text)` — **严格模式**,给 AI 输出把关(见 §8)

拿 `parseDslWithDiagnostics` 走一遍,一行文本的命运:

1. **逐行** `parseLine(line)`(Peggy 文法)→ 得到一个 `LineResult`
2. `LineResult` 把这行分类:`null`(空行/注释/散文,静默跳过)、`unknown`(`[freedraw]` 这类已出 DSL 的,跳过)、或 `card`/`arrow`/`rect`/`text`/`frame` 之一(带一组原始 `DirectiveTuple`)
3. `buildOp(result)` 把那组元组**折叠**成一个 `DslOp`(同一个 directive 出现多次时 first-wins)
4. 产出要么塞进 `ops`,要么记一条 `DslDiagnostic`(带**原始 1-based 行号** + 原因)

`DslOp = DslCardOp | DslFreeOp | DslArrowOp`——一份**意图清单**:我想把 #c1 移到这里、给 #a1 改个标签、新建一张卡……**还没动真格**,只是计划。

**永不抛错**是这个方向的契约:文法尾部有 `.*` 兜底,任何 `[` 开头的行结构上都能 succeed;真有极端输入(控制字符)让文法抛了,那行也被 `try/catch` 静默跳过,整块不崩。

### 3b. 应用:DslOp[] → 画布 mutation

应用这步**不在 `cys-dsl` 包里**——它在 `apps/web`,因为要真正改动画布宿主 + 持久化卡片。入口 [`apps/web/src/features/canvas/apply-layout.ts`](../../apps/web/src/features/canvas/apply-layout.ts):

1. `buildApplyPlan(host, ops)` → `ApplyPlan`:一份**只读预演**。每个 op 算出一个 `ApplyPlanItem`,带状态 `applied` / `skipped` / `failed`。内部由 `planCard` / `planFree` / `planArrow` 三个规划器分派。
2. **确认门**:把 `ApplyPlan` 渲染成 before/after 缩略图 + 变更摘要给用户看。用户点确认才继续。
3. `commitApplyPlan(host, plan, ...)` → 真正写入宿主元素。期间:
   - 遇到 `create` 卡 → 调 `onCardCreate` **先把新卡持久化**(失败就标 failed,不留 ghost 卡)
   - 遇到带 `@title`/`@content` 的更新 → 调 `onCardUpdate` **把正文写回 `CardService`**

**确认门是承重的**:一次确认 = 一次可撤销的 mutation。AI/手动都一样——先预演、再确认、再写入。

> 在代码里:`dsl-parser.ts` 的三个 parse 入口 + `buildOp`;`apply-layout.ts` 的 `buildApplyPlan` / `commitApplyPlan` + `onCardCreate` / `onCardUpdate` 回写。

---

## 4. 引擎的五个房间(读码地图)

`packages/cys-dsl/src` 一共五个源文件,职责清晰、单向依赖。按数据流顺序读:

| 文件 | 职责 | 你会动它当…… |
|---|---|---|
| `dsl-grammar.ts` | **单一源**:版本号、5 个 kind、6+1 色、各字段上限、`DSL_GRAMMAR_REFERENCE`(给 AI 的语法说明) | 改语法/加 directive 的**起点** |
| `dsl.peggy` | Peggy 结构化分词器文法。`pnpm --filter @cys-stift/dsl gen` 重新生成 `dsl-parser.gen.js` | 加新 directive 的**词法层** |
| `dsl-parser.ts` | TS 包装:`DirectiveTuple` → `LineResult` → `buildOp` → `DslOp`;三档严格度;`DslDiagnostic` | 改解析语义/诊断 |
| `dsl-sanitize.ts` | 可选的解析后修正(坐标夹到 ≤10000,size/gap ≤2000) | 防 LLM 产非法值崩掉 |
| `canvas-dsl.ts` | **序列化器**(方向一) | 改"画布怎么变文字" |

外加 `dsl-compute.ts`(v7 `@compute` 的安全求值器,§7 专讲)。

**单一源治理**是这里最值得学的设计:`DSL_GRAMMAR_REFERENCE` 一改,AI 的 system prompt、DSL 模态里的语法速查、画布 prompt、样本版本戳**全部自动联动**。所以加一个 directive,只需要:① grammar 声明 → ② peggy 加词法规则 → ③ parser 加元组 + 折叠 + build 分支 → ④ 序列化器加 emit → ⑤ 写测试。版本号 `DSL_VERSION` 跟着 bump,版本锁测试会提醒你对齐。

> 在代码里:`dsl-grammar.ts` 顶部的 `DSL_VERSION = 7`、`DSL_KINDS`、`DSL_COLORS`、`DSL_MAX_*` 常量。

---

## 5. 铁律:DSL = 状态,不是行为

这是整份文档**最重要的一节**。理解了它,你就理解了为什么有些东西"看起来该进 DSL"却坚决不进。

**DSL 只存状态,不存行为。** 状态 = 几何、颜色、文字、组名、引用、公式;行为 = 依赖运行时上下文才确定的结果(视口、字号、字体度量、实时订阅)。

**所以这些东西不进 DSL,并且有清楚的理由:**

| 不进 DSL 的东西 | 理由 |
|---|---|
| 手绘(freedraw)笔迹点 | 隐私(笔迹)+ 非确定;由程序(R2 + 引擎)自管,DSL 既不输出也不创建 |
| 媒体二进制 / 正文里的 links/code/quotes | 体积 + 隐私;由 `CardService` 管,`@content` 只带正文文本 |
| 组的**样式 / 折叠** | 依赖视口/交互态,非确定、不对称。DSL 只存 `@group("名")`,组长什么样是渲染层的事 |
| 标签的**避障位置**(halo) | 依赖字号/字体度量,渲染时才算得出;DSL 只存 `@label("文字")`,放哪由渲染决定 |
| `@compute` 的**实时重算** | 实时订阅 = 行为。DSL 只存**公式**(状态),apply 时求一次值写进 text |

**成熟工具(Mapbox / ELK / Excalidraw)都把标签避障放在渲染层算**——这不是偷懒,是正确的分层:确定的东西进文本(可往返),非确定的东西留在运行时。

**判定清单:一个新想法该不该进 DSL?** 四条全中 → 进:

1. 它是**确定的状态**吗?(给定输入,值唯一)
2. 它**双向对称**吗?(写进去还能原样读出来)
3. 它**不依赖视口/字号/运行时上下文**吗?
4. 它**不涉及隐私**(笔迹/二进制/设备标识)吗?

例:`@group("Q3 规划")` 四条全中 → 进。组的折叠状态:依赖交互态(✗2 ✗3)→ 不进,留视图层。

> 在代码里:`@group` / `@href` / `@compute` 都落在 `CanvasElement.meta`(一个松散 record),**不改元素类型签名**——这也是"纯状态"的体现。

---

## 6. 双向对称意味着什么

理论上 serialize 和 parse+apply 应该互为逆操作:一个元素序列化成一行,那行再解析应用回来,应该得到同一个元素。对**已覆盖字段**,这是被测试逐字节保证的。

但对称性有个精巧之处——**「省略 @pos = 保持原几何」**:

```
[card #c1] @title("新标题") @content("新正文")
```

这行**没有 `@pos`**。parser 见到"只有内容/meta 类 directive、没有 `@pos`"时,把它判为「**保持现有几何**,只改内容/属性」。于是你可以**只编辑卡片正文而不碰它的位置**——既符合直觉(我没说移动它),又维护了对称性(这个 op 携带的是"keep",不是"move 到某处")。

**什么不对称(诚实说明):** 卡片正文、媒体、手绘**故意不**经 DSL 文本往返——这是隐私和体积的取舍,不是 bug。`dsl-e2e-roundtrip` 测试断言的是**已覆盖字段**的逐字节稳定,不是对所有数据的承诺。哪些字段算"已覆盖",见 [`../user/transliteration.md`](../user/transliteration.md) 的 coverage 表。

> 在代码里:`dsl-parser.ts` 的 `buildOp` 里 keepExistingPos 的触发条件(`d.title/content/group/href/...` 任一存在且无 `@pos`)。

---

## 7. v7 的三个新东西(小案例研究)

v7 加了三条 directive,每条都是"状态 vs 行为"判定的好教材。

### @group("名") — 语义分组

给元素打组名,落在 `element.meta.group`。card/rect/text/frame 都能加;**空串清空**;不带 `@pos` 就能给**已存在的卡**分组。组的**样式和折叠不进 DSL**(§5),是视图层后续工作。

### @href(#a;#b) — 卡片显式引用

卡片之间声明一条"我引用它"的边,落在 `element.meta.href`(裸 id 列表,去重,≤20 个)。**它不画线**——区别于正文里的 `[[wikilink]]`(那会自动建一根箭头)。`@href` 是"知识图谱的边"在 DSL 里的显式形态,留给视图层去消费(反链面板、跳转)。

### @compute("公式") — 安全公式(仅 text)

这条最值得讲,因为它涉及**安全**。文本元素可以挂一个公式:

```
[text #t1] @pos(200,40) @compute("#a.w + #b.w")
```

apply 时求值,把结果写进 text 显示。安全设计在 [`packages/cys-dsl/src/dsl-compute.ts`](../../packages/cys-dsl/src/dsl-compute.ts) 的 `evalCompute`:

- **手写 tokenizer + 递归下降求值器,绝不 `eval` / `new Function`**——公式再怪也跑不出求值器范围
- **只支持几何引用** `#id.x|y|w|h` + 算术 + `min/max/abs/round` + 括号
- **故意不碰卡片内容**——所以公式求值**不可能泄漏正文隐私**(这是隐私面的关键)
- 除零 → 0,非有限 → 0,递归深度有上限
- **公式存 `meta.compute`(往返对称),apply 时求一次值写 text**——不是实时订阅(§5:那算行为,留作视图层增强)

> 在代码里:`dsl-compute.ts` 的 `evalCompute` / `formatComputeNumber` / `ComputeResolver`;apply 端在 `apply-layout.ts` 构造 resolver 并调用。

---

## 8. AI 在闭环里的位置

转义的核心使用场景就是 AI 协作。闭环:

```
画布 ─serialize─▶ 文本(或任务快照) ─▶ AI ─▶ DSL 文本
                                              │ parse(严格)
                                              ▼
                                         DslOp[]
                                              │ buildApplyPlan
                                              ▼
                                       ApplyPlan(预演)
                                              │ ▼ 确认门 ▼
                                              ▼
                                     commitApplyPlan ─▶ 画布变更
```

**严格模式(strict)是给 AI 输出兜的底**:用户粘贴的旧文本走宽松(graceful,坏行跳过继续);**AI 的输出走严格**——散文行、重复 directive、未知残余都报错而不是被静默吞掉。这样 AI 没法"看起来成功了其实产了垃圾"。

**隐私 allowlist 是另一道底**:AI 看到的不是整张画布的原始数据,而是 `serializeCardForAI` + `AI_CARD_FIELDS` allowlist 出来的**显式注册字段**。`source.deviceId` / `apiKey` / 媒体 `dataUrl` / **软删除的卡**永远进不了 prompt。`@compute` 只读几何不读正文,所以公式求值也不会泄漏内容。字段级细节看 [`../user/privacy.md`](../user/privacy.md)。

> 在代码里:`dsl-parser.ts` 的 `parseDslStrictWithDiagnostics`;allowlist 在 web 侧 `serializeCardForAI` + `AI_CARD_FIELDS`。

---

## 9. 容错哲学:不静默丢,不崩溃

转义是**反信任问题**——AI/人写的文本可能乱七八糟,引擎的承诺是:**坏行记一条诊断(带行号 + 原因)跳过,其余继续;绝不静默丢、绝不崩整块。**

AI 写 10 行、7 对 3 错 → 应用 7 条 + 告诉你哪 3 行错了、为什么。用户始终知道**实际发生了什么**——`DslDiagnostic` 里的 **1-based 原始行号**就是这个"知情权"的锚。

这套承诺不是宣传,是被测试钉死的:

- `transliteration-walkthrough.test.ts` — §4 闭环演示的端到端断言(那张 4 卡重排场景)
- `dsl-robustness.test.ts` — 28 个对抗输入 + 随机 fuzz,验证脏输入优雅降级
- `dsl-e2e-roundtrip.test.ts` — 已覆盖字段的逐字节往返稳定
- `dsl-compute.test.ts` — 求值器的边界(除零、非有限、深度、几何引用)

> 在代码里:`dsl-parser.ts` 的 `DslDiagnostic`(line/text/message);上面四个测试文件在各自包的 `__tests__/`。

---

## 10. 动手:把它跑起来看

光读不跑,理解会漏。建议按这个顺序:

1. **读测试,按场景**:打开 `apps/web/src/features/ai/__tests__/transliteration-walkthrough.test.ts`,看那张 4 卡画布怎么从文字重排、断言怎么写。这是最快建立直觉的入口。
2. **开 DSL 模态**:画布工具栏 →「DSL」按钮 → 看 `serializeCanvasReadable` 的真实输出 → 改一行 → 看诊断实时冒出来 → 点「应用」看画布变。
3. **改一次语法**:在 `dsl-grammar.ts` 的 `DSL_GRAMMAR_REFERENCE` 里加一句说明,跑 `pnpm --filter @cys-stift/dsl gen`,然后看 AI prompt 和模态速查里它出现了——感受单一源治理。
4. **跑引擎测试**:`pnpm --filter @cys-stift/dsl test`,全绿就是契约成立。

---

## 11. 延伸阅读

- [`../user/transliteration.md`](../user/transliteration.md) — 语法手册(写什么 directive、coverage 表)
- [`../user/privacy.md`](../user/privacy.md) — 字段级隐私说明
- [`overview.md`](overview.md) — 架构地图(仓库分包、数据流、核心原则)
- [`../product-brief.md`](../product-brief.md) — 产品定位(转义 = 核心承诺)
- 引擎周边包:`packages/canvas-engine`(把 DSL 描述的元素**渲染**出来)、`packages/domain`(`Card` 真相源)

---

*本文是教学文档,讲机制与设计;不跟踪进度——当前版本/能力见 [`../STATE.md`](../STATE.md)。*
