---
date: 2026-06-23
status: accepted
decides: 画布引擎抽成独立 package(canvas-engine),解耦框架 / token / DOM
audience: [claude, human]
---

# ADR:画布引擎独立化 — 抽 packages/canvas-engine

## 状态

Accepted(2026-06-23)。

## 背景

路线 A 已用自研 Canvas 2D 渲染器替代 tldraw(见 `2026-06-23-remove-tldraw.md`)。引擎在
`apps/web/src/features/canvas/host/`(12 文件 / 1633 行),**零业务依赖**(`CanvasElement` 是
通用模型不含 Card,`getCardInfo` 是注入回调,引擎不知道 cys-stift 的卡片概念)。

但引擎仍「寄生」在 cys-stift —— 3 个耦合点让它无法独立复用:

1. **`'use client'`**:12 文件都带 Next.js 框架标记。
2. **`readToken` 焊死**:`self-built-render.ts` 直接 `getComputedStyle` 读 cys-stift 的
   `--color-*` CSS 变量 → 引擎既耦合 DOM,又「认识」cys-stift 的 Bauhaus 调色板。
3. **物理寄生**:`host/` 是 `apps/web` 的子文件夹,不是独立 package,外部无法引用。

## 决策

抽 `packages/canvas-engine`,解耦这 3 点:

- **去 `'use client'`**(框架无关,不绑 Next.js)。
- **`readToken` 注入化**:引擎接受 `tokenResolver`(`(name, fallback) => string`),由消费者
  注入。cys-stift 注入自己的 `getComputedStyle` 版;引擎自身不假设 DOM 存在、不认识任何 token 名。
- **`host/` → `packages/canvas-engine`**:独立 package + tsconfig + 独立测试套(现有契约/纯函数
  测试随之迁移)。
- **独立 demo**:脱离 cys-stift 能跑,作为「引擎可复用」的活证据。
- **独立 README / API 文档**。

## 不变(关键)

引擎核心逻辑 —— 渲染 / 交互 / 几何(`dashPattern`/`arrowheadPoints`/命中测试)/ undo 栈 /
selection / resize / 多选 —— **90%+ 一字不改**。这是**解耦 + 重新打包,非重写**。

## 动机

1. **自成一系**:引擎是核心资产,解耦后能独立成项目 / 开源。差异化卖点 vs tldraw / excalidraw:
   语义关系签名(线型 + 箭头形 + 颜色)+ 透明 `CanvasElement` 统一模型(live/SVG/PNG/.cystift/DSL
   全是它的视图)。
2. **自洽证明**:现在「零业务依赖」但离开 cys-stift 仍散架(没 Next.js 上下文、没 cys-stift
   CSS 变量);解耦后才是真正拥有的资产。
3. **可复用**:别的项目能 `npm install` 用它。

## 实施顺序(分步,每步独立 commit + 全绿)

1. **`readToken` 注入化**(原位改,cys-stift 消费侧注入 resolver)→ 验证 526 测试绿。
2. **去 `'use client'`**(12 文件机械)→ build 验证。
3. **抽 `packages/canvas-engine`**(挪文件 + 建 package + apps/web 改 import)→ 全绿。
4. **独立 demo + README**。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 结构改动引入回归 | 526 测试兜底;分步每步独立验证 |
| `readToken` 注入改 render 签名面广 | 主模型谨慎改;render 测试用 mock tokenResolver |
| 抽包 monorepo 配置踩坑 | 主模型做结构,参照 domain/ui/db 包配置 |

## 约束符合

- 不破坏 `packages/domain` 零依赖(canvas-engine 在 web 侧,独立于 domain)。
- Bauhaus token 不变(cys-stift 注入自己的 token 体系,引擎不新增色)。
- 静态导出无 server 不变。
- 引擎 API 稳定(契约测试守护)。
