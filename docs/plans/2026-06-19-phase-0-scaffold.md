# Phase 0 实现计划 —— 脚手架

| 字段 | 值 |
|---|---|
| 计划 | Phase 0：脚手架 |
| 创建 | 2026-06-19 |
| 依据 spec | `docs/specs/2026-06-19-cys-stift-design.md`（§3.1 / §6 / §8 / §11） |
| 受众 | 人类 + 任意 LLM（实现者可能是 Claude / GPT，macOS 或 Windows） |

---

## 0. 目标与范围

**一句话**：搭出可跑的 monorepo 空壳——Next.js（静态导出）+ Tauri 桌面壳 + 完整文档与工程化配置 + 首屏包豪斯占位页。**不写任何业务逻辑、不碰 DB / tldraw / domain。**

### ✅ 本阶段做
- pnpm monorepo 骨架（apps/web、apps/desktop、packages/{ui,db,domain,config}）
- 全套工程化配置（.nvmrc / .gitattributes / .editorconfig / .gitignore / .prettierrc / tsconfig.base）
- `apps/web`：Next.js 15 + React 19 + TS strict + Tailwind v4 + **静态导出** + 包豪斯 token 占位 + "hello cys-stift" 占位页
- `apps/desktop`：Tauri v2 壳，`pnpm tauri dev` 能弹出窗口显示 web 页
- `packages/*`：占位包（package.json + tsconfig，导出空 barrel），结构就位、内容留 Phase 1+
- `docs/`：README 导航 + architecture/overview + adr/0001–0006 + memory/{README,MEMORY} + design/tokens + development/{setup,changelog}
- `git init` + 首次 commit + tag `v0.1.0-phase-0`

### ❌ 本阶段不做（留给后续 phase）
- domain 模型、Drizzle schema、迁移（Phase 2）
- tldraw 集成（Phase 4）
- 任何 Card / Inbox / Canvas / Capture 逻辑
- WASM SQLite 接入（Phase 2）
- 组件库实现（Phase 1）
- 全局快捷键 / 菜单栏（Phase 6）

---

## 1. 前置条件

| 工具 | 版本 | 说明 |
|---|---|---|
| Node | 22 LTS | `.nvmrc` 锁定；Windows 用 nvm-windows |
| pnpm | 9+ | `corepack enable` 或独立安装 |
| Rust | stable | Tauri 编译需要；`rustup` 安装 |
| macOS | — | Xcode Command Line Tools（`xcode-select --install`） |
| Windows | — | "Desktop development with C++" 工作负载 + WebView2（Win11 自带） |

> 跨平台铁律（§11）：路径用 `path.join`、`.gitattributes` 强制 LF、目录全小写连字符、不写死 `~/`。

---

## 2. 任务清单（顺序执行，每条带验证）

### T1 · monorepo 骨架与工作区
- 建 `~/projects/cys-stift/` 下目录树：`apps/{web,desktop}`、`packages/{ui,db,domain,config}`、`docs/{architecture,adr,memory,design,development,superpowers/{specs,plans}}`。
- 根 `package.json`（private，定义 `dev`/`build`/`lint` 顶层脚本走 `pnpm -r`）。
- `pnpm-workspace.yaml`：`packages: ['apps/*', 'packages/*']`。
- **验证**：`pnpm install` 无报错；`pnpm -r ls` 列出所有（占位）工作区包。

### T2 · 根工程化配置
- `.nvmrc` → `22`
- `.gitattributes` → `* text=auto eol=lf`（+ 二进制类型 `binary`，如 `*.png binary`）
- `.editorconfig`（2 空格 / lf / utf-8 / 去尾空格）
- `.gitignore`（node_modules / .next / out / dist / .turbo / .DS_Store / tauri target / *.local / .env*）
- `.prettierrc`（无分号、单引号、2 空格、`printWidth: 100`）
- `tsconfig.base.json`（strict、`target: ES2022`、`moduleResolution: bundler`、路径映射 `@cys-stift/*`）
- **验证**：`pnpm exec prettier --check .` 通过（在有空文件时）；`tsc -b` 不报（占位包无源码时跳过）。

### T3 · packages/* 占位包
- 每个 `packages/<name>`：`package.json`（name `@cys-stift/<name>`，`"type": "module"`，`exports` 指向 `src/index.ts`）+ `tsconfig.json` 继承 base + `src/index.ts`（空 `export {}` 占位）。
- **验证**：`pnpm -r build` 对占位包通过（或无源码时无错）。

### T4 · apps/web（Next.js 静态导出 + 包豪斯占位页）
- Next.js 15 App Router + React 19 + TypeScript strict + Tailwind v4。
- `next.config.ts`：**`output: 'export'`**（关键，见 spec §3.4 / §6.12）、`images: { unoptimized: true }`（静态导出不能优化图片）。
- `app/layout.tsx` + `app/page.tsx`：包豪斯风格的 "hello cys-stift" 占位页——黑底白字 / 一抹红 / Space Grotesk 标题 / 8px 网格留白（展示 token 生效）。
- `styles/tokens.css`：把 spec §5.1 的 6 个原色 token 注入为 CSS variables（`--color-red` 等）。
- 字体：用 `next/font/google` 加载 Space Grotesk + Inter（注意静态导出下字体的处理）。
- **验证**：`pnpm --filter web dev` → localhost:3000 显示包豪斯占位页；`pnpm --filter web build` → 生成 `apps/web/out/` 静态产物，无报错。

### T5 · apps/desktop（Tauri v2 壳）
- `apps/desktop/` 下 `pnpm create tauri-app` 风格的 `src-tauri/`（或手写）。
- `tauri.conf.json`：
  - `build.devUrl` = `http://localhost:3000`，`beforeDevCommand` = `pnpm --filter web dev`
  - `build.frontendDist` = `../web/out`，`beforeBuildCommand` = `pnpm --filter web build`
  - `productName` = `cy's Stift`，`identifier` = `com.cys-stift.desktop`
- 不装额外插件（global-shortcut / fs 留 Phase 6 / 2）。
- **验证**：`pnpm --filter desktop tauri dev`（或根脚本 `pnpm tauri dev`）弹出 Tauri 窗口，显示与 web 一致的占位页。

### T6 · docs 脚手架
- `docs/README.md`：文档导航（指向各子目录）。
- `docs/architecture/overview.md`：从 spec §3 抽取的架构总览（分层 + 仓库结构）。
- `docs/adr/`：0001-monorepo / 0002-feature-sliced / 0003-local-first-wasm-sqlite / 0004-bauhaus-tokens / 0005-tldraw-canvas / 0006-tauri-shell（每个：背景 / 决策 / 后果，各 5–10 行）。
- `docs/memory/README.md`（记忆系统使用说明）+ `docs/decisions/INDEX.md`（索引，先放一条指向 spec 定稿的条目）。
- `docs/design/tokens.md`：包豪斯 token 说明（从 spec §5 抽取）。
- `docs/development/setup.md`：mac/win 开发环境搭建步骤（含前置条件）。
- `docs/changelog.md`：首条 "Phase 0 scaffold"。
- **验证**：目录与文件齐全；MEMORY.md 索引格式正确。

### T7 · git 初始化与首次提交
- `git init`（默认分支 `main`）。
- `git add -A && git commit -m "chore: phase 0 scaffold"`。
- `git tag v0.1.0-phase-0`。
- 同步写入 `docs/decisions/2026-06-19-phase-0.md`（阶段记录）。
- **验证**：`git log --oneline` 见 1 个 commit；`git tag` 见 `v0.1.0-phase-0`；spec 文档在此 commit 内。

---

## 3. 验收清单（Definition of Done）

全部为真才算 Phase 0 完成：

- [ ] `pnpm install` 在当前平台无错
- [ ] `pnpm --filter web dev` 起服务，浏览器显示包豪斯占位页（红 + 黑 + Space Grotesk）
- [ ] `pnpm --filter web build` 产出 `apps/web/out/`，无错
- [ ] `pnpm tauri dev` 弹窗显示同一占位页
- [ ] 目录结构与 spec §3.1 一致
- [ ] `.gitattributes` / `.editorconfig` / `.nvmrc` / `.gitignore` 就位
- [ ] `docs/` 六个子目录 + 关键文件齐全
- [ ] `git` 已 init，1 个 commit，tag `v0.1.0-phase-0`
- [ ] 记录一次跨平台备注：**Windows 侧的 `pnpm install` + `pnpm --filter web build` 待你切到 Windows 验证**（mac 端先过）

---

## 4. 产出与汇报

完成后主动给出：
1. **可跑命令** + 实际输出片段
2. **目录树**（`tree -L 3` 或 `find`）
3. **占位页截图**（mac `screencapture`）
4. 下一步预告：Phase 1（设计系统）的计划

---

## 5. 风险与注意

| 点 | 处理 |
|---|---|
| 静态导出下 `next/font` | 用 `next/font/google`，构建期内联；若报错则改 CDN 自托管 |
| Tauri 首次编译慢 | 正常（下载 + 编译 Rust 依赖）；耐心等，记录耗时 |
| Windows 未能当场验证 | 明确标注"待 Windows 复验"，不假装通过 |
| Tailwind v4 CSS-first 配置 | 与 v3 写法不同，按 v4 文档（`@import "tailwindcss"` + `@theme`） |

---

## 6. 下一步（本计划之后）

Phase 0 完成、你验收后 → 写 **Phase 1（设计系统：Bauhaus tokens + 组件库）** 的计划，再实施。
