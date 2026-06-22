---
date: 2026-06-22
status: research-note (非决策)
feeds: docs/plans/2026-06-22-canvas-strategy-tldraw-vs-self-build.md
audience: [claude, human]
---

# 画布与语言底座调研:drawio / arch-diagram-gen / AFFiNE(BlockSuite)/ Excalidraw

> 来源:用户下载的四个开源项目(Downloads/)。对应开发者反馈 6/22 第三点
> (「画布组件技术路线:tldraw 依赖评估与自研替代」)的两个子问题——
> **(A) 基于文本描述语言的画布设计**(plan §四)、**(B) 底层语言/渲染基座**(plan §五)。
> 本文是**学习笔记 + 可窃取的具体模式**,不是决策。任何行动仍需 ADR + spec 审查。

## 0. 一句话结论

四个项目是四种架构极点。**没有任何一个支持现在就抛弃 tldraw 自研渲染引擎**——
drawio 与 BlockSuite 的自研引擎都是团队级、多年投入;Excalidraw 的 Canvas+rough.js 引擎虽轻,
仍是 8 年迭代、自带一整套协作/几何/绑定子系统。但它们共同验证了 plan 的渐进路线,并给了
**两个最高杠杆的具体可窃取物**:[BlockSuite 的 `gfx/` 抽象层接口](#5-对-cys-stift-的可操作结论)
(plan §3.3 第一步「画布抽象层」的开源蓝本)+ [Excalidraw 的扁平元素模型与无-CRDT 协调]
(#4-excalidraw干净-json-元素模型--无-crdt-协调--自带-ai)(最贴近 cy's Stift 的 React/TS 栈、
且自带一等 AI 数据层的「描述语言」目标 schema)。

## 1. 四极光谱

| 维度 | arch-diagram-gen | drawio | AFFiNE / BlockSuite | Excalidraw |
|---|---|---|---|---|
| **描述语言** | 自然语言,无 schema | mxGraph XML(实例 `<mxCell>` + 形状 stencil 矢量 DSL) | CRDT block 模型(Yjs + TS class + 装饰器) | **扁平 JSON 元素模型**(`_ExcalidrawElementBase` + 判别 `type` 联合) |
| **渲染基座** | **无引擎**——LLM 直接吐 inline SVG | mxGraph 自研引擎(Canvas/SVG) | 自研:Canvas 2D + OffscreenCanvas Worker(turbo-renderer),交互时降级 DOM | rough.js + Canvas 2D(`rough.canvas()`),无 worker |
| **画布是否一等公民** | 否(静态 HTML) | 是(mxGraph graph) | 是,且**画布本身是一个 block**(`affine:surface`) | 是(`ExcalidrawElement[]` 扁平数组 + NonDeletedScene) |
| **元素扩展机制** | 无 | stencil XML + shapes/*.js | 类型化注册表(`SurfaceElementModelMap` + 每类型 painter 扩展) | 判别联合加 `type`;`customData` 逃生舱承载 AI/特性数据 |
| **协作 / undo** | n/a | 否(README 明确) | 是(Yjs CRDT,免费送) | 是,**无 CRDT**:`version`+`versionNonce`+fractional `index` 自研协调 |
| **AI 契合度** | 极高(它本身就是 AI 产物) | 中(XML 可解析,drawio 还内嵌 mermaid) | 中高(CRDT 模型结构化,可生成/打补丁) | **高,且 AI 是一等公民**(`data/ai/` + MagicFrame + `MagicGenerationData`) |
| **许可证** | MIT | Apache-2.0(+ 商标/图标限制) | MIT(BlockSuite)/ MPL(AFFiNE app) | MIT |

> cy's Stift 现状是**第五种、更轻的极**:JS/JSON 风格 DSL(`@pos` / `at (x,y)` / `size WxH`)
> → 编译成 tldraw records。见 `docs/decisions/2026-06-21-ai-context.md` + `ai-layout.md`。
> **四者中,Excalidraw 与 cy's Stift 栈最贴近**(React + TS + Canvas),也是 plan §5.2 钦点的首选替代基座。

## 2. arch-diagram-generator:无引擎极(反面教材 + AI 原生样本)

**它是什么**:一个 Claude Skill(`SKILL.md` + `resources/template.html`)。输入自然语言,
输出**自包含 HTML,内联 SVG**。无数据模型,无渲染引擎,无 JS(导出工具栏除外)。

**怎么做出来的**:`SKILL.md` 本质是**给 LLM 的设计系统说明书**——语义配色表
(frontend=cyan / backend=emerald / database=violet / cloud=amber / security=rose)、
JetBrains Mono、40px 网格背景、箭头 z-order 在形状之前绘制、半透明 fill 要垫不透明底矩形遮罩箭头。

**关键文件证据**:
- `architecture-diagram/SKILL.md` —— 通篇是「**CRITICAL**: 竖直堆叠最小间距 40px」「**Wrong**: bus 放 y=160 会和组件重叠」「**Right**: 放 y=140」之类**手算坐标的纠错指令」。
- `resources/template.html` —— CDN 引 html2canvas + jsPDF(SRI hash),PNG/PDF 导出。

**对 (A) 描述语言的启示**:
- 这是「**AI 直接吐视觉格式**」的极致。优点:零基础设施,AI 天然会生成。
- 致命缺点:**LLM 手算几何,极易重叠/错位**——整个 SKILL 都是给这个打补丁。
- ⇒ 强证据:**纯 prompt→visual 不可用于可编辑画布**。描述语言必须先编译进一个**有布局/几何引擎的元素模型**,再渲染(这正是 cy's Stift 现在做的事)。
- 可窃取:**语义类型配色**作为 DSL 的一等概念(plan §4.3「语义化」的现成实现)。

## 3. drawio:重引擎极 + 文本 DSL 桥接(最直接验证 plan §3.3 第二步)

**描述语言 = mxGraph XML,两层**:
1. **实例层** `<mxGraphModel>` → 扁平 `<mxCell>` 列表。每个 cell `vertex="1"` 或 `edge="1"`;
   边用 `source="..." target="..."` 按 id 连接;几何是子元素 `<mxGeometry>`。
   **关键:`style` 是分号分隔的迷你 DSL 字符串**:
   `style="ellipse;whiteSpace=wrap;html=1;fillColor=#1699D3;strokeColor=none;"`
   —— 在 XML 冗长与 JSON 之间的实用折中。
2. **形状层** stencil XML = 声明式矢量绘图语言(`<shape>` → `<background>`/`<foreground>`
   → `<path><move/><line/></path>` + `<fillstroke/>`),连接点用归一化坐标
   (`<constraint x="0.5" y="0"/>`)。

**渲染基座 = mxGraph**(`src/main/webapp/js/grapheditor/`:`Graph.js`/`Shapes.js`/`EditorUi.js` 等)——
15+ 年自研引擎。README 明确「不支持实时协作」「二次开发难」。

**最相关:drawio 内嵌 mermaid**(`src/main/webapp/js/mermaid/drawio-mermaid.min.js`)。
mermaid 是紧凑文本 DSL(`graph TD; A-->B`),drawio 把它**编译成 mxGraph 原生 cell**。
**这正是 plan §3.3 第二步「基于文本描述语言……作为 tldraw 插件运行」的开源先例**:
文本 DSL 进 → 引擎原生形状出。cy's Stift 的 `applyLayout` DSL 已经是这个模式,继续。

**对 (A) 描述语言的启示**:
- mxGraph 的 `style-as-string`(分号 key=value)是让文本/AI 低摩擦描述外观的成熟做法,
  可考虑用于我们 DSL 的样式子集(比嵌套 JSON 轻)。
- 「文本 DSL 编译进引擎原生模型」是验证过的中庸之路。

## 4. AFFiNE / BlockSuite:自研极 + 画布即 block(最贴近 cy's Stift)

> 用户下的是 `AFFiNE-0.26.3.zip`,实际是 **BlockSuite**(AFFiNE 的核心编辑/画布框架)源码。
> 它是「Write, Draw and Plan All at Once」——与 cy's Stift「灵感画布」架构最近的大厂参考。

### 4.1 渲染基座(对 plan §五「语言基座」最直接)

- **Canvas 2D + OffscreenCanvas 跑在 Web Worker 里**。
  证据:`blocksuite/affine/gfx/turbo-renderer/src/painter/painter.worker.ts`
  → `new OffscreenCanvas()` + `getContext('2d')`。**不是 WebGL,不是 SVG**。
- **Turbo Rendering 策略**:静态时把 block 内容绘成 canvas bitmap;**交互(缩放/平移)期间降级到 DOM 渲染**
  (`zoomThreshold` / `debounceTime`,见 `turbo-renderer.ts` 注释)。位图 + DOM 混合。
- 每种 block 注册 `LayoutHandlerExtension`(主线程)+ `PainterWorkerExtension`(worker)——**按元素类型的渲染插件注册表**。
- 用 rough.js 做手绘风(`roughness` 属性)。

⇒ **自研渲染引擎 = 团队级、多年投入**。BlockSuite 一个公司做了数年才到 0.26。
**结论再次倒向 plan §5.4:现阶段不换基座。**

### 4.2 描述语言(对 plan §四「文本描述语言」最直接)

- **画布是一个一等 block**:`affine:surface`(`blocks/surface/src/surface-model.ts`),
  `defineBlockSchema({ flavour:'affine:surface', props: { elements: Boxed(new Y.Map()) } })`。
  它的 children 可以是 `frame` / `image` / `edgeless-text` 等 block。**万物皆 block,画布也是。**
- **元素模型 = CRDT(Yjs)**:每个元素是 Yjs Map,字段用 `field`/`prop`/`local` 装饰器声明。
  证据:`model/src/elements/shape/shape.ts` →
  `class ShapeElementModel extends GfxPrimitiveElementModel<ShapeProps>`,
  `ShapeProps = BaseElementProps & { shapeType, radius, filled, fillColor, strokeWidth, strokeStyle, roughness, text?: Y.Text, ... }`。
- **类型化元素注册表**:`model/src/elements/index.ts` →
  `SurfaceElementModelMap = { brush, highlighter, connector, group, mindmap, shape, text }`。
- **几何按类型可插拔**:`shapeMethods[this.shapeType].containsBound(...)` / `getNearestPoint(...)`——
  每种形状自带命中测试/交点计算。
- **富文本活在元素内部**:`text?: Y.Text`(shape 里可直接放格式化文本)。

### 4.3 `gfx/` = 开源的「画布抽象层」(本次调研最大可窃取物)

`blocksuite/affine/gfx/` 把每种元素拆成独立包(brush/connector/group/mindmap/note/shape/text/
template/pointer + turbo-renderer),框架层提供 `@blocksuite/std/gfx` 的
`GfxPrimitiveElementModel` / `GfxController` / `GfxViewportElement` / viewport 服务。
**这就是 plan §3.3 第一步「画布抽象层」的成熟开源范本**——且 MIT 许可,可读可学。

## 5. Excalidraw:干净 JSON 元素模型 + 无-CRDT 协调 + 自带 AI(与 cy's Stift 栈最贴)

> 用户下的 `excalidraw-0.18.1.zip`。React + TS + Canvas,MIT,plan §5.2 钦点的首选替代基座。
> **四者中与 cy's Stift 技术栈最接近**,且 AI 是一等公民——本节是描述语言(A)问题的主参考。

### 5.1 描述语言 = 扁平 `Readonly` JSON 元素模型(`element/types.ts`)

- **`_ExcalidrawElementBase`**:所有元素共享的扁平字段(非嵌套),`Readonly`:
  `id, x, y, width, height, angle, strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle,
  roundness, roughness, opacity, seed, version, versionNonce, index, isDeleted, groupIds, frameId,
  boundElements, updated, link, locked, customData`。
- **判别联合**:`ExcalidrawRectangleElement = base & { type:"rectangle" }`,同理
  `diamond / ellipse / arrow / line / freedraw / text / image / frame / embeddable / iframe`。
  每种元素 = base + 一个 `type` 字面量(个别再加几型特有字段,如 text 的 `fontSize/fontFamily/text`)。
- **值得逐字抄的设计点**:
  - **`isDeleted: boolean`** —— 软删建在元素模型里。cy's Stift 的 trash 软删是同一模式,**已验证**。
  - **`customData?: Record<string, any>`** —— 给 AI/特性专用数据的**逃生舱**,不污染核心 schema。
    Excalidraw 的 `ExcalidrawIframeElement` 就用它挂 `MagicGenerationData`。
  - **`boundElements: BoundElement[]`** —— 双向绑定(容器 ↔ 文本标签 / 箭头端点),
    `BoundElement = { id, type:"arrow"|"text" }`。对应 cy's Stift 的关系箭头。
  - **`groupIds`**(深→浅有序)+ **`frameId`** —— 分组/画板两层组织。
- **这是「文本描述语言画布设计」(plan §四)最该对齐的目标 schema 形态**:扁平、判别联合、
  带版本/绑定/软删/扩展舱。我们的 DSL 应编译成**接近这个形状**的元素,而不是 tldraw 私有 record 的形状。

### 5.2 渲染基座 = rough.js + Canvas 2D(`renderer/renderElement.ts`)

- `import rough from "roughjs/bin/rough"`,`const rc = rough.canvas(canvas)`,`canvas.getContext("2d")`。
  手绘风来自 rough.js;**`seed` 让 rough.js 跨渲染确定性**(同一形状不抖动)。
- 非 WebGL、非 SVG(主画布)。与 BlockSuite 同属 Canvas 2D 家族,但**更简单**(无 worker、无 turbo-renderer)。
  二者都用 rough.js 做手绘(BlockSuite 的 `roughness`)。

### 5.3 协作 = 无 CRDT(对 plan「是否上 Yjs」的关键轻量替代)

- Excalidraw **不依赖 Yjs**。它用三个字段自研协调:
  - `version`(每次改动 +1)+ `versionNonce`(每次改动重生的随机数,版本撞车时裁决)
  - `index`([fractional-indexing](https://github.com/rocicirp/fractional-indexing) 字符串,多人排序)
- ⇒ 若 cy's Stift 未来要协作/同步又**不想引入 Yjs 重依赖**,Excalidraw 是已验证的轻量路径
  (代价:得自己实现 reconcile 逻辑,见 `data/reconcile.ts`)。

### 5.4 三层分离 = 「画布抽象层」的朴素实现

- `element/`——模型 + 几何(`mutateElement` / `typeChecks` / `collision` / `bounds` / `linearElementEditor` /
  `elbowArrow` / `flowchart`),**纯函数,不碰渲染**。
- `renderer/`——只画(`renderElement` / `renderScene`)。
- `components/`——React UI。
- ⇒ 这就是 plan §3.3 第一步「画布抽象层」**最朴素、可直接照抄的三分结构**(比 BlockSuite `gfx/` 更轻、更易理解)。
  两个都看:`gfx/` 学接口抽象,Excalidraw 学最简分层。

### 5.5 AI 是一等公民(直接对应 cy's Stift 的 AI 画布)

- `data/ai/` 目录 + `ExcalidrawMagicFrameElement` + `MagicGenerationData = { status:"pending" } | { status:"done"; html } | { status:"error" }`。
- AI 生成是**数据层关注点**(`data/`),不是 UI 层 bolt-on。**这正对应 cy's Stift 的 `applyLayout` DSL 应处的位置。**

## 6. 对 cy's Stift 的可操作结论

> 全部**建议**,非决策。换基座/改架构属「重新选型」,需 ADR + spec 五轮审查(根 CLAUDE.md 硬禁)。

### 6.1 验证现状方向(继续做)

- ✅ **DSL 编译进引擎原生模型,而非直接吐视觉**:我们 `applyLayout` DSL → tldraw shapes,
  正是 drawio+mermaid 的成熟模式。arch-diagram 的手算坐标灾难是反证。**保持。**
- ✅ **不现在自研/换渲染基座**:**四**项目无一支持现在动 tldraw。BlockSuite 自研耗时数年,
  Excalidraw 的 Canvas+rough.js 引擎也是 8 年迭代、自带整套协作/几何/绑定子系统。
- ✅ **渐进路线**:plan §3.3 四步(抽象层 → AI 模块 → MVP → 替代/混合)被 drawio(mermaid 桥接)、
  BlockSuite(gfx 抽象 + 逐元素自研)、Excalidraw(element/renderer/components 三层分离)三重佐证。

### 6.2 低成本可窃取(不需 ADR,纯借鉴设计)

1. **「画布抽象层」照抄两层蓝本**:`@blocksuite/std/gfx` 学接口抽象(元素基类/viewport 服务/注册表/扩展点),
   Excalidraw 的 `element/`+`renderer/`+`components/` 学最简三分结构。plan §3.3 第一步的具体蓝图。(只学形态,不引依赖。)
2. **DSL 目标 schema 对齐 Excalidraw `_ExcalidrawElementBase`**:扁平 + 判别 `type` 联合 +
   内建 `version`/`boundElements`/`isDeleted`/`customData`。这是我们「文本描述语言」该编译出的形状。
3. **`customData` 逃生舱**:AI/特性专用数据挂这里,不污染核心元素 schema(Excalidraw 的 MagicFrame 就这么干)。
4. **DSL 引入「语义类型」一等概念**:借鉴 arch-diagram 配色 + BlockSuite 的 `mindmap`/`connector`
   语义元素种类。`type:'process'` 而非 `type:'rectangle'`(plan §4.3)。
5. **样式用「分号 key=value」迷你 DSL**(mxGraph 风格)作为 JSON DSL 的轻量样式层。
6. **AI 放数据层**(`data/`),不是 UI bolt-on——对应 Excalidraw `data/ai/` + 我们 `applyLayout` 的归属。

### 6.3 需 ADR 才能动的大方向(仅记录,暂不做)

- **画布即一等数据**:BlockSuite 把画布做成 block、与 doc 同一棵树。cy's Stift 当前 cards/inbox/canvas/archive
  是分离视图;若未来要「画布上的卡片 = 同一份 card 模型」,这是方向性参考(大改,需 ADR)。
- **协作底座二选一**:**Yjs CRDT**(BlockSuite 路线,协作/undo/离线合并免费,但是重依赖 + 本地优先 → Yjs 大迁移)
  vs **Excalidraw 的 version+nonce+fractional-index 无-CRDT 协调**(轻,但要自写 reconcile)。
  仅在「协作/多端同步」成为真实需求时评估——Excalidraw 给了不上 Yjs 的可行退路。

### 6.4 给 plan 的具体补丁建议

在 `docs/plans/2026-06-22-canvas-strategy-tldraw-vs-self-build.md`:
- §3.3 第一步「画布抽象层」:从抽象描述升级为**「以 BlockSuite `gfx/`(接口)+ Excalidraw `element/renderer/components`(最简分层)为参考蓝本」**。
- §5.2 替代基座表:Excalidraw 一栏补「扁平 JSON 元素模型 + 无-CRDT 协调 + 一等 AI,与本项目 React/TS 栈最贴」,
  强化其作为 plan 钦点首选的依据。
- 附本文为依赖证据。其余结论与 plan 一致。

---

## 附:调研涉及的关键路径(便于复核)

- arch-diagram-gen:`Downloads/architecture-diagram-generator-1.1/architecture-diagram/{SKILL.md, resources/template.html}`
- drawio:`Downloads/drawio-30.2.5/src/main/webapp/js/{grapheditor/, mermaid/drawio-mermaid.min.js}`、
  `stencils/*.xml`(stencil DSL)、`templates/maps/living_beings_mind_map.xml`(mxGraphModel 实例)
- BlockSuite:`Downloads/AFFiNE-0.26.3/blocksuite/affine/{gfx/, model/src/elements/, blocks/surface/src/surface-model.ts}`
- Excalidraw:`Downloads/excalidraw-0.18.1/packages/excalidraw/{element/types.ts, renderer/renderElement.ts, data/{ai/, reconcile.ts, json.ts}, element/{mutateElement.ts, typeChecks.ts, collision.ts}}`
