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
