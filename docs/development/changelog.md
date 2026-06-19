# 变更日志

> 每完成一个 Phase 追加一段。格式：`## YYYY-MM-DD · phase N · <slug>`。

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
