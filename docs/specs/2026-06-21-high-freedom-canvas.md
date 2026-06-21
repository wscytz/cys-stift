# 高自由画布(High-Freedom Canvas)Design Spec

> brainstorming 产出。参考苹果无边记(Freeform),以"整理笔记"为核心,让画布从"只摆灵感卡"变成"自由多元素笔记整理工作区"。保持包豪斯极简视觉语言。

## 目标

**一句话**:画布上灵感卡(结构化)+ 便签/文本/形状/箭头/手绘(自由元素)共存,用户高自由组织笔记,且全部持久化不丢。

**核心场景**:用户在画布上 —— 摆几张灵感卡(从 inbox 来)、加几个文本标注、画箭头连关系、手绘草图圈重点。这些元素自由混排,刷新不丢,包豪斯极简风格。

---

## 现状诊断

| 问题 | 现状 | 根因 |
|---|---|---|
| 画布只能摆卡 | dblclick 建灵感卡,无其他工具 | `hideUi` + 全面板屏蔽(`canvas-editor.tsx:87-98`) |
| 自由元素会丢 | tldraw 原生 shape(便签/文本/形状)无持久化 | 只 `bindCardWriteback` 持久化 card 位置到 CardService |
| 卡片看不到内容 | 画布只显示 title | card shape props 只存 title,渲染不查 body |
| 卡内容不同步 | inbox 改 title,画布不更新(直到 reload) | card→shape 单向(load 时填),无 DB→shape 实时同步 |

---

## 架构(三个决策)

### 决策 1:全画布 snapshot 持久化

每画布一个 snapshot 存 localStorage,key `cys-stift.canvas.<canvasId>.v1`。

- 用 tldraw `getSnapshot(editor.store)` → `{document, session}`
- document = 所有 shape(灵感卡 + 自由元素)+ bindings(箭头连接)+ assets
- session = camera/selection/当前页
- onMount:`loadSnapshot` 恢复;之后防抖(500ms)存
- 灵感卡 shape 也在 snapshot 里(几何 + cardId 引用),内容见决策 2

**为什么不用 tldraw 原生 IndexedDB persistence**:灵感卡要进 CardService(被 inbox/archive/search 统一管理),原生 persistence 会让卡脱离 CardService 体系。snapshot 方案让我们控制存储 key + 与 CardService 协调。

### 决策 2:card shape 瘦化,内容单一数据源

card shape props 从 `{w, h, title, kind}` **瘦化为 `{w, h, cardId}`**(只存几何 + 引用)。内容(title/body/type/pinned)由 **card shape 渲染组件实时查 CardService** 获取。

- 渲染:`shape id → cardIdFromShapeId → service.get(cardId) → 渲染 title + body preview + 类型标记`
- inbox 编辑 card → CardService 更新 → 画布 card shape 重新渲染(查 DB 拿最新)→ **实时同步,无需 reload**
- body preview 自然实现(渲染查 body,截断显示几行)
- snapshot 只存 card 几何 + cardId,内容不冗余 → 无 sync 冲突

**单一数据源**:CardService 是 card 内容的权威,画布 shape 只是"几何视图"。这是干净的数据模型,避免双写地狱。

### 决策 3:包豪斯自定义工具栏(替换 hideUi)

保留 `hideUi`(屏蔽 tldraw 默认彩色 chrome),在 `<Tldraw>` 内渲染**自定义包豪斯工具栏**:

- 工具(用 `editor.setCurrentTool`):
  - **select**(选择/移动)— 默认
  - **card**(灵感卡)— 自定义工具,点击画布创建空卡(替代当前 dblclick,或保留 dblclick)
  - **note**(便签)— tldraw 原生
  - **text**(文本框)— tldraw 原生
  - **rectangle**(矩形)— tldraw 原生,包豪斯基础形
  - **arrow**(箭头)— 连接元素表达关系
  - **draw**(手绘)— 草图/圈注
  - **eraser**(橡皮)
- 视觉:黑白灰 + 红强调(当前工具红色高亮),mono 字体标签,8px 网格,硬阴影。非 tldraw 彩色。
- 位置:画布顶部或左侧浮动(与现有 SnapToggle/ZoomGroup/CanvasSwitcher 协调)

**为什么不直接放开 tldraw 默认 toolbar**:tldraw 默认是彩色丰富风格,与包豪斯 6 原色冲突。自定义保持品牌一致性。

---

## 分阶段

### F1 — 持久化 + card 瘦化 + body preview(地基 + 立刻见效)

**这是 reset 重灾区(canvas-editor / canvas-binding),格外谨慎。**

- 新增 canvas snapshot store(`lib/canvas-snapshot-store.ts`):per-canvas getSnapshot/loadSnapshot + 防抖存
- `canvas-editor.tsx` onMount:loadSnapshot 替代/补充 loadCardsIntoEditor
- `canvas-binding.ts`:cardToShape / writeCardToShape 瘦化(去 title/kind,加 cardId)
- card shape 渲染组件:查 CardService 渲染 title + body preview(2-3 行截断)+ 类型 Tag + pinned 星
- bindCardWriteback 保留(位置写回 CardService)
- 新增:自由元素(非 card shape)变化 → snapshot 防抖存
- 兼容:旧 snapshot(若有)或无 snapshot 时,从 CardService load card(loadCardsIntoEditor 兜底)

**验收**:画布加便签/文本/形状/箭头 → 刷新仍在;inbox 改 card 内容 → 画布实时更新;card 显示 body 预览。

### F2 — 包豪斯工具栏(高自由核心)

- 自定义工具栏组件(`features/canvas/canvas-toolbar.tsx`)
- 接 `editor.setCurrentTool`,包豪斯样式
- 与现有画布工具(SnapToggle/ZoomGroup/CanvasSwitcher)布局协调
- dblclick 建卡保留(或改为 card 工具点击)
- 键盘快捷键(v/select, r/rectangle, a/arrow, d/draw 等)

**验收**:工具栏切换工具,画布上能加便签/文本/形状/箭头/手绘,与灵感卡共存,全部持久化。

---

## 关键决策汇总

| 决策 | 选择 | 理由 |
|---|---|---|
| 持久化后端 | localStorage snapshot(per canvas) | 控制 key + 与 CardService 协调;不用 tldraw 原生 IndexedDB(避免卡脱离 CardService) |
| card 数据模型 | 瘦 shape(cardId+几何),内容查 CardService | 单一数据源,实时同步,body preview 自然 |
| 工具栏 | hideUi + 自定义包豪斯 | 保持品牌;非 tldraw 彩色 |
| 元素范围 | card/note/text/rectangle/arrow/draw/eraser | 无边记核心元素,包豪斯约束(无彩色便利贴) |
| dblclick 建卡 | 保留 | 现有肌肉记忆,与 card 工具并存 |

---

## 风险

- **⚠️ canvas-editor / canvas-binding 是 reset 灾难重灾区**。F1 必须小步:每改一处 `pnpm --filter web build` + 手动验证,绝不批量改。优先用 `git stash` 而非手动 mv 备份(上次教训)。
- snapshot 体积:localStorage 5-10MB 限制。自由元素多了(尤其手绘路径)可能超。F1 加 quota 警告 + 大画布提示导出。长期 OPFS。
- card 瘦化破坏性:旧 card shape(含 title props)与新(含 cardId)不兼容。F1 要兼容旧 snapshot 或 migration。MVP 可"清空画布重来"(用户数据少),但要在 spec 标明。
- loadSnapshot 与 loadCardsIntoEditor 协调:避免双创建 card shape(去重 by shape id)。

## defer(明确不做)

- 多设备同步 / 协作(本地优先单机)
- 媒体层 OPFS(视频/PDF/Excel,用户搁置)
- tldraw 原生彩色主题
- 灵感卡的 color/rotation UI(已有字段,F1 之后视情况)
- 多画布间的元素复制/模板

---

## 验收(整体)

- 画布:灵感卡 + 便签 + 文本 + 矩形 + 箭头 + 手绘 共存,自由摆放
- 刷新:所有元素 + 位置 + 连接 持久
- inbox 改 card:画布实时反映
- body preview:画布 card 显示正文预览
- 包豪斯视觉:工具栏极简,6 原色,无 tldraw 彩色
- domain 26/26 + db 7/7 + web build exit 0