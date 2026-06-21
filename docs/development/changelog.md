# 变更日志

> 每完成一个 Phase 追加一段。格式：`## YYYY-MM-DD · phase N · <slug>`。

---

## 2026-06-21 · v0.31.0-debt-cleanup

P1(技术债清扫 — 零行为变化):

- **canvas-editor.tsx 拆分**: 347→166 行。3 个 bridge 抽到独立文件(`canvas-view-persistence-bridge.tsx` 53 行 / `canvas-editor-binding-bridge.tsx` 59 行 / `canvas-double-click-bridge.tsx` 111 行)。每个 bridge 是 null-returning 组件,独立 useEffect,可单测。
- **B8 修正**: `__canvasEditor` global **保留**(e2e 17 处引用,grep 确认),加注释说明 diagnostic + e2e 友好 hook。`__cardService` 改走 React Context(`CardServiceContext` 已存在),relation-panel / auto-relate 不再读 global,`card-service-access.ts` 删除。
- **顺带修预存 bug**: db-client.ts 新增 `rehydrateCards` 导出(M3.2 commit 引入 import 但函数丢失,build 阻塞)。用现有 `loadSnapshot()` 复用 Date 重建逻辑。
- **canvas-snapshot-store 单测**: 9 个 it(save→load 往返 / corrupt JSON 容错 / SSR no-op / quota 异常不 throw / canvas 隔离 / remove no-op),为 P3 B6 offload 铺安全网。
- **测试**: vitest 12 → 21(12 AI + 9 snapshot-store);domain 26/26;db 7/7;build exit 0
- **e2e**: m3 7/7 + canvas-refactor PASS + m1 7/8(1 个预存 bug 与本次无关)
- **新增 P1.5 决策档**: [`docs/memory/decisions/2026-06-21-debt-cleanup.md`](../memory/decisions/2026-06-21-debt-cleanup.md)

详见决策档。

---

## 2026-06-21 · v0.30.0-ai-accessibility

AI 可访问性 & 隐私设计(**纯文档**,无代码改动):

- **`docs/user/privacy.md`**:中英双语,UI 友好。AI 看到什么 / 看不到什么 / 怎么关 / 关了会怎样 / API key 怎么存 / 多 provider 行为差异 / 手绘 = 几何描述 / 多模态不做
- **`docs/development/privacy-design.md`**:开发面向。三条原则(显式 allowlist / 手动 / 本地优先)、手动 AI context 流程、12 项 phase check-list、`ai-context.ts` API 设计、`canvas-snapshot.ts` schema、DSL 输出格式、测试要求、未来扩展
- **决策档**:`docs/memory/decisions/2026-06-21-ai-accessibility-design.md`
- **用户原话归档**:`docs/memory/feedback/2026-06-21-ai-feedback.md`
- **关键决策**:
  - 手动 `ai-context.ts` allowlist,不自动化 codegen
  - 多模态(GPT-4V / Claude Vision)**永久不做**
  - 手绘内容 = 客户端几何描述(启发式 line/rect/ellipse/note/draw 原笔触),不走 vision
  - media 二进制永不外发,只发 metadata
  - 软删除的卡不在 AI 视野
  - 每个 phase 改 AI 必走 check-list(privacy-design.md §7)
- **CLAUDE.md 更新**:加 v0.30.0 记录 + M3.1 实装候选清单
- **`apps/web/CLAUDE.md` 更新**:加 AI 改动 check-list(简版)
- **MEMORY.md 更新**:加索引

**M3.1 实装任务不在本 phase**:ai-context.ts / canvas-snapshot.ts / dsl-parser.ts / toolbar "📐 AI 排版" 按钮(~ 400 行,基于本文档设计)

详见 [`docs/memory/decisions/2026-06-21-ai-accessibility-design.md`](../memory/decisions/2026-06-21-ai-accessibility-design.md)。

---

## 2026-06-21 · v0.29.0-canvas-m3-ai

M3(AI 元素 — 完全可选 / 本地优先 / 密钥不外泄):

- **3 个 AI provider**: OpenAI (Bearer + chat/completions + SSE) / Anthropic (x-api-key + messages + content_block_delta) / Ollama (NDJSON + 本地) — 不开 SDK,纯原生 HTTP + eventsource-parser
- **/settings AI 面板**: provider 下拉 / baseUrl / model / API key password(show/hide toggle)/ 启用 toggle / 测试连接 / 明文警告 banner
- **卡片 AI actions**: Summarize / Rewrite / Translate(zh↔en), inline popover 流式输出 + Replace / Append as new / Cancel 三选项
- **画布 AI auto-relate**: 选中 ≥2 卡 → 对每对推断关系类型 → 创建箭头(复用 M2.1 `createArrowFromHandle`)
- **Provider factory maker pattern**: apiKey 闭包进 instance,工厂存 maker 函数而非实例
- **零 AI 配置时 UI 完全干净** — AI 按钮在 `ai === null || !enabled` 时不渲染(不是 disabled),符合本地优先不打扰原则
- **vitest 引入** — web 包从 0 到 12 单测(纯函数 + provider factory + safe-href AI 校验)
- **新 dep**: eventsource-parser (1 runtime) + vitest + @vitest/ui + jsdom (3 dev)
- **e2e**: `scripts/m3-shots.cjs`(7/7 passed)

详见 [`docs/memory/decisions/2026-06-21-canvas-m3-ai.md`](../memory/decisions/2026-06-21-canvas-m3-ai.md)。

---

## 2026-06-21 · v0.28.0-canvas-m2-smart

M2(画布智能化 + 多模态入口 + 传递出口): P0/P1 四个能力 + 单卡导出最简形态。

- **edge connector drag**: 卡片 4 边中点显示 vertex handle, 拖到目标卡松手即建绑定箭头 → `card-handles.ts` + `card-shape-util.tsx` (onHandleDragEnd 走 M1 验证的两步走)
- **文件多模态拖拽粘贴**: 拖入 .md/.txt/.csv/.html → 文本卡; .docx/.xlsx/.pdf/.pptx/.epub → markitdownllm 转 md + 原文件 media ref; 图片 → mediaStore image 卡 → `file-capture-sink.ts` + `file-drop-handler.tsx` + Toast 提示
- **智能关系类型推断**: 拖出箭头后读取源/目标卡内容做关键词匹配, auto-apply 默认 relation type → `relation-inference.ts` + `relation-panel.tsx` (`__cardService` 诊断 hook)
- **浮动关系面板**: panel 位置改为浮在 arrow 旁 (用 `getShapePageBounds` 计算) → `relation-panel.tsx`
- **单卡导出 Markdown**: card-detail 加 Export 按钮 → `serialize-card.ts` (frontmatter + body + 媒体 + links + code + quotes) → `export-card.ts`
- **新 dep**: markitdownllm 0.1.5 + pdfjs-dist 6.0.227 (markitdownllm 的 pdf 转换依赖)
- **e2e**: `scripts/m2-shots.cjs` 6/6 passed (edge connector + inference + floating panel + file drop + export)

详见 [`docs/memory/decisions/2026-06-21-canvas-m2-smart.md`](../memory/decisions/2026-06-21-canvas-m2-smart.md)。

---

## 2026-06-21 · v0.27.1-review-hardening

大规模代码复审修复(domain + web + canvas + import + CI,grep 4 agent → 18 findings 全修):

- **domain**:修复 12 个 TS 类型错误(wspaceId/fetchedAt/pinned/index-access)、softDelete 幂等、ensureDefault 签名(不再悬空 canvas)、UpdateCardPatch.color → ColorToken 解耦、test 脚本加 `tsc --noEmit` 门禁(db 加同)
- **数据丢失**:导入后 rehydrateCards() 防本 tab 覆盖、跨 tab storage 走 parseCardsRaw(Date 重建)、syncCardsToEditor 几何 reconcile(B3-bis)
- **M1 label**:relation arrow 写 `text` prop(之前误用 richText 失败,注释错误,已修)
- **import XSS**:links[].url http(s)/mailto/tel 白名单、media dataUrl image/\* base64 校验 + 大小上限、safe-href 共享工具
- **canvas 生命周期**:writeback + snapshot listener 迁 EditorBindingBridge useEffect(清除 __canvasEditor = B8)
- **web**:删除 unused deps(better-sqlite3/@cys-stift/db/@types)、/dev/\* prod 门禁(NODE_ENV)、scrim token("rgba leak"修)、search/settings/design 加 role="main"
- **CI**:新增 `.github/workflows/ci.yml`(domain+db 带有 tsc 门禁的 test + web build)
- **决策**:`docs/memory/decisions/2026-06-21-canvas-bugfixes.md` 更新(UI polish + label fix notes)

---

## 2026-06-21 · v0.27.0-canvas-m1-relations

M1(画布关系):给 tldraw arrow 加语义关系类型。

- **关系类型 registry**: 4 内置(blocks/references/derived-from/related-to),映射到 arrow 原生 color/dash/arrowhead/labelColor → `relation-types.ts`
- **关系面板**: 选中单个 arrow 浮出 4 类型按钮,点击重写 arrow 原生 props + 数据属性 `data-relation-id` 供 e2e → `relation-panel.tsx`
- **卡片连接徽标**: 卡片左下角显示 `× N`(N = 连接到该卡的 distinct arrow 数,`getBindingsToShape` 去重)→ `card-shape-util.tsx`
- **持久化透明**: 关系全在 arrow record,snapshot 自动保存,无新持久化层
- **e2e**: 建两卡+绑定箭头+选 Blocks+reload 持久 + 徽标 + infer 反查 → `scripts/m1-relations-shots.cjs` 8/8

详见 [`docs/memory/decisions/2026-06-21-canvas-m1-relations.md`](../memory/decisions/2026-06-21-canvas-m1-relations.md)。

---

## 2026-06-19 · phase 0 · scaffold

**交付**：pnpm monorepo 骨架 + Next.js（静态导出）+ Tauri 桌面壳 + 包豪斯占位首屏 + 完整文档与工程化配置 + git init。

**关键点**：

- 全 local-first 架构在仓库结构层就位（apps/web 静态导出、apps/desktop Tauri 壳）
- 6 个 ADR、4 份决策记录、token 文档、setup 指南落地
- **零业务逻辑**——首屏是占位页，所有功能留后续 phase

**验证**：

- `pnpm install` ✅
- `pnpm --filter web build` → 静态产物
- `pnpm tauri dev`（待 Rust 装好）
- Windows 端复验待切到 Windows 后进行

详见 [`docs/superpowers/plans/2026-06-19-phase-0-scaffold.md`](../superpowers/plans/2026-06-19-phase-0-scaffold.md)。

---

<!-- 未来 phase 在此追加 -->

## 2026-06-19 · phase 1 · design system

**交付**：`packages/ui` 从占位升级为真组件库；7 个核心组件（Button / Input / Card / Tag / Toolbar / Modal / Tooltip）；`/design` 视觉契约页面；Tailwind v4 接入。

**关键点**：

- tokens 拆成双源：`tokens.css`（CSS variables）+ `tokens.ts`（TS 对象 + 类型），Tailwind preset 注入 `@theme`
- 6 原色 / 8px 网格 / 字体 / 边框阴影全部锁在 token 集里，组件层只引用
- `/design` 是视觉契约：每个 token、每种字体、每个组件变体都看得见
- 视觉对照笔记（带逐项打勾）+ 三张截图归档到 `docs/design/screenshots/phase-1/`

**验证**：

- `pnpm --filter web build` → 静态产物 101 kB First Load JS
- 6 色 hex 全对（spec §5 vs 截图）
- 7 个组件每个在 `/design` 有可见展示
- Modal / Tooltip 静态截图受限（hover/click 触发），交互验证留后续 phase

详见 [`docs/superpowers/plans/2026-06-19-phase-1-design-system.md`](../superpowers/plans/2026-06-19-phase-1-design-system.md) + [`docs/design/screenshots/phase-1/README.md`](../design/screenshots/phase-1/README.md)。

## 2026-06-19 · phase 2 · data layer

**交付**：`packages/domain` 从占位升级（types + codec + Card/Canvas/Workspace services + 6 个 vitest 通过）；`packages/db` 从占位升级（Drizzle schema 四表 + 7 个 SQLite 集成测试通过）；`/dev/db` 烟测页 + 客户端 db-client（in-memory + localStorage 后端）；puppeteer 持久化证据脚本。

**核心承诺验证**：

- UI 写 3 张卡 → 跨刷新 → 3 张卡完整保留 ✅（puppeteer 自动化断言）
- 6 色 token / 字体 / 网格在数据层 UI 仍对 ✅
- 4 张截图归档：`docs/design/screenshots/phase-2/`

**关键工程决策**：

- `packages/db` 用 **better-sqlite3** 跑通 SQL + drizzle schema，集成测试完整。浏览器侧 `db-client.ts` 走 in-memory + localStorage 占位后端，Repository 抽象保留 — Phase 2.5 替换 in-memory 为 wa-sqlite，business code 不动
- `useDb()` hook 修了一个 SSR/客户端 hydration 引用稳定性问题（snapshot object 必须在数据变化时才重新分配）

**已知 / 后续**：

- Web 端 wa-sqlite + OPFS 替换 localStorage（Phase 2.5）
- Tauri 端 Tauri fs 落盘验证（Phase 6/8）
- MediaAsset 真实落盘（业务用，Phase 3+）

详见 [`docs/superpowers/plans/2026-06-19-phase-2-data-layer.md`](../superpowers/plans/2026-06-19-phase-2-data-layer.md) + [`docs/design/screenshots/phase-2/README.md`](../design/screenshots/phase-2/README.md)。

---

## 2026-06-19 · phase 3 · inbox business

**交付**：`/inbox` production 路由（`apps/web/src/app/inbox/page.tsx`，`'use client'`）；多媒介卡片创建表单（标题 / body Markdown / 链接 / 代码块 / 引用）；卡片详情 Modal + 编辑 Modal；归档 tab + 软删二次确认；Markdown 渲染（`react-markdown@9` + `rehype-sanitize@6`）；首页加入口；`CardService.update()`；视觉对照笔记 + 8 张截图。

**核心承诺验证**：

- UI 创建多媒介卡（链接 + 代码 + 引用）→ 详情渲染 / 编辑 / 归档 / 软删 全部走 `CardService` ✅
- 跨刷新保留（puppeteer 自动化断言：3 张卡 → 2 active + 1 归档 跨 navigate 仍在）✅
- 6 色 token / 字体 / 网格在 `/inbox` 仍对（视觉对照笔记逐项打勾）✅
- 8 张截图归档：`docs/design/screenshots/phase-3/`

**关键工程决策**：

- **新依赖只加 2 个**（plan §1 限定的）：`react-markdown@9` + `rehype-sanitize@6`。React 19 peer 警告已知但运行时无碍。
- **`CardService.update(id, patch)`**：P3-T1a 加，domain 零依赖特性保持；4 个新 vitest 覆盖（whitelisted fields only / unknown id / bumped updatedAt / multi-media 替换）。
- **Detail Modal 编辑模式简化**：只暴露 title + body（plan §3 P3-T3 描述），多媒介编辑留 Phase 3.5。Modal 内显式提示"intentionally not exposed (Phase 3 MVP)"。
- **Markdown 渲染安全**：`rehype-sanitize` + 自定义 `a` 组件再做 `http/https/相对` 协议白名单（防 `data:` 等绕过 sanitize）。链接统一 stamp `target="_blank" rel="noopener noreferrer"`。
- **toolbar Tag 随 view 切换颜色**：active 红 / archived 蓝，数字 = 对应视图的卡数。
- **路由静态导出**：`/inbox` 是静态路由（无 `[param]`），走客户端状态（detail modal / view tab）。

**已知 / 后续**：

- 编辑多媒介（详情 Modal 增量）→ Phase 3.5
- tldraw 画布位置 → Phase 4
- 全局快捷键 + mini input → Phase 6
- wa-sqlite + OPFS 替换 localStorage → Phase 2.5

详见 [`docs/superpowers/plans/2026-06-20-phase-3-inbox.md`](../superpowers/plans/2026-06-20-phase-3-inbox.md) + [`docs/design/screenshots/phase-3/README.md`](../design/screenshots/phase-3/README.md)。

---

## 2026-06-19 · phase 4 · canvas

**交付**：`/canvas` production 路由（`'use client'`，静态导出）；tldraw **v3.15.x** 客户端懒载挂载（挂载守卫 + 动态 import，静态导出安全）；Card 自定义 `ShapeUtil`（BaseBoxShapeUtil，白底黑边 8px 圆角 + Space Grotesk 标题）；§6.11 数据绑定（`listOnCanvas`→shapes 加载 + `editor.store.listen('user')` 防抖 ~300ms → `moveToCanvas` 回写）；双击空白建卡 + 复用 Phase 3 详情/编辑 Modal（编辑实时同步 shape、归档/删除即时移除）；首页加 Canvas 入口（黑 region）；`/dev/tldraw` 挂载回归 canary；6 张截图 + 视觉对照笔记。

**核心承诺验证（spec §6.11）**：

- tldraw v3 + React 19.0.0 + Next 15 静态导出：build exit 0 + puppeteer 真渲染零 page error（spec §12 风险 #1 清除）
- **位置持久化跨刷新**：puppeteer 断言 卡 x=100 → 拖动后 320（防抖回写 DB）→ 刷新后 320（位置存活）
- 双击建卡 / 点卡详情 / 编辑标题实时反映 / 归档即时移除 全流程断言通过
- 6 色 token / 字体 / 8px 点阵网格 / 黑 region 条 在 `/canvas` 仍对；`features/canvas/` hex grep 零命中

**关键工程决策**：

- **tldraw v3.15.6（非 v5）**：spec 写 v3；npm latest 已到 v5.1.1，但 v5 peer 要求 React ≥19.2.1（我们 pin 19.0.0），v3.15.6 peer `^18.2.0 || ^19.0.0` 正好匹配 + spec 对齐 + 不动 React。
- **客户端懒载 + 动态 import 边界**：tldraw 模块加载时访问 `window`，静态导出预渲染期会炸。边界划在 `tldraw-canvas.tsx`（`useEffect` 内 `import('./canvas-editor')`）——tldraw 代码只在浏览器 mount 后加载。tldraw ~2.1MB 独立 chunk，懒载不污染其他路由首屏。
- **shape id = `shape:` + cardId**：tldraw 强制 shape id 以 `shape:` 前缀。`cardToShape` 加前缀，回写时 `cardIdFromShapeId` 剥前缀还原 domain CardId——shape 与卡往返一致。
- **`mergeRemoteChanges` 避自激**：加载用 `editor.store.mergeRemoteChanges(() => createShape)` 标 remote 源；写回监听 `store.listen({source:'user'})` 只听用户拖动，不触发回写循环。
- **`pointerEvents: none` on HTMLContainer**：卡片 HTML 覆盖层若 `pointerEvents:'all'` 会吞掉 pointer、tldraw 拖不动。Phase 4 卡无内部交互 → 设 `none` 让 tldraw 接管选中/拖拽；开详情走 DOM dblclick + `getShapeAtPoint` 判空白 vs 卡。
- **`hideUi`**：隐藏 tldraw 冗余 chrome（形状工具条 / 菜单），保留选中/拖拽/缩放手柄。网格/缩放/对齐控件留 Phase 5。
- **editor handle 经 `onEditorReady` 提到 page**：Modal 在 page 层，save/archive/delete 后用 binding helper（`updateCardShape`/`removeCardShape`，均 mergeRemoteChanges）同步回 tldraw。
- **domain / db 零改动**：`CardService.create/listOnCanvas/moveToCanvas` + canvas 列 + 索引（Phase 2）已就绪；archived/deleted 过滤在 `loadCardsIntoEditor` 里做（不动 domain）。

**已知 / 后续**：

- 网格 snap / free 切换、缩放控件、对齐辅助线 → Phase 5
- 画布视图持久化（viewJson zoom/pan）、inbox → canvas send → Phase 5+
- Delete 键删 shape 与 DB 的同步（MVP 以 Modal 软删为准）→ Phase 5 打磨
- wa-sqlite + OPFS 替换 localStorage → Phase 2.5

详见 [`docs/superpowers/plans/2026-06-19-phase-4-canvas.md`](../superpowers/plans/2026-06-19-phase-4-canvas.md) + [`docs/design/screenshots/phase-4/README.md`](../design/screenshots/phase-4/README.md)。

---

## 2026-06-19 · phase 5 · canvas full

**交付**：`/canvas` 工具条右侧新增 snap/free 切换 + 缩放 4 按钮（−/%/+/FIT）+ 键盘快捷键（`+ - 0 1 g`）；tldraw v3 内置 snap 网格 + 指示线能力开箱即用，**0 新依赖**；snap 指示线样式覆盖为 `var(--color-black)` 1px；mobile media query 收紧 hint/dividers/百分比。

**核心承诺验证（spec §8 Phase 5 段：网格/自由模式、缩放、对齐）**：

- snap 模式拖动落点对齐 8px 网格：`+147px → x=488, 488%8==0` ✓（puppeteer 断言）
- free 模式拖动自由落点：`+147px → x=747, 747%8!=0` ✓（puppeteer 断言）
- 缩放 2x 步进（tldraw 默认）：100 → 200 → 400 → 800% ✓
- zoom to fit：3 张散卡全部进视口 ✓
- 键盘 `g` 切换 snap ↔ free ✓
- 6 色 token / 字体 / 8px 网格 / 黑 region 条 在 `/canvas` 仍对；`features/canvas/` + `app/canvas/` hex grep 零命中
- 10 张截图归档：`docs/design/screenshots/phase-5/`

**关键工程决策**：

- **`useState<Editor>` 替代 `useRef<Editor>`**：Phase 4 用 ref 留坑——ref 改值不触发 re-render，toolbar 按钮永远 disabled。Phase 5 第一个真依赖 editor 的功能（snap 切换）暴露。改 state 让 toolbar 跟着 mount 重渲染。
- **toggle 同时设 `isGridMode` + `user.isSnapMode`**：tldraw v3 这俩**是独立的**——`isGridMode` 是 snap 总开关（DefaultCanvas / Pointing / Translating 都读），`isSnapMode` 只是 Ctrl 反转行为。两者必须同步才能让"显示状态 ↔ snap 行为"一致。
- **`gridSize` 显式设 8**：tldraw v3 默认 10，spec §4.3 要 8。onMount 调 `editor.updateDocumentSettings({ gridSize: 8 })`。
- **缩放按钮用本地 `<button>` 而非 `Button`**：Button 40px 高 + padding 大不适合 47px 黑条内紧凑布局。本地按钮 height 32px 贴 toolbar 尺度，颜色/边框全走 token，不破坏视觉契约。
- **`window.__canvasEditor` 诊断 hook**：puppeteer 脚本读 live editor state（isGridMode / gridSize / camera z），window 暴露避免 monkey-patch。
- **snap 指示线覆盖为黑**：tldraw 默认饱和红（`hsl(0,76%,60%)`），包豪斯 red 保留给 inbox/capture 区域，canvas snap 用黑更克制（注册标尺感）。
- **0 新依赖**：沿用 `@tldraw/tldraw@3.15.6` + Phase 1-4 全套组件 + 全 token。

**已知 / 后续**：

- 视图持久化（zoom/pan/gridMode 写 `canvases.viewJson`；domain 需补 `CanvasService.updateView` + `CanvasRepository.update`）→ Phase 5+
- Delete 键与 DB 同步打磨（tldraw Delete → `CardService.softDelete`，需二次确认交互）→ Phase 5+
- mobile toolbar 横向溢出（390px 视口下 zoom 按钮仍溢出；hint/dividers/百分比已隐藏让 snap tag 可见，但 zoom 按钮在视口外）→ Phase 5+ mobile polish
- 自定义 snap threshold / 缩放曲线 / 旋转 snap → 后续打磨
- tldraw chrome 完整换肤 → 后续
- inbox → canvas send / 多画布 UI / `/canvas?id=` 深链 → 留后

详见 [`docs/superpowers/plans/2026-06-19-phase-5-canvas-full.md`](../superpowers/plans/2026-06-19-phase-5-canvas-full.md) + [`docs/design/screenshots/phase-5/README.md`](../design/screenshots/phase-5/README.md)。

---

## 2026-06-19 · phase 6 · capture entry

**交付**：`Cmd/Ctrl+Shift+Space` 全局快捷键（任意路由触发）→ Mini Input 居中浮层（spec §5.5：2px 红边框 + 顶部 8px 红条 + z-index 200）→ Enter 展开 body / Cmd+Enter 保存 → 走 `WebCaptureSink` (新) → `service.fromCapture({ source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'web' } })` → 卡进 `/inbox`。`CaptureSink` 接口 web 端落地（spec §7 依赖倒置：web-local 接口 + 实现，domain 不感知）。首页新增 Capture 红条入口。

**核心承诺验证（spec §8 Phase 6 段：全局快捷键 + 菜单栏 + mini input）**：

- 全局快捷键 `Cmd/Ctrl+Shift+Space` 在 `/` + `/inbox` + `/canvas` 都触发 Mini Input ✓（puppeteer 断言）
- Enter 标题 focus 展开 body textarea ✓
- Cmd+Enter 保存 + 关闭 ✓
- `card.source.kind === 'shortcut'` + `shortcutId === 'cmd-shift-space'` + `deviceId === 'web'` ✓（puppeteer 读 localStorage 断言）
- 跨刷新保留 ✓
- 焦点在 input/textarea/contenteditable 内**不**触发 ✓
- 6 色 token / 字体 / 8px 网格 / 红 region 条 在 Mini Input 仍对
- 9 张截图归档：`docs/design/screenshots/phase-6/`

**关键工程决策**：

- **`CaptureSink` 接口放 `features/capture/` 而非 domain**：spec §7 列出接口但未规定位置；依赖倒置——web-local 接口 + 实现，domain 不感知。`CardService.fromCapture` 作为底层统一入口。
- **Mini Input 不复用 `<Modal>` 组件**：Modal 1px 黑边 + z-index 100 vs Mini Input 2px 红边 + z-index 200 抢眼。自建 `.mi-*` CSS。
- **`Input` 不 forwardRef，用 `autoFocus` 兜底**：Phase 1 Input 没 forwardRef；`MiniInput` 早返 `null` 后再渲染那一拍，浏览器 `autoFocus` 触发。
- **首页 Capture 入口纯展示**（无 onClick）：避免 event bus 跨组件通信；按快捷键即可。
- **Enter 展开 body 用 `placeholder` 字符串判别 active element**：Mini Input 内只有一个 Input；用 ref 更鲁棒但 Input 不支持；placeholder 匹配是合理 trade-off。
- **puppeteer 用 `Control+Shift+Space`**：macOS Chrome headless 模式 `Meta+Shift+Space` 被 Spotlight 系统级拦截；浏览器内 `Control` 跨平台一致，**真实用户 `Cmd+Shift+Space` 浏览器内仍工作**（CaptureHost 接受 `metaKey || ctrlKey`）。
- **0 新依赖**：沿用 react + domain `fromCapture`（Phase 2 已实现 + 1 个 vitest 覆盖）+ Phase 1 组件库。
- **不重构 inbox CreateCardForm**：tagged Phase 3 代码，Lean 排除。

**已知 / 后续**：

- Tauri 全局快捷键（`@tauri-apps/plugin-global-shortcut`）→ Phase 6+（apps/desktop 实施时）
- 菜单栏 / menubar capture → Phase 6+
- 编辑多媒介（详情 Modal 改 links/code/quotes）→ Phase 6+（或单独 Phase 3.5）
- inbox → canvas send 动作 → Phase 6+
- 图片上传 / MediaAsset 落盘 → Phase 6+
- 链接 OG 抓取 → 留后
- 草稿自动保存（spec §5.5）→ 后续
- 快捷键自定义（spec §5.5）→ 后续
- 多 CaptureSink 实现（spec §7 列 5 个待实现）→ 本阶段仅 web 1 个
- 手动 capture（inbox CreateCardForm）改用 WebCaptureSink → 留 Phase 6+（避免触碰 tagged Phase 3）
- `Cmd+Shift+Space` macOS Spotlight 冲突 → 浏览器内可拦截；OS 级是用户的，浏览器无法阻止

详见 [`docs/superpowers/plans/2026-06-19-phase-6-capture-entry.md`](../superpowers/plans/2026-06-19-phase-6-capture-entry.md) + [`docs/design/screenshots/phase-6/README.md`](../design/screenshots/phase-6/README.md)。

---

## 2026-06-19 · phase 7 · archive

**交付**:`/archive` production 路由(`apps/web/src/app/archive/page.tsx`,`'use client'`,静态导出);顶部 8px 蓝条 Toolbar(`region="archive"`)。网格视图(默认)+ 时间轴视图(按 `updatedAt` 按日 UTC 分组)双视图。多选模式 + 黑底白字浮动工具条批量 unarchive / soft-delete。首页新增 Archive 蓝 region 入口(与 Inbox 红 / Canvas 黑 三色分明)。`features/archive/` 切片干净(`archive-card-tile.tsx` tile+row 双 variant + `timeline.tsx` 日分组)。**domain / db 零改动**(复用 Phase 2/3 的 `archive` / `unarchive` / `softDelete`)。

**核心承诺验证(spec §5.4 + §8 Phase 7 段)**:

- `/archive` 空态 + 网格 + 时间轴 + 多选 + 浮动工具条 全流程 puppeteer 断言通过(8/8)
- 归档 2 → `/archive` 网格显示 2 ✓ → 时间轴按日分组 ✓ → 多选 → 批量 unarchive → archived count = 0 ✓ → `/inbox` 3 张全在 ✓
- 6 色 token / 字体 / 8px 网格 / 蓝 region 条 在 `/archive` 仍对;`features/archive/` + `app/archive/` hex grep 零命中
- 8 张截图归档:`docs/design/screenshots/phase-7/`

**关键工程决策**:

- **复用 `CardService` 已有方法**:archive/unarchive/softDelete 全是 Phase 2/3 已实现 + vitest 覆盖;Phase 7 **domain / db 零改动**,纯 web 层新增(0 新依赖)。
- **Tile + Row 双 variant 共用一个组件**:`ArchiveCardTile` 用 `variant` prop 切换视觉(网格 vs 时间轴行式),共用蓝条/meta/选中态逻辑,避免两套 CSS。
- **多选 Set 状态**:不可变更新(`new Set(prev)`);切换 selectMode / 批量操作后 `clearSelected()` 防泄漏。
- **浮动工具条 z-index 50** < CaptureHost Mini Input 200;打开 Modal 时浮动工具条在底层无影响(互斥显示)。
- **时间轴日分组用 UTC ISO date**:避免本地时区偏移造成同卡不同日;P9 暴露本地时区选项。
- **批量 soft-delete 不二次确认**(Lean):软删只标 `deletedAt`,DB 不真删;P9 导出前补二次确认。
- **Archive 不开 detail modal**:避免复制 inbox `CardDetail`(tagged Phase 3);tile onClick 留 no-op,P6.5b 抽 `features/card/` 后统一接通。
- **首页 Archive 入口蓝箭头**:复用 `home__nav-link` 网格 + 覆盖 arrow 背景蓝 + hover 阴影蓝,与 inbox 红 / canvas 黑 三色分明。

**已知 / 后续**:

- Archive tile 点击 no-op(无 detail modal)→ P6.5b 抽共享 detail modal 后接通
- 批量软删无二次确认 → P9 JSON 导出前补
- 时间轴日分组固定 UTC → P9 暴露本地时区
- 标签 / 全文搜索 / 按媒介类型分组 → P6.5+ / P9
- Archive 卡片入画布 → P6.5c inbox→canvas send 的反向复用

详见 [`docs/superpowers/plans/2026-06-19-phase-7-archive.md`](../superpowers/plans/2026-06-19-phase-7-archive.md) + [`docs/design/screenshots/phase-7/README.md`](../design/screenshots/phase-7/README.md)。

---

## 2026-06-19 · phase 6.5a · draft autosave

**交付**:`apps/web/src/lib/draft-store.ts`(web-local localStorage 草稿存储,独立 key `cys-stift.drafts.v1`)+ `apps/web/src/lib/use-debounced-callback.ts`(通用防抖 hook,500ms);Mini Input + inbox CreateCardForm 接草稿(title/body/links/code/quotes 任意字段变化防抖 500ms 写草稿;打开时从草稿恢复;提交成功 / Clear 清除;Escape 关闭**保留**草稿);puppeteer 7/7 断言;6 张截图。

**核心承诺验证(spec §5.5 "输入即保存草稿")**:

- Mini Input 输入 "草稿测试 A" → Escape 关闭 → 重开 → **草稿恢复**(`captureKept = true`)✓
- 改成 "草稿测试 B" → 关闭 → 重开 → **最新草稿**(`restoredB = 草稿测试 B`)✓
- Cmd+Enter 保存成功 → 重开 → **草稿清除**(`capture present = false`)✓ + 卡进 `/inbox` ✓
- CreateCardForm 输入 → 导航离开 → 回 `/inbox` → **表单草稿恢复**(`formTitleRestored = 表单草稿`)✓
- 零 page error
- 6 张截图归档:`docs/design/screenshots/phase-6.5a/`

**关键工程决策**:

- **草稿独立 localStorage key**(`cys-stift.drafts.v1`,与 `cys-stift.cards.v1` 分离):草稿变化不触发卡片列表重渲染;草稿失败不影响卡片完整性。
- **草稿不进 domain**:web-local UI 状态,非核心业务实体;Phase 8 Tauri 端走 Tauri fs 替换。
- **`Draft.payload: unknown`**:capture / manual 各自 cast(capture `{title, body}`,manual 完整表单状态);不污染 type 系统。
- **防抖 500ms + useDebouncedCallback**:通用 hook + unmount cleanup;不在每次按键写 localStorage。
- **Escape 保留 / 提交清除**:Escape 关闭不清(误关保护);Cmd+Enter / Clear 显式 `draftStore.clear`。
- **空草稿自动 clear**:所有字段空时清除(避免 stale 空记录)。
- **snapshot 引用稳定**(同 db-client 模式)+ restore 用 `[ready]` deps,避免覆盖用户输入。
- **CreateCardForm 改造不破坏 Phase 3 多媒介**:只加 useEffect 草稿读写 + 防抖 upsert,不动表单结构;多媒介编辑功能保持。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- Tauri fs 草稿落盘 → Phase 8
- 草稿版本历史 / 多草稿 → 留后
- 跨 tab 草稿同步 → 留后
- 草稿手动清除按钮 → 留后
- wa-sqlite 替换 localStorage → Phase 2.5

详见 [`docs/superpowers/plans/2026-06-19-phase-6.5a-drafts.md`](../superpowers/plans/2026-06-19-phase-6.5a-drafts.md) + [`docs/design/screenshots/phase-6.5a/README.md`](../design/screenshots/phase-6.5a/README.md)。

---

## 2026-06-19 · phase 6.5b · inbox multi-media edit

**交付**:`apps/web/src/features/card/editors.tsx`(新)抽 `ListEditor` / `CodeEditor` / `QuoteEditor` + `editorStyles` + 3 个 draft→payload 转换函数;`apps/web/src/app/inbox/page.tsx` 详情 Modal `CardDetail` 编辑模式**完整暴露** 3 个 editor(原 Phase 3 MVP 只暴露 title + body,违反 spec §4.2);`apps/web/src/app/inbox/create-card-form.tsx` 改用共享 editors;Phase 3 "intentionally not exposed (Phase 3 MVP)" hint 移除。puppeteer 7/7 断言;6 张截图。

**核心承诺验证(spec §4.2 + Phase 3 closeout 已知/后续)**:

- View 渲染原始 links/code/quotes ✓(view 模式 link-list / code-block / detail__quote 渲染)
- Edit mode 暴露 **3 个 editor**(.le 块各一,Link + Code + Quote)✓
- Phase 3 hint `.detail__hint` 移除 ✓
- Save 走 `service.update(id, {title, body, links, codeSnippets, quotes})` —— title 改 "Edited title" + link 替换 + code 加到 2 + quote attribution 改 ✓
- 跨刷新保留 ✓
- 零 page error
- 6 张截图归档:`docs/design/screenshots/phase-6.5b/`

**关键工程决策**:

- **editors 抽到 `features/card/editors.tsx`**:CreateCardForm + CardDetail 双消费,避免重复(原 Phase 3 在 CreateCardForm 重复定义)。
- **`editorStyles` 导出共享 CSS**:每个 consumer `<style>{editorStyles}</style>`,不堆 .le*。
- **draft→payload 转换集中到 editors 模块**(`draftLinksToPayload` 等):CreateCardForm + CardDetail 共用。
- **`CardService.update` 白名单已含 3 字段**(Phase 3 实现,无需扩 domain);`update can swap multi-media arrays` vitest 已覆盖全 3 字段。
- **`onSave` 扩 5 字段 patch**:title + body + links + codeSnippets + quotes(原 Phase 3 只传 title + body,3 类媒介走 card.* 不变)。
- **state 同步 useEffect deps 加 3 字段**:打开不同卡 / 外部 update 时 5 state 全重置。
- **Canvas `CardDetailModal` 不动**:Phase 4 自己的简化版,避免触碰 tagged Phase 4。
- **Archive tile onClick 不接通**(Lean):不引入 query string 处理。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- Canvas `CardDetailModal` 多媒介编辑 → 后续 P6.5+ 统一
- Archive tile onClick 接通 → 后续 P6.5+ 或独立 phase
- Edit-mode 草稿 → 后续 P6.5+
- Edit 实时预览 → 留后

详见 [`docs/superpowers/plans/2026-06-19-phase-6.5b-multi-media-edit.md`](../superpowers/plans/2026-06-19-phase-6.5b-multi-media-edit.md) + [`docs/design/screenshots/phase-6.5b/README.md`](../design/screenshots/phase-6.5b/README.md)。

---

## 2026-06-19 · phase 6.5c · inbox to canvas send

**交付**:`apps/web/src/app/inbox/page.tsx` 详情 Modal 加 "Send to canvas" 按钮(无 `canvasPosition` 时 primary)→ `CardService.moveToCanvas` 设 `CanvasPosition { canvasId: DEFAULT, x, y, w, h, z }` → 卡出现在 `/canvas`(Phase 4 tldraw binding 自动渲染 Card shape)→ 跨刷新保留 → 已发送按钮变 "on canvas" disabled 蓝 tag。`DEFAULT_CANVAS_ID` 从 `@/features/canvas/default-canvas` 复用。puppeteer 6/6 断言;5 张截图。

**核心承诺验证(spec §6.3 / Phase 4 §6.11)**:

- 详情 view mode 显示 "Send to canvas" 按钮 ✓
- 点击后 `card.canvasPosition = {canvasId: "default-canvas", x:100, y:100, w:200, h:80, z:0}` 写入 ✓
- 按钮变 "on canvas" disabled badge ✓
- `/canvas` 渲染 1 个 Card shape(`[class*="tl-shape"][data-shape-type="card"]`)✓
- 跨刷新保留 ✓
- `/inbox` 列表隐藏该卡(spec §6.11 行为,`listInbox` 排除 canvasPosition 卡)✓
- 零 page error
- 5 张截图归档:`docs/design/screenshots/phase-6.5c/`

**关键工程决策**:

- **复用 `CardService.moveToCanvas`**(Phase 2 实现)+ **`CanvasPosition`**(已有类型);不重写,不扩 domain。
- **`DEFAULT_CANVAS_ID` 从 `features/canvas/default-canvas` 引用**:避免 magic string。
- **z 计算**:`Math.max(...existing.map(c => c.canvasPosition?.z ?? 0)) + 1`;并发竞态 MVP 可接受。
- **位置 x/y 用阶梯式排布**:`100 + (z % 5) * 40`;避免多张卡重叠,后续 P6.5+ 可做智能定位。
- **详情状态用 `service.get(id)` 更新**:不 stale state,触发 CardDetail re-render 显示 "on canvas" badge。
- **inbox 列表隐藏 on-canvas 卡**:Phase 2 `listInbox` 真相(spec §6.11 行为);**已知 UX 限制**,后续 P9 导出可补。
- **Canvas dblclick 路径不动**:Phase 4 实现的另一入口,与新路径并存不冲突。
- **domain / db 零改动**:`moves a card to canvas` vitest 已覆盖。
- **0 新依赖**。

**已知 / 后续**:

- UX 限制:inbox→canvas 后卡从 inbox 隐藏,只能去 `/canvas` 找回 → 后续 P9 导出可补
- 多画布 UI(spec §4.9 schema 已支持)→ P6.5+
- "Send to canvas" 撤销动作 → 留后
- 智能定位到画布空白区 → 留后
- "Open on canvas" link → 留 P6.5+
- 并发 z 计算竞态 → 留后

详见 [`docs/superpowers/plans/2026-06-19-phase-6.5c-inbox-to-canvas.md`](../superpowers/plans/2026-06-19-phase-6.5c-inbox-to-canvas.md) + [`docs/design/screenshots/phase-6.5c/README.md`](../design/screenshots/phase-6.5c/README.md)。

---

## 2026-06-19 · phase 6.5d · canvas view persistence

**交付**:`apps/web/src/lib/canvas-view-store.ts`(新):web-local localStorage key `cys-stift.canvas-view.v1` + `CanvasView {zoom, panX, panY, gridMode, gridSize}` 类型 + `canvasViewStore.get/update/reset` + `useCanvasView` hook;`apps/web/src/features/canvas/canvas-editor.tsx` onMount 加载视图 + `editor.store.listen` 监听 camera + gridMode 变化防抖 500ms 写回 store;删除硬编码默认值(改读 store);`hydrateOnce()` 在 `get/update` 同步调用,避免首次 mount 把默认值覆盖持久值。puppeteer 6/6 断言;4 张截图。

**核心承诺验证(spec §4.3 gridMode + Phase 5 closeout 已知/后续)**:

- 默认:{zoom:1, panX:0, panY:0, isGridMode:true} ✓
- Zoom in ×2 → 400%(Phase 5 倍进 100→200→400)✓
- `g` 切 free → isGridMode false ✓
- Pan drag 触发 camera 变化 → 防抖 500ms 写入 ✓
- localStorage 持久化:{zoom:4, panX:-540, panY:-319.5, gridMode:'free', gridSize:8} ✓
- Reload 后状态全保留 ✓
- 零 page error
- 4 张截图归档:`docs/design/screenshots/phase-6.5d/`

**关键工程决策**:

- **web-local localStorage key**(`cys-stift.canvas-view.v1`,独立于 cards / drafts):view 是 UI 状态,非业务实体,Phase 8 Tauri 替换时再走 domain `CanvasService.updateView` + `canvases.viewJson`。
- **单 canvas 视图**(MVP),不分 canvasId:spec §4.9 schema 留位,UI 留后。
- **`hydrateOnce()` 在 get/update 同步调用**:避免首次 mount 把默认值写回覆盖持久值(原 bug 修复)。
- **`editor.user.updateUserPreferences({isSnapMode})`**:Phase 5 closeout 决策,不是 `updateInstanceState({user})`(后者类型不接受)。
- **`editor.store.listen()` 无 scope**(默认全监听):`scope: 'document'` 不触发,与 Phase 4 canvas-binding 同款用法。
- **防抖 500ms** + **cleanup 注入 `editor.dispose`**:tldraw 卸载时清 timer + unsub。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- Phase 8 Tauri fs 替换 localStorage,view 进 `canvases.viewJson`
- 多画布 view 分 canvasId → spec §4.9 schema 留位,UI 留后
- 视图 history → 留后

详见 [`docs/superpowers/plans/2026-06-19-phase-6.5d-canvas-view-persist.md`](../superpowers/plans/2026-06-19-phase-6.5d-canvas-view-persist.md) + [`docs/design/screenshots/phase-6.5d/README.md`](../design/screenshots/phase-6.5d/README.md)。

---

## 2026-06-19 · phase 6.5e · unify manual capture

**交付**:`apps/web/src/app/inbox/page.tsx` CreateCardForm 的 onCreate 改走 `new WebCaptureSink(service).submit({source:{kind:'manual', deviceId}})`(从 `service.create` 直接调用切换);`CaptureInput.links` 是 `string[]`,转换 `input.links.map(l => l.url)`。puppeteer 5/5 断言;1 张截图。

**核心承诺验证(spec §7 CaptureSink 接口统一)**:

- Inbox 创建卡 → `card.source.kind === 'manual'` ✓
- `card.source.deviceId === 'web'` ✓
- 跨刷新保留 ✓
- 零 page error

**关键工程决策**:

- **两路 capture 入口同一接口**:inbox 表单 + Mini Input 快捷键都走 `WebCaptureSink.submit → service.fromCapture`(spec §7 依赖倒置)。
- **`CaptureInput.links` 是 `string[]`**,转换 `input.links.map(l => l.url)`。
- **`service.create` 仍保留**(canvas dblclick 路径用),inbox 不再用。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- CaptureSinkRegistry(多 sink 注册)→ P6.5g
- TauriCaptureSink / MenubarCaptureSink → P6.5g

详见 [`docs/superpowers/plans/2026-06-19-phase-6.5e-unify-manual-capture.md`](../superpowers/plans/2026-06-19-phase-6.5e-unify-manual-capture.md) + [`docs/design/screenshots/phase-6.5e/README.md`](../design/screenshots/phase-6.5e/README.md)。

---

## 2026-06-19 · phase 6.5f · media upload (inline base64 MVP)

**交付**:`apps/web/src/lib/media-store.ts`(新):web-local localStorage key `cys-stift.media.v1` + `attach` / `getAsset` / `remove` + base64 data URL(soft 500KB 警告);`packages/domain/src/services/card-service.ts` 扩 `UpdateCardPatch.media` + `update` 函数体(零依赖 + 新加 1 vitest);`apps/web/src/app/inbox/page.tsx` 详情 Modal view + edit mode 渲染 `card.media`(view 渲染 `<img>`;edit 加 file input + 缩略图列表 + × 删除)。puppeteer 4/4 断言;3 张截图。

**核心承诺验证(spec §4.5 MediaAsset 最小 MVP)**:

- 上传 1 张图 → save → `card.media.length === 1` ✓
- `cys-stift.media.v1` 1 asset ✓
- 详情 Modal 渲染 1 个 `<img class="media-list__img">` ✓
- 跨刷新保留 ✓
- 零 page error

**关键工程决策**:

- **base64 inline localStorage 占位**:Phase 2.5 OPFS / Phase 8 Tauri fs 替换时,`mediaStore` 公共 API 不变。
- **domain 扩 `UpdateCardPatch.media`**:补白名单,不破坏零依赖,新加 1 个 vitest。
- **软限制 500KB**:console.warn 提示,仍接受。
- **0 新依赖**:FileReader / data URL 原生。

**已知 / 后续**:

- OPFS 真实落盘 → Phase 2.5(独立 phase)
- Tauri fs 落盘 → Phase 8
- 图片编辑(裁剪/旋转)→ 留后
- 拖放上传 → 留后
- OG 图片抓取 → 留后

详见 [`docs/superpowers/plans/2026-06-19-phase-6.5f-media-upload.md`](../superpowers/plans/2026-06-19-phase-6.5f-media-upload.md) + [`docs/design/screenshots/phase-6.5f/README.md`](../design/screenshots/phase-6.5f/README.md)。

---

## 2026-06-19 · phase 6.5g · menubar + CaptureSinkRegistry

**交付**:`apps/web/src/components/app-menu.tsx`(新):全局菜单栏 4 入口(Inbox / Canvas / Archive / Capture)+ 当前路由高亮(`usePathname`)+ Capture dispatch CustomEvent;`apps/web/src/features/capture/capture-sink.ts` 加 `captureSinkRegistry`(register/unregister/submit/has);`apps/web/src/features/capture/menu-capture-sink.ts`(新):`MenuCaptureSink implements CaptureSink`(`source.kind='menubar'`);`apps/web/src/features/capture/capture-host.tsx` 加 `openKind` 状态 + 监听 CustomEvent + 动态 register sinks(shortcut/menubar);root layout 挂 `<AppMenu />`。puppeteer 6/6 断言;5 张截图。

**核心承诺验证(spec §5.5 + §7 CaptureSink 接口多 sink)**:

- AppMenu 在 home 可见 ✓
- /inbox 高亮 Inbox / /canvas 高亮 Canvas / /archive 高亮 Archive ✓
- 点 Capture → Mini Input 开 ✓
- save → `card.source.kind === 'menubar'` ✓
- 零 page error

**关键工程决策**:

- **CustomEvent `cys-stift:open-capture`**:不引入 Zustand/event-bus,单实例 CaptureHost 是 open 状态唯一持有者。
- **CaptureSinkRegistry**:模块单例 `Map<string, CaptureSink>`;Phase 8 TauriCaptureSink `register('tauri', ...)`。
- **`openKind` 状态**:CaptureHost 追踪谁打开,save 时用对应 source.kind。
- **MenuCaptureSink 与 WebCaptureSink 对称**:都走 `service.fromCapture`。
- **动态 import + register**:service 注入,unmount 时 unregister。

**已知 / 后续**:

- TauriCaptureSink(global-shortcut + OS 级)→ Phase 8
- Webhook / mobile / alfred sink → 留后
- 菜单栏用户自定义 → P6.5h

详见 [`docs/superpowers/plans/2026-06-19-phase-6.5g-menubar.md`](../superpowers/plans/2026-06-19-phase-6.5g-menubar.md) + [`docs/design/screenshots/phase-6.5g/README.md`](../design/screenshots/phase-6.5g/README.md)。

---

## 2026-06-19 · phase 6.5h · keymap customisation

**交付**:`apps/web/src/lib/settings-store.ts`(新):web-local localStorage key `cys-stift.settings.v1` + `Settings { captureShortcut: {modKey, shift, code} }` + `settingsStore.get/update/updateCaptureShortcut` + `useSettings` hook;`apps/web/src/app/settings/page.tsx`(新):`/settings` 路由(system region)+ modifier/shift/key 下拉 + 实时显示当前组合;`apps/web/src/features/capture/capture-host.tsx`(改):keydown 监听改读 `settings.captureShortcut`(deps 含 sc.code,re-bind);AppMenu 加 Settings 入口。puppeteer 5/5 断言;3 张截图。

**核心承诺验证(spec §5.5 "可在设置改")**:

- /settings 默认显示 `⌘+⇧+Space` ✓
- 改成 `⌘+⇧+C` ✓
- localStorage 持久化(`captureShortcut.code === 'KeyC'`)✓
- 按新组合(Ctrl+Shift+C)打开 Mini Input ✓
- 零 page error

**关键工程决策**:

- **web-local settings store**(同 draft/canvas-view 模式):Phase 8 Tauri 读相同 shape。
- **CaptureHost 接受 meta OR ctrl**(跨平台):`sc.modKey` 只是用户偏好 label。
- **`useSettings` + keydown deps 含 sc.code**:改 code → listener re-bind,无需刷新。
- **下拉式 UI**(不是录制式):MVP 简单。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- 冲突检测(快捷键被浏览器/系统占用)→ 留后
- 录制式捕获 → 留后
- canvas 快捷键自定义 → 留后
- Tauri 端读 settings → Phase 8

详见 [`docs/superpowers/plans/2026-06-19-phase-6.5h-keymap-custom.md`](../superpowers/plans/2026-06-19-phase-6.5h-keymap-custom.md) + [`docs/design/screenshots/phase-6.5h/README.md`](../design/screenshots/phase-6.5h/README.md)。

---

## 2026-06-19 · phase 8 · tauri packaging — STUCK

**状态**:🟡 STUCK — 本机无 `rustc`/`cargo`,Phase 0 已搭好完整 `apps/desktop/src-tauri/` 骨架,实际构建 + global-shortcut plugin + 签名 + CI 需 Rust。按 roadmap §3.5 失败模式,写 stuck 决策档而非未经验证 Rust 代码。

详见 [`docs/memory/decisions/2026-06-19-phase-8-stuck.md`](../memory/decisions/2026-06-19-phase-8-stuck.md)。

---

## 2026-06-19 · phase 9 · JSON export + user docs

**交付**:`apps/web/src/lib/export-service.ts`(新):`EXPORT_FORMAT_VERSION = 1` + `ExportPayload` 类型 + `buildExportPayload()`(纯函数,读 cards/media/drafts/settings)+ `downloadExport()`(Blob + `<a download>`);`apps/web/src/app/settings/page.tsx` 加 Data section + Export JSON 按钮;`docs/user/README.md`(新):用户指南(捕获/inbox/canvas/archive/settings + 数据隐私 + 快捷键速查 + 已知限制)。puppeteer 8/8 断言;2 张截图。

**核心承诺验证(spec §1.2 信念4 "数据可迁移" + §8 Phase 9)**:

- 下载 1 个 `cys-stift-export-*.json` ✓
- `version === 1` ✓
- `cards.length === 2` ✓
- `mediaAssets` 1 key ✓
- `settings.captureShortcut.code === 'KeyC'` ✓
- `exportedAt` ISO string ✓
- 零 page error

**关键工程决策**:

- **开放格式 JSON,版本化**(`version: 1`):任何工具可读;未来迁移路径。
- **导出范围**:cards + mediaAssets(必)+ drafts + settings(可选)。
- **浏览器原生下载**(`<a download>` + Blob URL):0 新依赖。
- **纯函数 `buildExportPayload`** + `downloadExport` 分离副作用。
- **用户文档 `docs/user/README.md`**:核心流程 + 数据隐私 + 快捷键速查。
- **0 新依赖** + **domain/db 零改动**。

**已知 / 后续**:

- 反向 import → 留后
- 录屏 → 留后
- `/changelog` 路由 → 留后

详见 [`docs/superpowers/plans/2026-06-19-phase-9-export.md`](../superpowers/plans/2026-06-19-phase-9-export.md) + [`docs/design/screenshots/phase-9/README.md`](../design/screenshots/phase-9/README.md) + [`docs/user/README.md`](../user/README.md)。

---

## 2026-06-19 · phase 9.1 · JSON reverse import + capture race fix

**交付**:`apps/web/src/lib/export-service.ts` 加 `importFromJson(jsonText)` + `ImportResult` 类型(校验 version/shape,覆盖式写 4 个 localStorage key);`apps/web/src/app/settings/page.tsx` 加 Import 按钮 + `<input type=file>` + 结果提示 + 成功后 reload;`apps/web/src/features/capture/capture-sink.ts` 加 `setFallbackService`(race 安全:submit 在 sink register 前到达也走 `service.fromCapture` 不丢卡);CaptureHost 注册 fallback。puppeteer 全过(export → clear → import → 2 cards 恢复);2 张截图。

**核心承诺验证**:

- Export 1 file → clear (0 cards) → Import → 2 cards 恢复(Import test A + B)✓
- version !== 1 报错不写 ✓(校验)
- 零 page error

**关键工程决策**:

- **覆盖式合并**(MVP):建议先 Export 备份。
- **校验 version + shape**:`version !== 1` 或 cards 非数组 → 报错。
- **可选 key 跳过**:drafts/settings 缺失不报错。
- **reload 恢复**:写完 800ms reload,store 重新 hydrate。
- **capture race fix**:registry 加 fallback CardService,sink 异步 register 前 submit 不丢卡。
- **0 新依赖** + **domain/db 零改动**。

**已知 / 后续**:

- 合并策略(merge)→ 留后
- 冲突解决 → 覆盖
- 导入预览 / 撤销 → 留后

详见 [`docs/superpowers/plans/2026-06-19-phase-9.1-import.md`](../superpowers/plans/2026-06-19-phase-9.1-import.md) + [`docs/design/screenshots/phase-9.1/README.md`](../design/screenshots/phase-9.1/README.md)。

---

## 2026-06-20 · review bugfix · #1 import 不一致 + #3 sink 注册竞态

**交付**:承接 self-review([`decisions/2026-06-19-review-findings.md`](../memory/decisions/2026-06-19-review-findings.md))的建议优先级 #1 + #3。① `apps/web/src/lib/export-service.ts`(`importFromJson`)写入段重写:先序列化全部待写项 → 快照旧值 → 写入 → 任一抛错逐条回滚(序列化/写入抛错都返回 `ok:false` 且任何 key 不被半覆盖);② `apps/web/src/app/inbox/page.tsx`(manual sink)+ `apps/web/src/features/capture/capture-host.tsx`(shortcut + menubar)effect 加 `cancelled` flag,杜绝 unmount 后 dynamic import resolve 注册 phantom sink。`scripts/import-rollback-shots.cjs`(新)e2e + 截图。

**核心承诺验证**:

- #1 monkeypatch media key setItem 抛 QuotaExceeded → cards 回滚到原值 + UI 报 `Import failed: write failed: quota exceeded (simulated)` ✓
- #1 happy path 仍写 NEW 卡 ✓
- #3 三入口回归:`p6`(快捷键)/ `p6.5e`(手动)/ `p6.5g`(menubar)全过 ✓
- domain 11 / db 7 全绿;web build exit 0;零 page error

**关键工程决策**:

- **#1 瞬态内存快照 + 回滚,不用持久 `cys-stift.backup.v1`**:避免陈旧副本 footgun + YAGNI(用户已被提示先 Export)。"导入后可撤销"是独立 feature。
- **#1 序列化前置**:序列化抛错(循环引用等)时任何 key 没被碰。
- **#1 回滚容错**:回滚的 setItem/removeItem 各自 try/catch(best-effort)。
- **#3 标准 React `cancelled` 模式**:一个 flag 守 effect 内全部 import(capture-host 2 个);`setFallbackService` 同步不受影响。
- **0 新依赖** + **domain/db 零改动** + **没碰 spec**。

**已知 / 后续**(findings 剩余):

- #2 soft-delete 回收/恢复视图(产品决策 + domain `restore`/`hardDelete`)
- #4 / #5 canvas-editor 脆弱点(下次动 canvas)
- UX 洞(批量 soft-delete 二次确认 / send-to-canvas 反向 / archive tile no-op / OPFS 真实落盘)

详见 [`docs/superpowers/plans/2026-06-20-review-bugfixes.md`](../superpowers/plans/2026-06-20-review-bugfixes.md) + [`docs/memory/decisions/2026-06-20-review-bugfixes.md`](../memory/decisions/2026-06-20-review-bugfixes.md) + [`docs/design/screenshots/review-import-rollback/`](../design/screenshots/review-import-rollback/)。

---

## 2026-06-20 · phase trash · soft-delete 回收/恢复视图

**交付**:承接 review findings #2(产品决策)。① `packages/domain/src/services/card-service.ts` 加 `restore(id)`(清 `deletedAt` + bump `updatedAt`)+ `hardDelete(id)`(调 `repo.delete`,4 个 vitest);② `packages/ui/src/components/toolbar.tsx` `region` 联合加 `'trash'`(颜色自动 gray,`regionColorForStripe` default 已返 gray);③ `apps/web/src/app/trash/page.tsx`(新,14 静态路由):列 `deletedAt` 卡按 `deletedAt` desc,复用 `ArchiveCardTile` 视觉 + 每卡 Restore(清 `deletedAt`,自然回 inbox/archive/canvas) + Delete forever(`Modal` 二次确认,`hardDelete` 真删不可逆);④ `apps/web/src/components/app-menu.tsx` entries 加 Trash;⑤ `apps/web/src/app/inbox/page.tsx` 软删 Modal body 文案 `"...recover it later from the database"` → `"...restore it from Trash"`(链 `<Link href="/trash">`);⑥ `scripts/trash-shots.cjs`(新)e2e + 7 截图。Tag **v0.10.0-trash**。

**核心承诺验证**:

- inbox 软删 tr-1 → `deletedAt` 设上 + `/trash` 列 1 项 ✓
- Restore → `deletedAt === undefined` + 卡回原视图(inbox/archive/canvas 之一)✓
- 再软删 → Delete forever → Modal → 确认 → `listAll()` 不含该 id + `/trash` 空 ✓
- AppMenu `/trash` 高亮 active ✓
- inbox 软删 Modal body 含 `"restore it from Trash"` ✓
- 零 page error
- domain 15(11→15)/ db 7 全绿;web build exit 0,14 静态页;7 截图归档

**关键工程决策**:

- **新 `/trash` 路由**(非 archive 三 tab):三分离(inbox 活跃 / archive 归档 / trash 已删)更清晰;spec 没限定 UI 形态,选最简单。
- **`restore` 只清 `deletedAt`,不动 `archived` / `canvasPosition`**:卡自然回原视图,不需要 domain 知道"它原来在哪"——单一真相源是卡自身字段。
- **`hardDelete` 调 `repo.delete`(db 层已就绪)**:不引入新存储语义,`sqlite DELETE` 由 db 包保证。
- **`restore` / `hardDelete` 返回 boolean**(而非 void):让调用方知道是否真改了一张卡;其他 service 方法维持原签名(零破坏)。
- **单卡操作**(无 selectMode):MVP,先验证核心闭环;批量 restore/hardDelete 留后(archive 批量模式可复用)。
- **Delete forever 只 Modal 二次确认**,不要求打字 "delete":MVP,信任 Modal 拦截。
- **`TrashItem` 复用 `ArchiveCardTile`**:视觉已存在的"白底黑边 + 蓝条"通用卡,archive 只是恰好蓝条;不重做。
- **inbox 软删 Modal 链 `<Link href="/trash">`**:文案承诺即兑现,点链接直接跳 /trash。
- **`region: 'trash'` 自动 gray**:`regionColorForStripe` default 返 gray,无 if 分支。
- **0 新依赖** + **没碰 spec** + **ui 仅扩联合类型** + **domain 只加方法**。

**已知 / 后续**(findings 剩余):

- #4 / #5 canvas-editor 脆弱点(下次动 canvas 一起重构成 useEffect)
- 批量 restore / hardDelete(archive 批量模式可复用)
- media gc:hardDelete 只删 card 记录,关联 media assets 留孤儿,Phase 2.5 OPFS 时统一 gc
- 定期自动清空 trash(保留期)—— 未要求,YAGNI
- UX 洞(批量 soft-delete 二次确认 / send-to-canvas 反向 / archive tile no-op / OPFS 真实落盘)
- Phase 8 Tauri build(Rust 就绪)+ 签名公证(需 Apple 证书)

详见 [`docs/superpowers/plans/2026-06-20-trash-recovery.md`](../superpowers/plans/2026-06-20-trash-recovery.md) + [`docs/memory/decisions/2026-06-20-trash.md`](../memory/decisions/2026-06-20-trash.md) + [`docs/design/screenshots/phase-trash/`](../design/screenshots/phase-trash/)。

---

## 2026-06-20 · phase canvas-refactor · useEffect 驱动 canvas-editor(关闭 review #4 #5)

**交付**:承接 review findings #4 + #5(原计划:动 canvas 时一起修)。① `apps/web/src/features/canvas/canvas-editor.tsx` 重构:onMount 只剩一次性副作用(view apply + loadCardsIntoEditor + bindCardWriteback + `__canvasEditor` 句柄 + onEditorReady);新增 `<ViewPersistenceBridge>`(`useValue` 订阅 camera + isGridMode + 500ms 防抖 `useEffect` 写回 canvasViewStore,React cleanup `clearTimeout`)+ `<DoubleClickBridge>`(`useEffect` 在 editor container 上 add/remove dblclick,回调走 ref 避免 effect 重订);**全删 `editor.store.listen(callback)` 无 filter + `editor.dispose` 猴补丁**。② `apps/web/src/app/canvas/page.tsx` 把 editor 作为 prop 传给 TldrawCanvas(1 行);TldrawCanvas.tsx 无需改(已 `{...props}` 透传)。③ `scripts/canvas-refactor-shots.cjs`(新):反复切 /canvas↔/inbox ×4 + reload + 拖卡 + 双击建卡 + view 持久化回归。④ p6.5d-shots.cjs 全过(view 持久化行为不变)。Tag **v0.11.0-canvas-refactor**。

**核心承诺验证**:

- #4 反复切 /canvas 4 次后相机稳定(zoom 1 / snap)+ 0 page error ✓
- #4 reload 后 view 全保留(zoom 2 / free / pan -120,-60)✓
- #5 拖卡后 view-store 持久化**0 写入**(before === after 深相等)— useValue 替代全量 listen ✓
- #4 dblclick 双击空白处建新卡 ✓
- p6.5d view 持久化回归全过 ✓
- 零 page error;canvas chunk 体积不变(484 kB);14 静态页不变
- domain 15 / db 7 全绿;web build exit 0

**关键工程决策**:

- **view 持久化用 `useValue` 订阅,不用 `editor.store.listen(callback)`**:`useValue('cvp camera', () => editor.getCamera())` + `useValue('cvp isGridMode', () => editor.getInstanceState().isGridMode)`(复用 ZoomGroup 已用的 tldraw 响应原语)。`useValue` 只在订阅的标量变化时回调,**完全跳过 listen 的"所有 store changes"问题**(#5 根因)。
- **副作用按 lifetime 分**:onMount = tldraw 触发的一次性动作;bridge useEffects = editor 准备好后的响应式副作用。语义清晰,生命周期各归其主。
- **回调走 ref 避免 effect 重订**:`DoubleClickBridge` 内 `const cbRef = useRef(onOpenCard); cbRef.current = onOpenCard`。page 端 `onOpenCard={(card) => setDetail({card})}` 每次 render 都是新函数 — 不走 ref 会让 dblclick effect 每次 render 都 add/remove 监听,既浪费又有 setDetail 期间短暂未挂载窗口。
- **`editor` 下传 page→canvas-editor**:page 已有 `editor` state(`onEditorReady` 拿到后 setEditor),复用同一 handle 作为 prop 给 canvas-editor。无新 state、无新 ref、无新 IPC。
- **保留 `onEditorReady` callback**:page 仍需 `setEditor` 给 CardDetailModal 用 onSave/onArchive/onDelete 同步 shape,这个回调不能丢。
- **保留 `__canvasEditor` 诊断句柄**:puppeteer 用 `window.__canvasEditor` 读 live state;本次 e2e 仍用它。
- **`bindCardWriteback` / `loadCardsIntoEditor` 内部不动**:本次 scope 是副作用组装方式,不是卡片绑定逻辑。
- **0 新依赖** + **没碰 spec** + **domain/db/ui 零改动** + **canvas chunk 体积不变(484 kB)**。

**已知 / 后续**(review 已全部关闭):

- ~~#4 canvas-editor dispose 猴补丁~~ ✅
- ~~#5 listen 无 filter~~ ✅
- canvas dblclick 走 capture registry(plan 决定走 captureSinkRegistry,但当前实现是直接 `service.create`;未要求,YAGNI)
- 多画布 UI(spec §4.9 schema 已支持)
- view 持久化迁到 domain `CanvasService.updateView`(Phase 8 Tauri 时统一)
- "重置 view" 按钮(已知 UX 缺口)

详见 [`docs/superpowers/plans/2026-06-20-canvas-editor-refactor.md`](../superpowers/plans/2026-06-20-canvas-editor-refactor.md) + [`docs/memory/decisions/2026-06-20-canvas-refactor.md`](../memory/decisions/2026-06-20-canvas-refactor.md) + [`docs/design/screenshots/phase-canvas-refactor/`](../design/screenshots/phase-canvas-refactor/)。

---

## 2026-06-20 · phase archive-detail · archive tile 接 detail Modal(关闭 review §🟠 UX #4)

**交付**:承接 review §🟠 UX 洞 #4:"archive tile 点击 no-op"。① `apps/web/src/features/card/card-detail.tsx`(新,~360 行共享组件,基于 inbox 完整版,内置 soft-delete confirm modal);② `apps/web/src/app/archive/page.tsx` 接 Modal(grid + Timeline 两路 `openDetail(id)` → Modal),actions `['unarchive','softDelete']`;③ `apps/web/src/app/inbox/page.tsx` 删本地 CardDetail(~320 行)+ DetailState + page-level confirm Modal,改用共享 `CardDetailModal`(actions `['archive','unarchive','sendToCanvas','softDelete']`,共享组件按 `card.archived` 字段决定渲染哪个切换按钮);④ `scripts/archive-detail-shots.cjs`(新)+ `p6.5b`/`trash` 脚本更新 selector(`cd__*` 新 class)。Tag **v0.12.0-archive-detail**。

**核心承诺验证**:

- archive grid 点 tile → CardDetailModal view 打开(cd__meta / cd__actions / Links + Code + Quotes sections 全在)✓
- Edit 模式 3 个 editor 面板(links / code / quotes)✓
- 改 title → Save → localStorage 持久化 `Renamed archive card` ✓
- Save 后自动回 view 模式;Escape 关 Modal ✓
- Timeline 视图点行 → Modal 打开,标题显示新值 ✓
- Modal 内 Soft-delete → 内置 confirm Modal(`cd__confirm` + `cd__confirm-actions`)→ 确认 → deletedAt 设置 ✓
- /archive 空 + /trash 有 1 ✓
- 回归:`p7` ✓(archive 多选批量)/ `p6.5b` ✓(inbox 详情编辑)/ `trash` ✓(trash 视图软删恢复)全过
- domain 15 / db 7 全绿;web build exit 0,**14 静态页**
- **/inbox 体积 8.44 → 5.08 kB(-3.4 kB 共享组件提取收益)**;/archive 3.15 → 3.27 kB(共享 Modal 引入)
- 零 page error

**关键工程决策**:

- **共享组件放 `features/card/`**(与 P6.5b 抽的 `editors.tsx` 同层),不放 `inbox/`(那是 inbox 私有)
- **共享组件内置 soft-delete confirm Modal**(取代 inbox 原本 page-level confirm + inbox 的 `confirmDelete` state 全删):consumer 传 `onConfirmDelete` 即可,内聚更好;inbox page 净减 ~50 行
- **`actions` prop 控制可执行动作集合**:archive 上下文 `['unarchive','softDelete']`(归档卡不能再 archive);inbox 上下文全 4 个 + 共享组件按 `card.archived` 自路由 Archive/Unarchive 按钮
- **`sendToCanvas` 仅当卡无 `canvasPosition` 才显示**:匹配 inbox 原 P6.5c 行为;archive 不传 `onSendToCanvas`(actions 不含)所以 archive 不显示
- **`cd__*` class 命名空间**(从 inbox 原 `detail__*` / `media-list` / `link-list` / `code-block` 收敛):组件独立,被多 consumer 共用不污染 inbox page 的样式
- **canvas 的 `CardDetailModal` 不动**:Phase 4 的简化版(title + body only),已能用;触碰 tagged Phase 4 风险
- **0 新依赖** + **没碰 spec** + **domain/db 零改动** + **archive/onclick no-op 注释删除**

**已知 / 后续**:

- 批量 soft-delete 二次确认(review §🟠 UX #3 — YAGNI,误删可 trash 恢复)
- send-to-canvas 反向动作(卡上画布后无"拿回 inbox"按钮)
- archive 内筛选 / 搜索(YAGNI)
- archive tile 长按多选(touch UX,YAGNI)
- canvas `CardDetailModal` 升级到共享组件(留后,功能等价但需要回归测)
- inbox page 内的 dead styles 清理(`.link-list` / `.code-block` / `.media-list` 等现在无 JSX 引用 — 留后,YAGNI)
- Phase 8 Tauri build + 签名公证(需 Apple 证书)

详见 [`docs/superpowers/plans/2026-06-20-archive-detail.md`](../superpowers/plans/2026-06-20-archive-detail.md) + [`docs/memory/decisions/2026-06-20-archive-detail.md`](../memory/decisions/2026-06-20-archive-detail.md) + [`docs/design/screenshots/phase-archive-detail/`](../design/screenshots/phase-archive-detail/)。

---

## 2026-06-20 · phase batch-confirm · archive 批量软删二次确认(关闭 review §🟠 UX #3)

**交付**:承接 review §🟠 UX 洞 #3:"archive 批量 soft-delete 无二次确认"。`apps/web/src/app/archive/page.tsx` import 加 `Modal`,新 state `confirmBatchDelete: CardId[] \| null`(null 隐藏 / 数组显示),改 `handleSoftDeleteSelected` 改弹 Modal 不直接软删,新 `handleConfirmBatchSoftDelete` / `handleCancelBatchSoftDelete`,新增 floater 后的 `<Modal>` 块(title 显示 "Soft-delete N card(s)?",body 列出前 5 个 title + "...and N more" + "restore them from Trash" Link,actions Cancel + "Soft-delete N"),styles 字符串加 `.confirm__body` / `.confirm__link` / `.confirm__actions`(沿用 trash page 的 `confirm__*` 命名空间)。`scripts/batch-soft-delete-confirm-shots.cjs`(新):seed 3 卡 → 选 3 → 弹 Modal → Cancel 保留 → 再触发 → 确认 → /archive 空 + /trash 3。Tag **v0.13.0-batch-confirm**。

**核心承诺验证**:

- floater "Soft-delete" 一次点击不再直接软删,改弹 Modal ✓
- Modal title = "Soft-delete 3 cards?"(单复数处理)✓
- Modal body 列出 3 个 title + Link 指向 `/trash` ✓
- Cancel 关闭 Modal,3 卡仍在 archive,selected 保留 ✓
- 再次点 floater "Soft-delete" → Modal 重新打开 ✓
- 点 danger "Soft-delete 3" → /archive 空 + /trash 3 ✓
- 回归:`p7` ✓ / `p6.5b` ✓ / `trash` ✓ / `archive-detail` ✓ 全过
- domain 15 / db 7 全绿;web build exit 0,**14 静态页**
- /archive 3.27 → 3.63 kB(+360 Modal 引入)
- 零 page error

**关键工程决策**:

- **复用 trash page 的 `confirm__*` class 命名空间**(而非新建 `bcf__*` 或引入 `cd__*`):archive 与 trash 同为"删除/恢复"流程,UI 模式一致;shared CardDetailModal 用 `cd__*`(因为它有自己的多页路由/状态),archive 这里是 page-level confirm,延续 trash 的轻量命名最简。
- **复用 inbox/trash 已有的 trash 链接文案**:与单卡软删确认(`CardDetailModal.cd__confirm`)及 trash hardDelete(`trash/page.tsx.confirm__body`)文案风格一致 —— 用户对"可以从 Trash 恢复"的承诺已在 3 个确认对话框里看到,跨页面一致。
- **Cancel 保留 selected**:用户误触 Modal 后可以重新决定,不必重新 tick N 个 checkbox。`clearSelected()` 只在确认软删后才调。
- **列出前 5 个 title + "+N more"**:N=3 时显示全部;N=50 时 modal 不会被撑爆,用户知道删的是哪些 + 总数。
- **Danger 按钮 label 带数量**:`Soft-delete 3` 而不是单 `Soft-delete`,最后再给用户一次明确的"我删几卡"视觉。
- **0 新依赖** + **没碰 spec** + **domain/db/ui 零改动** + **`Modal` 复用 `@cys-stift/ui`**。

**已知 / 后续**(review UX 洞剩 #2):

- ✅ ~~批量 soft-delete 二次确认~~ (本次)
- ⬜ UX #2 send-to-canvas 反向动作(卡上画布后无"拿回 inbox"按钮)
- 批量 Unarchive 加确认(非破坏性,review 没要求,YAGNI)
- 输入卡名 "delete" 才确认的高强度确认(信任 Modal 拦截,匹配现有 confirm 风格)
- 把 batch confirm 抽到 features/card 共享组件(archive 是唯一批量场景,YAGNI)

详见 [`docs/superpowers/plans/2026-06-20-batch-soft-delete-confirm.md`](../superpowers/plans/2026-06-20-batch-soft-delete-confirm.md) + [`docs/memory/decisions/2026-06-20-batch-confirm.md`](../memory/decisions/2026-06-20-batch-confirm.md) + [`docs/design/screenshots/phase-batch-confirm/`](../design/screenshots/phase-batch-confirm/)。

---

## 2026-06-20 · phase send-back · canvas 卡反向回 inbox(关闭 review §🟠 UX #2)

**交付**:承接 review §🟠 UX 洞 #2(最后剩余 UX 洞):"卡上画布后无'拿回 inbox'反向动作"。① `packages/domain/src/services/card-service.ts` 加 `removeFromCanvas(id)`(清 `canvasPosition`,spec §6.11 的 `listInbox` 自然显示)+ 2 vitest(17 passed);② `apps/web/src/features/canvas/card-detail-modal.tsx` 加 `onSendToInbox?` prop + "Send back to inbox" 按钮(仅当 `card.canvasPosition` 存在);③ `apps/web/src/app/canvas/page.tsx` 调 `service.removeFromCanvas` + `removeCardShape`;④ `scripts/send-back-shots.cjs`(新,7 断言 + 4 截图)。Tag **v0.14.0-send-back**。

**核心承诺验证**:

- canvas 双击已有卡 → Modal 打开,view 模式显示 "Send back to inbox" 按钮 ✓
- 点击 → Modal 关闭,shape 消失,`canvasPosition` 清空 ✓
- /inbox 显示该卡(`listInbox` 排除 canvasPosition 卡)✓
- 7/7 断言 + 0 page error
- 回归:`canvas-refactor` ✓ / `p4` / `p5` / `p6.5d` 全过
- domain 17 / db 7 / web build 14 静态页 exit 0

**关键工程决策**:

- **新方法 `removeFromCanvas` 而非复用 `update`**:卡片字段是 lifecycle 字段(archived / deletedAt / canvasPosition),不通过通用 `update` 改,与 `moveToCanvas` / `softDelete` 等对称。
- **idempotent + boolean return**:`!card.canvasPosition` 时返 false,无副作用;`hardDelete`/`restore` 也是 boolean 一致风格。
- **不动 inbox 显示逻辑**:`listInbox` 已排除 `canvasPosition` 卡(原 spec §6.11 行为),`removeFromCanvas` 自动让卡重现在 inbox,无需 inbox 端任何代码。
- **canvas 按钮 conditional render**:`card.canvasPosition && onSendToInbox` — 已是 inbox 卡的画布上不应显示此按钮(虽然 inbox 卡不会到画布,但兜底)。
- **0 新依赖** + **没碰 spec** + **ui 零改动**(只 canvas 局部组件加 prop)

详见 [`docs/memory/decisions/2026-06-20-send-back.md`](../memory/decisions/2026-06-20-send-back.md) + [`docs/design/screenshots/phase-send-back/`](../design/screenshots/phase-send-back/)。

---

## 2026-06-20 · refactor · canvas dblclick 走 capture registry

**交付**:统一所有 capture 入口。`apps/web/src/features/canvas/canvas-editor.tsx` 的 `DoubleClickBridge` 把直接 `service.create` 改为 `captureSinkRegistry.submit({source: {kind: 'manual', deviceId: 'web'}, title: '', canvasPosition})`,复用 inbox form / menubar / shortcut 同一条路径。复用 'manual' kind(不是新 kind),因为行为上等价(都是 WebCaptureSink → fromCapture → service.create),`canvasPosition` 字段足以区分画布上创建的卡与 inbox-only 手动创建。registry 找不到 manual sink 时 fallback 到 `fallbackService`(CaptureHost 在所有路由都 setFallbackService)—— 卡永不丢。

**核心承诺验证**:

- 双击画布空白 → registry submit → 调 WebCaptureSink(from inbox mount 注册)或 fallback service(直接 /canvas)→ `service.fromCapture` → 卡片创建
- 已有 `canvas-refactor-shots.cjs` 间接覆盖(7/7 PASS,创建第 2 张卡的断言通过新路径)
- 回归:`canvas-refactor` ✓ / `send-back` ✓ / `p4` / `p5` / `p6.5d` 全过
- domain 17 / db 7 / web build 14 静态页 exit 0

**关键工程决策**:

- **复用 'manual' kind**:行为等价(同一 WebCaptureSink 实现),canvasPosition 区分来源;不引入新 kind 增加 registry 复杂度。
- **fallback 兜底**:CaptureHost 永远在所有路由 setFallbackService,直接 /canvas 不经 /inbox 时也能创建卡。
- **不动 capture-sink.ts**:registry 接口已设计好 race-safe,canvas 这边只是 consumer。
- **0 新依赖** + **没碰 spec** + **domain 零改动**

详见 commit `9d7aa24`。

---

## 2026-06-20 · phase multi-canvas · 多画布 UI(关闭 spec §4.9 长期留后)

**交付**:承接 spec §4.9 多画布 UI 留后(schema 早支持,web 端缺最后一块)。① `apps/web/src/lib/canvas-store.ts`(新,~200 行):web-local 多画布 state(模式同 cards/drafts/media/canvas-view/settings),`cys-stift.canvases.v1` 存储 `CanvasesSnapshot { canvases, activeCanvasId }`,永远 seed `DEFAULT_CANVAS_ID`,setActive / create(dedup 命名)/ rename / delete(idempotent,删 default 拒绝,删 active 自动 fallback default);② `apps/web/src/app/canvas/page.tsx`:`useCanvases()` + `activeCanvasId` 取代硬编码 `DEFAULT_CANVAS_ID`,工具栏加 native `<select>` Canvas 切换器 + pencil 笔 inline rename input + `+New` / `Rename` / `Delete` ghost 按钮,删除 Modal 列出画布名 + 卡数,确认前先 `removeFromCanvas` 把所有卡回 inbox(防静默丢失),`<TldrawCanvas key={activeCanvasId}>` 切画布 remount 避免 stale editor;③ 新 `CanvasSwitcher` 子组件(select + pencil 模式);④ `scripts/multi-canvas-shots.cjs`(新,15 断言 + 6 截图)。Tag **v0.15.0-multi-canvas**。

**核心承诺验证**:

- /canvas 显示 default 画布,switcher active + 1 卡 visible ✓
- default 画布 Delete 按钮 disabled(防删 seed)✓
- +New "Project B" → 切到 Project B(active 切换),tldraw 0 shapes ✓
- 切回 default → 卡重新 visible(1 shape)✓
- Project B → rename "Project C" ✓
- Delete Project C → confirm Modal 出现(显示 0 cards)→ 确认 → 列表回 ["default canvas"] + active 回到 default-canvas ✓
- seed 卡仍 canvasPosition.canvasId = 'default-canvas'(无静默丢失)✓
- 9 个回归 e2e 全过
- domain 17 / db 7 全绿;web build exit 0,**14 静态页**
- /canvas 484 → 486 kB(+2 kB 切换器 / 2 Modals)
- 0 page error

**关键工程决策**:

- **新 web-local store,非迁 domain**:`CanvasService` 已存在(Phase 2),但其接口接收 repository(db 包,Phase 8 Tauri 才用);MVP 阶段用 `canvasStore` web-local 持久化 canvas 列表 + active 选择,与 cards/drafts/media 等 5 个 web-local store 模式一致 —— Phase 8 Tauri 时公共 API 不变,迁不迁后端看需
- **native `<select>` 而非自造 popover**:a11y 0 成本 + 工具栏 32px 高度合适,自造 dropdown 增加 50+ 行代码没收益
- **`<TldrawCanvas key={canvasId}>` remount**:`loadCardsIntoEditor` 只在 onMount 跑一次,切画布若不 remount 会有 stale shapes
- **删除前 `removeFromCanvas`**:用户删画布时,卡在那个画布上静默消失?先 move 回 inbox,user 在 inbox 看到所有"被画布吞掉"的卡
- **default 画布不能删**:它是 seed,删了 store 会再次 seed,但 UI 闪烁不友好;`if (id === DEFAULT_CANVAS_ID) return false` + Delete 按钮 disabled
- **删除 active 画布自动 fallback default**:`delete` 方法检测 wasActive 后 activeCanvasId 改 DEFAULT,无需 UI 提示"先切再删"
- **create dedup 命名**:`Project B` 已存在则自动 `Project B (2)`,避免 store 出现重复名
- **inbox "Send to canvas" 仍用 `DEFAULT_CANVAS_ID`(MVP 不动)**:扩到 activeCanvasId 需 inbox 接 canvasStore,扩大 scope;记入 plan 留后
- **view 持久化不分 canvasId(MVP 不动)**:`cys-stift.canvas-view.v1` 仍是单值,切画布 view 不隔离;spec §4.9 支持,plan 留后
- **0 新依赖** + **没碰 spec** + **domain 零改动**(`CanvasService` / `Canvas` 已存在)

**已知 / 后续**(全 review + UX 洞都已关闭,产品 0 open review):

- inbox "Send to canvas" 用 activeCanvasId(目前 hardcode DEFAULT)
- canvas view 持久化按 canvasId 拆分
- workspace 多 workspace 切换
- 拖卡跨画布(drag to canvas)
- 画布排序 / 收藏
- "switch to canvas X" URL hash 直链
- 暗色模式 / 标签搜索 / OPFS / 录屏
- Phase 8 Tauri build + 签名公证

详见 [`docs/superpowers/plans/2026-06-20-multi-canvas.md`](../superpowers/plans/2026-06-20-multi-canvas.md) + [`docs/memory/decisions/2026-06-20-multi-canvas.md`](../memory/decisions/2026-06-20-multi-canvas.md) + [`docs/design/screenshots/phase-multi-canvas/`](../design/screenshots/phase-multi-canvas/)。

---

## 2026-06-20 · phase multi-canvas-polish · view per canvas + active-canvas routing(v0.16)

**交付**:v0.15 plan 留后的两项 polish(共 commit `778245d`):
① `canvas-view-store.ts` 改为 `Record<CanvasId, CanvasView>`,API `get(id) / update(id, ...) / reset(id)`,`useCanvasView(canvasId)` 接受 canvasId 订阅,`CanvasEditor.onMount` 读 `canvasViewStore.get(canvasId)` + `ViewPersistenceBridge` deps 加 canvasId;
② `inbox/page.tsx` 接 `useCanvases().activeCanvasId`,`moveToCanvas` 用 activeCanvasId(替代 hardcode DEFAULT)。两个 e2e 脚本(`p6.5d-shots.cjs` + `canvas-refactor-shots.cjs`)更新 selector(读 / 写新 view shape)。

**核心承诺验证**:

- 切画布时 view 独立恢复:zoom/pan/gridMode per canvasId ✓
- /canvas → 切到 active, /inbox → "Send to canvas" 送到 active(不再是固定 default)✓
- p6.5d view 持久化回归 ✓ / canvas-refactor 回归 ✓ / 全部 10 e2e ✓
- domain 17 / db 7 / web build 14 静态页 exit 0

**已知 / 后续**:无 — review + UX 洞 + spec §4.9 + canvas polish 全交付,产品**无遗留可补功能**(除 Phase 8 Tauri build / 签名公证)。

详见 commit `778245d`。

---

## 2026-06-20 · phase dark-mode · 暗色模式(关闭 spec §5.6 长期留后)

**交付**:spec §5.6 "MVP 不做,预留 token 抽象,未来加" —— 现在加。
① `packages/ui/src/tokens.css` 加 `:root[data-theme='dark']` 变体(`--color-white` ↔ `--color-black` 互换,hue tokens 调亮保 AA,soft 变深 washes,borders 改灰);**用 `:root[data-theme='dark']` 而不是 `[data-theme='dark']`** 以更高特异性压过 Tailwind v4 `@theme` reset;
② `apps/web/src/lib/settings-store.ts` 加 `theme: 'light' | 'dark' | 'system'` 字段(default 'system') + `updateTheme()` + public `subscribe()`;
③ `apps/web/src/lib/theme.ts`(新):`resolveTheme(pref)` 优先级 explicit > system(`matchMedia`) > light;`applyTheme()` 写 `data-theme` on `<html>` + sync `--tl-bg` on `<body>` 让 tldraw surface 跟;
④ `apps/web/src/components/theme-boot.tsx`(新):client-only mount,`useThemeApplication` 订阅 settings 变化 + OS dark-mode flips;
⑤ `apps/web/src/app/layout.tsx` head 加 inline script 同步读 localStorage + apply theme 在 first paint,**避免 dark-mode flash**;
⑥ `apps/web/src/app/settings/page.tsx` 加 Appearance section(Theme `<select>` Light/Dark/Follow system)。
Tag **v0.17.0-dark-mode**。

**核心承诺验证**:

- 默认 `data-theme=light`,`--color-white=#fafafa`,`--color-black=#0a0a0a` ✓
- /settings 选 Dark → `data-theme=dark`,`--color-white=#0a0a0a`(背景翻黑),`--color-black=#fafafa`(文本翻白)✓
- reload → inline head script 重新 apply dark before paint(无 flash)✓
- /inbox 切到 dark 立即生效 ✓
- 切回 light 立即生效 ✓
- 切到 system → headless 无 OS dark preference,resolve 为 light ✓
- 11 断言全过 + 0 page error
- 10 个回归 e2e 全过
- domain 17 / db 7 / web build 14 静态页 exit 0
- /settings 4.47 → 4.68 kB(+Appearance section)

**关键工程决策**:

- **`:root[data-theme='dark']` 而非 `[data-theme='dark']`**:0,1,1 specificity 压过 Tailwind v4 `@theme` reset 的 `:root`(0,0,1),确保 dark variant 真生效
- **inline head script 防 flash**:read localStorage + apply data-theme 在 first paint 之前,client 启动后 ThemeBoot 接管 OS theme 变化监听
- **6 原色不变**:包豪斯红/黄/蓝/灰保留,只调亮度(浅→深→浅,dark 调更亮)保 AA 对比度;不引入第七色(守 spec §5.2)
- **theme = 'system' 默认**:尊重 OS 偏好;`matchMedia('(prefers-color-scheme: dark)')` 实时跟踪
- **tldraw bg 跟随**:theme.ts applyTheme 时同步 `--tl-bg` on `<body>`,tldraw 的 canvas surface 跟随页面主题
- **公共 `subscribe()` API**:settingsStore 暴露 subscribe 给 theme.ts,统一 hooks + imperative 消费
- **0 新依赖** + **没碰 spec** + **domain 零改动**

**已知 / 后续**:**无遗留可补功能**(除 Phase 8 Tauri build / 签名公证)。

详见 [`docs/memory/decisions/2026-06-20-dark-mode.md`](../memory/decisions/2026-06-20-dark-mode.md) + [`docs/design/screenshots/phase-dark-mode/`](../design/screenshots/phase-dark-mode/)。

---

## 2026-06-20 · v0.22.0-ui-polish

UI polish 三合一,不动数据/接口/依赖,基于 v0.15 干净基线重启(v0.18/19/20/21 决策档保留,代码未落地)。

- **fix(canvas)**: 折叠三层 UI 为两层(canvas/page.tsx 删 3 个冗余节点 + tldraw 自带 chrome `components` prop 屏蔽 + canvas `.page` 用 `var(--app-menu-height)` 避免底部裁剪) → `cc914a5`
- **fix(layout)**: 修 hydration mismatch("1 error" 红标真根因),`<html>` 加 `data-theme="light"` + `suppressHydrationWarning` → `9325cca`
- **polish(tiles)**: 卡片 CJK 断字规则 + grid 列宽 280→320 + 字重 500→600 + 行间距 < 列间距 → `a1186fa`

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- puppeteer mini-audit 6/6 页 passed, 0 console error, 0 overflow
- 6 张截图 commit 到 `docs/design/screenshots/phase-canvas-polish/`

详见 [`docs/memory/decisions/2026-06-20-ui-polish.md`](../memory/decisions/2026-06-20-ui-polish.md)。

---

## 2026-06-20 · v0.22.0-ux-polish

UX walkthrough 修复 5 个真 bug(plan 完成后 puppeteer-driven deep walkthrough 发现),集中 commit `e8a8da4`。

- **fix(canvas)**: 空状态加 "EMPTY CANVAS" + 双击提示 overlay(`onCanvas === 0` 时显示)
- **fix(trash)**: Modal 关不掉 bug(`!== undefined` → `!= null`)
- **fix(markdown)**: 移除空 body 的 "(no body)" 占位文案(直接 return null)
- **fix(card-detail-modal)**: Edit card 标签间距收紧(`.cd__field gap` 12→4px,first-child margin-top: -8px)
- **fix(inbox)**: active tab 字重 500→600
- **fix(tile)**: CJK 断字规则再修正(`word-break: keep-all` 真正解决 "中文" 被拆的问题)

**已知遗留**(out of scope,需更大改动): Soft-delete 按钮红色 variant 与 Capture 红色冲突、Archive tab 空文案不准确、Capture placeholder 红色对比度差、favicon.ico 404。

详见 [`docs/memory/decisions/2026-06-20-ui-polish.md`](../memory/decisions/2026-06-20-ui-polish.md) 后续 §v0.22.0-ux-polish。

---

## 2026-06-20 · v0.22.1-ux-polish-2

闭合 v0.22.0 deep walkthrough 留的 3 个 deferred UX bug(原 BUG 14/15 经勘察确认不成立,跳过)。

- **fix(ui)**: `Button variant="danger"` 改为 red-outline(白底 + 红字 + 2px 红边框 + red-soft hover)→ 7 处同步生效,与 Capture 红填充视觉权重区分
- **fix(inbox)**: archived tab 空文案改为"Nothing archived yet." + 完整操作引导(指明入口 + 解释归档 vs 软删除)
- **feat(web)**: SVG favicon(`apps/web/src/app/icon.svg`),Next.js App Router 自动发现 + 注入 `<link rel="icon">` → 消掉 favicon.ico 404

详见 [`docs/memory/decisions/2026-06-20-ux-polish-2.md`](../memory/decisions/2026-06-20-ux-polish-2.md)。

---

## 2026-06-20 · v0.23.0-modal-mini-input-polish

闭合 BUG 12(共享 card-detail Modal 标题与首字段间距)+ mini-input 暗色红边框视觉冲击,纯 CSS,不动 data/接口/依赖。

- **fix(card-detail)**: `.cd > :first-child { margin-top: calc(-1 * var(--space-2)) }` 加到共享 `features/card/card-detail.tsx`,与 v0.22.0 修过的 `features/canvas/card-detail-modal.tsx:221` 对齐(canvas-modal 已修,共享 detail 漏了)。消除两个 Modal 视觉分裂 → `6c94a3a`
- **polish(mini-input)**: `.mi-frame` 边框 `2px → 1px`,亮暗都更克制。暗色 `--color-red: #ff4d4d` 在 `#0a0a0a` 深底上 2px 过粗,1px 仍识别为 Capture 入口但不冲击。8px 顶部红条(capture region)+ textarea focus 红下划线均不动 → `1cf45ec`

**验收**:

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- puppeteer mini-audit 6/6 页 passed, 0 console error, 0 overflow

详见 [`docs/memory/decisions/2026-06-23-modal-mini-input-polish.md`](../memory/decisions/2026-06-23-modal-mini-input-polish.md)。

---

## 2026-06-20 · v0.23.1-i18n-hardening

Review 驱动的 i18n hardening。修了 6 处硬编码英文 + 1 个调试辅助(原本静默吞错)+ 1 个潜在 UX bug(archive select 按钮复用 viewGrid 标签)。

- **fix(archive)**: floater + 批量删除 confirm modal 全 i18n(原硬编码 "Unarchive" / "Soft-delete" / "Clear" / "selected" / "Cancel" / "(untitled)")→ `9c6e771`
- **fix(archive)**: select 按钮原本误用 `t('archive.viewGrid')` 显示 "Grid",新建 `archive.select` → `9c6e771`
- **fix(card-detail)**: "Send to canvas" 按钮 + "on canvas" Tag 硬编码 → `t('card.detail.sendToCanvas'|'onCanvas')` → `9c6e771`
- **fix(inbox)**: 卡片无标题 fallback `(untitled)` → `t('card.untitled')` → `9c6e771`
- **fix(trash)**: 软删除 confirm body `(untitled)` → `t('card.untitled')` → `9c6e771`
- **fix(settings)**: `labelFor()` 键名 "Space" / "Comma" / "Period" → `t('settings.key.*')` → `9c6e771`
- **feat(i18n)**: `t()` 缺失 key 时 dev-mode `console.warn` 一次,生产仍静默返回原 key(避免 console 污染)→ `9c6e771`

**新增 i18n keys**(15 个):`card.untitled` / `card.detail.sendToCanvas` / `card.detail.onCanvas` / `archive.select` / `archive.floater.{selected,unarchive,softDelete,clear}` / `archive.batchDeleteConfirm{TitleN,CardsHeader,AndMore,Recovery,Action}` / `settings.key.{space,comma,period}`

**验收**:

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件 / +48 -29 行 / 1 个 commit

详见 [`docs/memory/decisions/2026-06-23-i18n-hardening.md`](../memory/decisions/2026-06-23-i18n-hardening.md)。

---

## 2026-06-20 · v0.23.2-hardening

Review 驱动的 robustness 改动,4 个非 i18n 类 bug(并发 / 校验 / locale / 平台冲突)。

- **harden(media-store)**: `attach()` 有 2 个 await,期间并发调用 loadAssets 拿同一旧 map,后写覆盖前写(静默丢数据)。新增 `enqueueWrite()` promise chain 串行化所有写入,`attach()` + 新增 `removeAsync()` 都走队列 → `a988dfc`
- **harden(export-service)**: `importFromJson()` 只校验顶层 shape,per-card 结构无校验(无 id / 非字符串 title 直接入库污染 DB)。新增逐卡字段检查:id 必填 + 非空、title/body 必为字符串、createdAt/updatedAt 为 ISO 字符串或 undefined → `a988dfc`
- **fix(mini-input)**: Enter 展开 body 用 `document.activeElement.placeholder === t('capture.miniTitle')` 检测 title 焦点,locale 切换后 placeholder 字符串变,匹配失败 → 改用 `e.target.tagName === 'INPUT'`(DOM 属性与 locale 无关)→ `a988dfc`
- **fix(search-shortcut)**: 全局快捷键 ⌘K / Ctrl+K 在 Windows Edge 触发浏览器搜索栏 → 改成 ⌘/ / Ctrl+/(Linear/Notion/GitHub 约定,所有主流浏览器未占用)→ `a988dfc`

**验收**:

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 4 个文件 / +123 -15 行 / 1 个 commit

详见 [`docs/memory/decisions/2026-06-23-hardening.md`](../memory/decisions/2026-06-23-hardening.md)。

---

## 2026-06-20 · v0.23.3-critical-and-latent

Review 驱动第二轮。3 个并行 Explore agent 全代码 + UX walkthrough + 未完成功能 audit。5 个 Critical(数据/safety/重复创建)+ 5 个 Latent(队列/快捷键/a11y/警告刷屏)。**全 10 项现场独立核对,0 误报**。

### Critical(数据丢失 / safety / 重复创建)

- **fix(search)**: `onSave` 只更新本地 state,关闭 Modal 后修改丢失。改调 `service.update()` 与 archive/inbox 一致 → `2638687`
- **fix(trash)**: "永久删除"原仅 Cancel/Confirm 一次性删(文件头注释说"type delete to confirm"是 stale)。加必填 `type delete` 输入框,红按钮在 match 前禁用。新增 2 个 i18n key → `2638687`
- **fix(canvas)**: 空白处快速 dblclick 重复创建卡 — `captureSinkRegistry.submit()` 微任务 resolve,第二击进入时第一张 shape 还没入库。加 `creating` latch 在 `.finally()` 清 → `2638687`
- **fix(mini-input)**: rapid ⌘↩(或双击按钮)可能重复提交 — `submit()` 重新进入。加 `submitting` latch + Save 按钮 disabled → `2638687`
- **fix(card-detail)**: view 模式 Modal 标题 `card.title \|\| '(untitled)'` 硬编码英文(zh 用户看英文 fallback)。改用 `t('card.untitled')` → `2638687`

### Latent(队列 / 快捷键 / a11y / 警告刷屏)

- **harden(media-store)**: `remove()` 同步版 bypass v0.23.2 enqueueWrite 队列,与并发 attach race。内部改走队列,API 保持 `void` → `3d9bb6c`
- **harden(search-shortcut)**: ⌘/ 在 input/textarea/contentEditable 内也触发,抢焦点跳走。加 e.target tag 检测排除 → `3d9bb6c`
- **a11y(archive-card-tile)**: /trash 的 tile 是空 button,Tab+Enter 无反应。ArchiveCardTile 加 `disabled` prop,disabled 时渲染非交互容器(`aria-disabled` + `role=img`)。顺手修了同文件 3 处硬编码 `(untitled)` → `3d9bb6c`
- **harden(i18n)**: `t()` 缺 key 的 dev warn 每次 render 都打,1 个 typo 刷屏。用模块级 Set 按 `locale:key` 去重 → `3d9bb6c`
- **harden(media-store)**: quota 警告每次 attach 都打,重拖同一文件刷屏。用 Set 按 `name:size:mtime` 去重 → `3d9bb6c`

**新增 i18n keys**(2 个):`trash.deleteForeverConfirm` / `trash.deleteForeverTypePlaceholder`

**验收**:

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 10 个文件 / +172 -46 行 / 2 个 commit

详见 [`docs/memory/decisions/2026-06-23-critical-and-latent.md`](../memory/decisions/2026-06-23-critical-and-latent.md)。

---

## 2026-06-20 · v0.24.0-card-pinning

Phase A(快速完善)。给 `Card.pinned`(domain Phase 2 就有但无 UI)接上完整交互。

- **feat(inbox)**: CardTile 重构为 `div > pin-btn > main-btn`(button 不能嵌套 button)。★ 按钮 toggle pinned,pinned 卡左边条 + 边框转 `--color-yellow`。列表用稳定分区(filter 而非 sort)pinned 前置 → `5117cce`
- **feat(archive)**: ArchiveCardTile 加可选 `onTogglePin` prop(传了才渲染 ★,/trash disabled / /search 不传 → 无按钮)。/archive 列表 pinned 前置 → `5117cce`
- **feat(card-detail)**: `CardDetailAction` 加 `'pin'` + `onTogglePin` prop → view toolbar Pin/Unpin toggle 按钮。inbox/archive/search 三个 caller 接上 → `5117cce`
- **i18n**: `card.detail.pin`(固定)/ `card.detail.unpin`(取消固定)→ `5117cce`

**关键决策**:
- toggle 走 `service.update(id, { pinned })`,**不加新 domain 方法**(YAGNI,domain 已支持)
- 排序用 `filter` 分区而非 `sort()` — sort 跨引擎不稳定,分区保序
- canvas 卡片**不加** pin — canvas 用位置/z 表达重要性,canvas modal 是独立 Phase 4 组件保持 MVP
- domain **零改动**(pinned 字段 + UpdateCardPatch + update() 第 121 行 Phase 2 就绪)

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件 / +235 -31 行 / 1 个 commit
- pinned 状态持久(reload 后仍在),i18n 中英切换正确

详见 [`docs/memory/decisions/2026-06-23-card-pinning.md`](../memory/decisions/2026-06-23-card-pinning.md)。

---

## 2026-06-20 · v0.24.1-modal-focus-trap

Phase B(a11y)。ui 包 Modal 加 focus trap,所有 Modal(card-detail / archive batch / trash hard-delete / canvas CRUD)受益。

- **a11y(ui)**: Modal 打开时 focus 进入 frame(首个 focusable,否则 frame 本身 tabIndex=-1);Tab/Shift+Tab 在 frame 内循环;关闭时 focus 回到触发元素。每个 trap 只在自己 frame 持有焦点时干预 → modal 栈(card-detail → confirm-delete)只有顶层 trap 接管按键。Escape 仍由 caller 处理(不变)→ `5580b15`
- **fix(design)**: Modal 现在是 `'use client'`(ui 包第一个用 hooks 的组件),/design 是 server showcase 页(export metadata),不能传函数 onClose 给 client Modal。ModalExample 的 `open={false}` 真 Modal 改为纯 CSS 视觉 mockup(真组件在 /inbox 等验证)→ `5580b15`

**关键决策**:
- Modal `'use client'` — focus trap 必须,ui 包首个 client 组件
- 每个 trap 自检 `frame.contains(activeElement)` → 多层 modal 不抢键
- frame `tabIndex=-1` 作 focus fallback(无 focusable 子元素时);`:focus { outline: none }` 因视觉指示由内部控件承担
- design 页保持 server(保留 metadata export),不抽 client 子文件(YAGNI,真 Modal 在产品页验证)

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 3 个文件 / +90 -9 行 / 1 个 commit

详见 [`docs/memory/decisions/2026-06-23-modal-focus-trap.md`](../memory/decisions/2026-06-23-modal-focus-trap.md)。

---

## 2026-06-21 · v0.25.0-tauri-global-shortcut

Phase C(战略级)。桌面端全局快捷键:app 后台/失焦时 ⌘⇧Space(mac)/ Ctrl+Shift+Space(win)也能唤起 capture。**桌面端相对 web 的核心差异落地**。

- **feat(src-tauri)**: `tauri-plugin-global-shortcut v2.3.2` 注册 `CmdOrCtrl+Shift+Space`,handler show+focus 主窗口 + emit `global-capture-open` event。plugin load/register 失败 eprintln 不 panic → `c83eedf`
- **feat(config)**: `tauri.conf.json` `app.withGlobalTauri=true` 注入 `window.__TAURI__`;capabilities `+global-shortcut:default` → `c83eedf`
- **feat(capture-host)**: 新 useEffect 监听 `window.__TAURI__.event.listen('global-capture-open')` → 打开 Mini Input(source 'shortcut')。浏览器环境(`__TAURI__` undefined)自动 no-op → `c83eedf`

**关键决策**:
- 用 `withGlobalTauri` 而非装 `@tauri-apps/api` → web 包零新依赖,浏览器仍可跑
- 硬编码 `CmdOrCtrl+Shift+Space`(Tauri 自动 mac=Cmd/win=Ctrl,与 web 默认一致);动态配置(前端 settings → Rust 重注册)defer
- handler show+focus+emit 三步;plugin/register 容错(eprintln,不 fatal)

**验收**:
- cargo check exit 0 + pnpm web build exit 0 + **cargo tauri build exit 0**(release 13.89s,产 .app + .dmg)
- ⚠️ **全局唤起效果未经 GUI 实测**(无 GUI 环境),交付代码 + .app,用户手动测:最小化/切后台后按 ⌘⇧Space 应唤起窗口 + Mini Input
- 7 个文件 / +262 -9 行 / 1 个 commit

详见 [`docs/memory/decisions/2026-06-21-tauri-global-shortcut.md`](../memory/decisions/2026-06-21-tauri-global-shortcut.md)。

---

## 2026-06-21 · v0.25.1-review-bugfixes

Review 驱动。3 个并行 Explore agent 复核 v0.24-v0.25,6 项全修(4 真 bug + 2 一致性 gap)。

### 🔴 真 bug

- **fix(capture-host)**: Tauri listener 泄漏 race — `listen()` 返回 Promise,unmount 早于 resolve 时 cleanup no-op → listener 永久泄漏。加 cancelled flag,.then 内检查已取消则立即 unregister → `78b1bba`
- **fix(archive-card-tile)**: `/trash` 软删除的 pinned 卡仍显示黄边(pin 按钮被 disabled 隐藏但 `tile--pinned` class 仍加)。cls 里 `disabled` 时不加 `tile--pinned` → `78b1bba`
- **fix(card-detail)**: inbox detail 的 Pin 按钮在 send-to-canvas 后仍在(可 pin canvas 卡,违反决策)。`showPin` 加 `&& !card.canvasPosition` → `78b1bba`
- **fix(css)**: `.tile--pinned`/`.tile--selected` 改 `border-width:2px` 导致 grid reflow;且 selected+pinned 同 specificity 冲突。改用 `outline:2px`(offset -1px)叠加在默认 1px hairline 上 → 无布局抖动,pinned(后声明)胜。inbox + archive-card-tile 同步 → `78b1bba`

### 🟠 一致性 gap

- **fix(search)**: 结果加 pinned 前置 partition(与 inbox/archive 一致)→ `78b1bba`
- **fix(timeline)**: `/archive` Timeline 视图传 `onTogglePin`(行显示星)+ 每日组内 pinned 前置 → `78b1bba`

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件 / +51 -10 行 / 1 个 commit

**defer 的 latent**(不修):pinFirst 未 memo(卡片量小 perf 可忽略)/ register 失败无 in-app 反馈 / emit 广播多 webview(单窗口无影响)/ auto-repeat 重复 emit(setOpen 幂等)/ window label 隐式 "main"(默认值稳定)

详见 [`docs/memory/decisions/2026-06-21-review-bugfixes.md`](../memory/decisions/2026-06-21-review-bugfixes.md)。

---

## 2026-06-21 · v0.26.4-canvas-bugfixes

深度复审([`docs/reviews/2026-06-21-canvas-deep-review.md`](../reviews/2026-06-21-canvas-deep-review.md))找到 9 个问题,本档关闭其中 4 个 critical/high(B1/B3/B4/B5)。B2 由 B3 隐式覆盖。

- **B1**: `db-client.ts` 加 `storage` event listener + 跨 tab re-hydrate,两 tab 编辑不再互相静默覆盖 → `cf2eba0`
- **B3**: `loadCardsIntoEditor` 检测 DB 与 shape 位置不一致时 `updateShape` reconcile,DB 是权威 → `cf2eba0`
- **B4**: `canvasStore.delete` 调 `canvasSnapshotStore.remove`,删画布释放 localStorage 配额 → `cf2eba0`
- **B5**: `bindCardWriteback` flush guard: 卡被删/归档/移走时跳过写回,防 300ms 窗口覆盖 → `cf2eba0`
- **e2e**: 17/17 通过(新增 5 断言覆盖 4 bug)

详见 [`docs/memory/decisions/2026-06-21-canvas-bugfixes.md`](../memory/decisions/2026-06-21-canvas-bugfixes.md)。

---

## 2026-06-21 · v0.26.0-high-freedom-canvas-f1

高自由画布 Phase **F1(地基)**。参考苹果无边记(Freeform),以"整理笔记"为核心,画布从"只摆灵感卡"向"自由多元素笔记整理"演进。F1 = 持久化地基 + card 内容单一数据源 + body preview。**F2(包豪斯工具栏)下一档**。

- **F1.1** `CardServiceContext` + Provider — 让 card shape component 能查 CardService → `b9d0e57`
- **F1.2** card-shape-util component 渲染查 CardService — **body preview(3 行)** + pinned 黄星 + 类型标签 + inbox→画布实时同步 + 占位(card 删时)→ `af4fe61`
- **F1.3** card props 瘦化 `{w,h}`(去 title/kind)+ binding 同步 — 单一数据源,无 stale → `b58d460`
- **F1.4** `lib/canvas-snapshot-store.ts` — per-canvas snapshot(localStorage)+ quota 容错 → `ab7f4c2`
- **F1.5** onMount `loadSnapshot` 恢复全画布(document only,camera 仍 canvasViewStore)+ `loadCardsIntoEditor` 幂等补漏 + 自由元素 `store.listen` 防抖写回 → `78777bc`

**关键决策**:
- **card 内容单一数据源**:shape 只存几何 + cardId 引用(在 shape.id),内容渲染查 CardService → inbox/archive 编辑实时反映画布,body preview 自然实现,无 sync 冲突
- **持久化**:per-canvas snapshot(`getSnapshot`/`loadSnapshot`,localStorage),document only。不用 tldraw 原生 IndexedDB(避免卡脱离 CardService 体系)
- **reset 重灾区谨慎**:F1 拆 5 步,每步独立 commit + build 验证

**验收**:domain 26/26 + db 7/7 + web build exit 0。GUI 可见改进:card body preview + pinned 星 + inbox→画布实时同步。自由元素(便签/文本/形状/箭头/手绘)持久化**已就位但待 F2 工具栏才能创建测试**(F1 阶段 hideUi 未放工具)。

详见 [`docs/memory/decisions/2026-06-21-high-freedom-canvas-f1.md`](../memory/decisions/2026-06-21-high-freedom-canvas-f1.md)。

---

## 2026-06-21 · v0.26.1-high-freedom-canvas-f2

高自由画布 Phase **F2(工具栏)**。F1 地基上,放开 tldraw 笔记工具,画布真正可"自由整理"。

- **feat(canvas)**: `CanvasToolbar` 组件 — 底部浮动包豪斯工具栏,8 工具(select/draw/rectangle/ellipse/arrow/note/text/eraser),`editor.setCurrentTool` 切换,`useValue('canvas tool', ...)` 响应高亮,键盘快捷键 v/d/r/o/a/n/t/e → `6ad68cb`
- **i18n**: `canvas.tools` + `canvas.tool.*`(9 key,zh/en)→ `6ad68cb`

**关键决策**:
- **保留 hideUi**:tldraw 默认彩色 chrome 与包豪斯冲突;自定义极简工具栏(mono 字符 + hairline + 硬阴影 + active 红)
- **card 仍 dblclick**:card 是结构化数据(CardService),与自由 shape 不同源,保留独立入口(DoubleClickBridge)
- **工具集**:select/draw/rectangle/ellipse/arrow/note/text/eraser — 无边记核心(手绘 + 形状 + 箭头 + 便签 + 文本),包豪斯约束(无彩色便利贴)
- **快捷键不冲突**:避开现有 + - 0 1 g;输入框内不触发

**验收**:domain 26/26 + db 7/7 + web build exit 0。GUI:工具栏切换工具,画布加便签/文本/形状/箭头/手绘,与灵感卡共存,刷新持久(F1 snapshot)。**需 GUI 实测**(无 headless canvas 测试)。

详见 [`docs/memory/decisions/2026-06-21-high-freedom-canvas-f2.md`](../memory/decisions/2026-06-21-high-freedom-canvas-f2.md)。

---
