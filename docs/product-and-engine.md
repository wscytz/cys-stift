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

- `CanvasElement` 6 个 active kind:card / arrow / freedraw / text / rect / frame(legacy: ellipse/line/note/image 仅读旧画布)
- card 几何来自 CardService/DB(单一可信源);freeform(text/freedraw/arrow/rect)几何来自 per-canvas OPFS store
- freedraw 点序列**不进 DSL**(R2 隐私:不外发 AI;手绘是矢量,点数据留在引擎存储)
- 引擎只动 `packages/canvas-engine`(零业务依赖);DSL/apply 层在 apps/web(可依赖 domain/engine)

---

## 三、当前状态(2026-06-26)

### 引擎:离线功能打磨完成 + 独立成包

- **五视图一致 + 鲁棒性**:交互层(kind×操作矩阵全清)、渲染/导出层(SVG 对齐渲染)、DSL 双向对称补全;5 轮边界加固
- **转义对全部 active kind 双向无损**——serialize→parse→apply→re-serialize 逐字节往返验证(仅 freedraw 例外=设计,守 R2 隐私)
- **独立成包**:`packages/canvas-engine` 零业务依赖 + token 注入 + standalone 活证据(`InMemoryCanvasHost` + 自定义 tokenResolver;ADR `docs/adr/2026-06-23-canvas-engine-extract.md`)
- 372 引擎测试 + 655 web 测试,build exit 0

### 产品:核心闭环 + 转义产品化 + 多轮加固,全部落地

捕获(全局快捷键 / mini input / 文件拖拽)/ inbox(多媒介编辑)/ canvas(自研画布 + 关系箭头三维签名 + Frame 分区 + Outline + Minimap + 全局缩略图 + 智能 elbow)/ archive / trash / search(打分)/ timeline / tags(10 色)/ SVG-PNG-.cystift 导出 / Markdown 导出 / 双链 [[]] / DSL 模态编辑器(看/编/应用/复制/下载 + 诊断)/ AI(3 provider + 排版 + auto-relate + cluster + 找重复)/ JSON 全量备份(含画布几何)。已 push 公开仓。

**多轮加固**:UI 审计 42 项 + a11y 系统化 ~45 项 + web 层鲁棒性 ~20 真 bug + 数据/反馈/坏输入修补轮 16 真 bug;功能期 6 个新功能(Backlink/Frame/全局缩略图/智能 elbow/Markdown 导出/双链)。

### 剩余缺口

- **Tauri 签名分发**(spec P8)— 卡 Apple 证书(用户侧);DMG 可本地构建(未签名)
- **真实使用反馈**(打磨期燃料)— backlog A 当前空,核心动线待手测验证

---

## 四、优先级框架(2026-06-26 刷新)

工作按"是否推进核心承诺"排序。**判断标准不是"还有没有缝可修",而是"这一步是否推进产品的核心承诺(转义 + 本地优先画布)"。**

### 已完成(原三层框架,2026-06-24 立)

- ✅ **交付闭环**:JSON 全量备份(含画布几何,数据可迁移信念 4)/ 转义产品化(DSL 模态编辑器 + 诊断 + Outline + Markdown 导出 + 双链 [[]])/ AI 介入手绘(R2 安全形状描述,不发点序列)
- ⏳ **Tauri 签名分发**(spec P8)— 唯一未闭合的交付项,**卡 Apple 证书**(用户侧),非纯技术阻塞;DMG 可本地构建

原三层已基本完成,加 3 轮加固 + 6 个功能扩展。**继续盲扫找缝的边际收益已很低**(见下文反模式)。

### 当前新前沿(方向选择,非"还有没有缝")

核心承诺已落地。接下来是从下列方向里**选**,而非继续堆功能或找缝:

1. **发布稳定版 + 真实反馈** — 手测核心动线(捕获 / inbox 编辑 / 画布养 / 归档沉淀 / 导入导出往返),无 HIGH/MED 真 bug → 打 tag 发稳定版;backlog A 开始收真实反馈。**打磨期的正路退出**(polish-phase §五)。
2. **引擎独立化深化(北极星)** — `canvas-engine` 做成可独立发布/复用的包:独立 demo 站 + npm 发布骨架 + 脱离 cys-stift 的示例应用。差异化资产的长期杠杆。
3. **转义深化** — DSL 从"模态编辑器"升级:实时双向同步(编辑文本 = 编辑画布)/ 作为剪切板交换格式跨实例 / AI 驱动的工作流模板。
4. **Tauri 签名分发**(待证书)— 证书到位即闭合。

> 方向的具体权衡见对话;本节锁定"三层已完成 + 新前沿候选"的事实框架。当前状态见 `STATE.md`「下一步」。

### 反模式:停止"修缝"循环

引擎已到"离线功能打磨完成"。继续"找缝"的边际收益已很低,且是防御性工作、不产出用户价值。除非某条缝直接阻断交付主线,否则不主动挖。

> 产品在**打磨期**(2026-06-26 起)。这条原则的可操作落地——打磨 vs 修缝判据、反馈驱动流程、活 backlog、退出标准——见 [`docs/development/polish-phase.md`](development/polish-phase.md)。判断"这一步该不该做"先读它。

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
