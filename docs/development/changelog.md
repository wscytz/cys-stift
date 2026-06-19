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
