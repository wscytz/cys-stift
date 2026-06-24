# cy's Stift — 产品与引擎说明

> **用途**:产品与画布引擎的全局定位锚点。任何会话/compact/方向迷茫时先读这份,判断"这一步是否推进核心承诺",而不是"还有没有缝可修"。
>
> 单一可信源仍在 `docs/STATE.md`(状态)+ `docs/specs/2026-06-19-cys-stift-design.md`(冻结设计)。本文件是**定位与优先级框架**,不复制状态细节。
>
> 生效:2026-06-24

---

## 一、产品是什么

**cy's Stift — 本地优先的灵感画布。** 包豪斯式克制与几何。

一句话叙事:**"灵感 3 秒记,画布上慢慢养。"**

它不是笔记软件(Notion)、不是白板(tldraw/Miro)、不是知识库(Obsidian)。它是**一条从"捕获"到"养成"到"沉淀"的动线**:

```
3 秒捕获(快捷键 / mini input) → Inbox(多媒介编辑) → Canvas(自由画布上养) → Archive(沉淀)
```

核心是那个**"养"**字——想法落到画布上不是终点,是起点:在画布上挪、连、归类、变形成作品。所以**画布不是附属视图,是产品的心脏**。

### 四条核心信念(spec §1.2)

1. **本地优先** — 数据是用户的,不是云端的
2. **形随功能** — 包豪斯是约束,不是滤镜
3. **特性即接口** — 每个 feature 是可独立替换的"切片"
4. **数据可迁移** — 本地数据随时可导出开放格式(JSON / Markdown),不做锁定。云同步是叠加层,不是逃生口

### 受众

**人类 + 任意 LLM**(Claude / GPT / Gemini / …)。这一条决定了产品天然为 AI 协作设计——画布不只是给人看,也是给 AI 读和改的。

### 技术栈(不可重新选型)

Next.js 15 静态导出 + React 19 + TS strict + 自研 Canvas 2D + Tauri v2 + SQLite/OPFS。包豪斯 6 原色(red/yellow/blue/black/white/gray,无绿)+ 8px 网格 + Space Grotesk/Inter/JetBrains Mono。

---

## 二、画布引擎是什么

画布引擎(`packages/canvas-engine`)是产品心脏的实现。存在有三个层次的理由:

### 1. 承载差异化卖点:转义

转义(用户 2026-06-23 定调的核心卖点):**画布上的一切能用确定的文字规则描述,文字能反向改画布。** 因此**任何 AI 都能廉价驱动画布编辑**(即使 AI 输出不完美,规则兜底)。

这比"可迁移"深一层:不只是导出,是**双向 + AI 可操作**。技术承载体 = DSL 双向(serialize ↔ parse ↔ apply)+ `CanvasElement` 统一模型。tldraw/excalidraw 的画布是图形,我们的画布是**可被文字完全描述且文字可改的图形**。

### 2. 透明统一模型

`CanvasElement` 是唯一模型。**五视图全是它的投影**:实时渲染 / SVG 导出 / PNG / .cystift 文件 / DSL 文本。改一处,五处一致。这从根上消除了"渲染画对了但导出错""DSL 丢了某字段"这类缝。

### 3. 北极星:可独立成包

引擎做成**可独立成包/项目的核心**:
- 零业务依赖(不认 cys-stift 的 Card/Relation)
- 框架无关(无 `'use client'`)
- token 注入(`TokenResolver`,不耦合 DOM/调色板)

长期它可以是 `@cy/canvas-engine`,被别的产品复用,或脱离 cys-stift 独立运行。已有 `InMemoryCanvasHost` + 自定义 tokenResolver 作 standalone 活证据。ADR `docs/adr/2026-06-23-canvas-engine-extract.md`。

### 差异化卖点(vs tldraw / excalidraw)

- **语义关系签名**:每种关系一个固定三维视觉签名(线型 dash + 箭头形 arrowhead + 颜色),一眼读出关系性质。不是用户手选样式的几何箭头。
- **转义双向**:画布 ↔ 文字无损,AI 廉价驱动。

### 引擎边界

- `CanvasElement` 5 个 active kind:card / arrow / freedraw / text / rect(legacy: ellipse/line/note/image 仅读旧画布)
- card 几何来自 CardService/DB(单一可信源);freeform(text/freedraw/arrow/rect)几何来自 per-canvas OPFS store
- freedraw 点序列**不进 DSL**(R2 隐私:不外发 AI;手绘是矢量,点数据留在引擎存储)
- 引擎只动 `packages/canvas-engine`(零业务依赖);DSL/apply 层在 apps/web(可依赖 domain/engine)

---

## 三、当前状态(2026-06-24)

### 引擎:离线功能打磨完成

- **五视图一致 + 鲁棒性**:交互层(kind×操作矩阵全清)、渲染/导出层(SVG 对齐渲染)、DSL 双向对称补全
- **转义对 5 个 active kind 双向无损**——serialize→parse→apply→re-serialize 逐字节往返验证(仅 freedraw 例外=设计,守 R2 隐私)
- 280 引擎测试 + 457 web 测试,build exit 0

### 产品:核心闭环已落地

捕获 / inbox(多媒介编辑)/ canvas(自研画布)/ archive / search / tags / SVG-PNG-.cystift 导出。已 push 公开仓(`git@github.com:wscytz/cys-stift.git`)。

### 缺口

- JSON 全量备份不完整(不含画布几何)= 数据可迁移信念 4 裂的(spec P9)
- Tauri 未签名分发(spec P8,需 Apple 证书)
- 转义已产品化:DSL 模态编辑器(`dsl-dialog.tsx`)——工具栏 DSL 按钮 → 模态看/编/应用/复制/下载画布文本,不门控 AI,所有用户可用(2026-06-24)

---

## 四、优先级框架

工作分三层,按"是否推进核心承诺"排序。**判断标准不是"还有没有缝可修",而是"这一步是否推进了产品的核心承诺"。**

### 第一层 · 交付闭环(让产品成立)

1. **JSON 全量备份完整**(含画布几何)— 数据可迁移信念 4 的硬要求,spec P9。产品"数据不丢"承诺成立。
2. **Tauri 签名分发** — 本地优先的可分发承诺,spec P8。(需 Apple 证书,可能卡用户侧)

### 第二层 · 让差异化可见(让转义成为产品能力)

3. **转义产品化** — 让 DSL 从埋在 AI 按钮后变成用户能摸到的功能:DSL 文本编辑器 / 粘贴 DSL 建画布 / 导出 DSL 文本 / AI 驱动更顺。**这是引擎投资的回报。**

### 第三层 · 增值(差异化扩张)

4. **AI 介入手绘的额外判断** — 守 R2 隐私只发抽象几何特征(不发点序列)。引擎地基 + 数据完整 + 分发闭合后做。

### 反模式:停止"修缝"循环

引擎已到"离线功能打磨完成"。继续"找缝"的边际收益已很低,且是防御性工作、不产出用户价值。除非某条缝直接阻断第一/二层主线,否则不主动挖。

---

## 五、约束(不可遗忘,详见根 `CLAUDE.md`)

- spec `docs/specs/2026-06-19-cys-stift-design.md` 冻结不改
- 不重新选型(换框架/ORM/数据库)—— 要改先写 ADR
- 不在组件层写死 hex / 像素 —— 走 token
- `packages/domain` + `packages/canvas-engine` 零业务依赖
- 静态导出(无 server / API routes / 动态路由)
- 不假装 build/test 通过 —— 实际跑命令看 exit code
- 不加用户没要求的依赖或"附赠功能"(YAGNI)
- AI 隐私:`source.deviceId` / `media.dataUrl` / 软删除卡 永不进 prompt;无 vision 模型(永久不做);手绘点序列不外发 AI(R2)
- Bauhaus 6 原色(red/yellow/blue/black/white/gray),无绿
- commits: `git -c user.name=cy -c user.email=cy@stift.local commit`,无 Claude footer;push 走 SSH
- docs/plans/ gitignored(过程文档不入公共仓)

---

## 六、执行模式

Ralph 式 subagent 编排(主模型拆+审+commit,subagent 执行 TDD 先红后绿;stop-hook 自动循环停用,手动编排)。每批 commit + push,用户扫。
