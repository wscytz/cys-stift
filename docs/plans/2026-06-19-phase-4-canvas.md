# Phase 4 实现计划 · Canvas 基础（tldraw 集成）

> 🟡 **待执行**（主模型手动执行 + 自审，见根 `CLAUDE.md` "Ralph 状态"）。
> 这是 Ralph 停用后主模型手动执行的第二个 phase（Phase 3 是第一个）。

| 字段 | 值 |
|---|---|
| 计划 | Phase 4：Canvas 基础 — tldraw 集成 + Card ShapeUtil |
| 创建 | 2026-06-19 |
| 依据 spec | §6.3（画布 / tldraw Custom Shape API）/ §6.11（tldraw 持久化策略，DB 为真相源）/ §6.12（路由与静态导出）/ §4.3（Canvas）/ §4.7（`cards.canvasPosition` 列 + 索引）/ §4.8（`CaptureInput.canvasPosition`）/ §5.4（Canvas 视觉骨架）/ §1.4（双击空白建卡 / MVP 单画布）/ §12（tldraw 风险与回退预案） |
| ADR | ADR-0005（tldraw as canvas renderer，已 designed） |
| 上游交付 | Phase 3（`/inbox` + `CardService.update/moveToCanvas/listOnCanvas` 就绪） |
| 下游交付 | Phase 5（Canvas 完整：网格 / 自由模式、缩放、对齐）前必须有可渲染、可拖拽、位置持久化的画布 |
| 受众 | human + 任意 LLM（claude / gpt / gemini） |

---

## 0. 目标

把卡片带上画布：**`/canvas` 静态路由 + tldraw v3 + Card 自定义 `ShapeUtil`**，DB 为唯一真相源（spec §6.11）。

**核心承诺**：一个真实用户打开 `/canvas`，双击空白建一张卡 → 拖到某处 → **刷新页面 → 卡片还在那个位置**。这是 §6.11 的硬验收。

---

## 1. 范围

### ✅ 本阶段做

- **`/canvas` production 路由**（`apps/web/src/app/canvas/page.tsx`，`'use client'`，`<Toolbar region="canvas">` 黑条，spec §5.4）
- **tldraw v3.15.x 客户端懒载挂载**（挂载守卫 + 动态 `import()`，静态导出安全，见 spike 验证）
- **Card 自定义 `ShapeUtil`**（白底 + 单线黑边 + 8px 圆角 + Space Grotesk 标题，对齐 spec §5.3 / Phase 1 的 Card 视觉）
- **§6.11 数据流**：
  - 加载：mount 时 `service.listOnCanvas(defaultCanvasId)` → 转成 tldraw shapes → `editor.createShape`
  - 回写：`editor.store.listen({ source: 'user', scope: 'document' })` → 防抖 ~300ms → `service.moveToCanvas(id, {x,y,w,h,z})`
- **双击空白建卡**（spec §1.4）：在点击点建空卡（带 `canvasPosition`）+ 打开 Phase 3 详情/编辑 Modal
- **点 card → 复用 Phase 3 详情 Modal**（不重造）
- **单一默认画布**（spec §1.4）：稳定默认 `canvasId` 常量（不接 CanvasService/Workspace，YAGNI；多画布 UI 留后）
- **`/dev/tldraw` 烟测页保留**（tldraw 挂载回归 canary，spike 产物，符合 `/dev/*` 约定）

### ❌ 本阶段不做（明确留后）

- **网格 snap vs free 切换、缩放控件 UI、对齐辅助线** → **Phase 5**（spec §8 明确划线）
- **inbox → canvas 的 send 动作、画布视图持久化**（`canvases.viewJson` 的 zoom/pan）→ Phase 5+
- **tldraw chrome 完整换肤** → 本阶段仅做背景 8px 点阵 + 隐藏冗余菜单；完整换肤留后
- **多画布 UI** → post-MVP（schema 已支持）
- **图片上传 / MediaAsset 落盘** → Phase 3.5+
- **`/canvas?id=xxx` 深链** → spec §6.12 预留，MVP 不做

---

## 2. 前置（已就绪 / 已验证）

**Phase 2/3 已就绪，Phase 4 直接复用，domain / db 不动：**

- `CardService.create({ ... canvasPosition })` / `listOnCanvas(canvasId)` / `moveToCanvas(id, position)` —— Phase 2/3 已实现
- `cards` 表 `canvasId/canvasX/Y/W/H/Z/rotation` 列 + `idx_cards_canvas` 索引 —— Phase 2 schema
- `useDb()` hook + localStorage 持久化 —— 卡片 `canvasPosition` 随整包 `_cards` 自动持久化
- `@cys-stift/ui` Modal —— Phase 3 详情/编辑 Modal 可整块复用
- `Card.canvasPosition?: CanvasPosition` 类型（`{ canvasId, x, y, w, h, z, rotation? }`）—— domain `types.ts`

**tldraw spike 已验证（2026-06-19，本会话）**：

- `@tldraw/tldraw@3.15.6`（peer `react ^18.2.0 || ^19.0.0`，匹配我们 pin 的 React 19.0.0）
- `pnpm --filter web build` exit 0 —— 静态导出能编译 tldraw
- tldraw 独立 ~2.1MB 动态 chunk，**懒加载，不污染其他路由首屏**（`/dev/tldraw` First Load 仍 101kB 基线）
- puppeteer 真渲染：`tl-container` / `tl-background` / `tl-svg-context` 等完整挂载，**零 page error、零 window/SSR 崩溃**（spec §12 风险 #1 清除）
- tldraw v3 用 **SVG**（`tl-svg-context`）渲染 shape，不是 HTML `<canvas>` 元素 —— 实现时别找错渲染层
- CSS 导入：顶层 `import '@tldraw/tldraw/tldraw.css'`（静态 side-effect，`exports[./tldraw.css]` 已暴露）；JS 模块走 useEffect 内动态 `import()` 避开预渲染期 window 访问

**新增依赖**（spec / ADR-0005 要求，仅此一个）：
- `@tldraw/tldraw@3.15.6`（spike 已装）

> **版本选择**：spec 写 "tldraw v3"。npm latest 已到 v5，但 **v5 peer 要求 React ≥19.2.1**（我们 19.0.0 会冲突），v3.15.6 既 spec 对齐又 peer 兼容且无需动 React → **锁 v3**。

---

## 3. 任务清单

### P4-T1 · `/canvas` 路由壳 + tldraw 懒载挂载

- `apps/web/src/app/canvas/page.tsx`（`'use client'`）
- 顶部 `<Toolbar region="canvas">`（黑条 + "cy's stift / canvas" 面包屑 + 卡片计数 Tag）
- `features/canvas/tldraw-canvas.tsx`：客户端组件，**挂载守卫**（`useEffect`+`mounted`）+ 动态 `import('@tldraw/tldraw')` + 顶层静态 `import '@tldraw/tldraw/tldraw.css'`
- 画布区占满剩余视口（`position: fixed`/`inset`，黑条下方）
- 首页 `/` 加跳 `/canvas` 的链接（小改动，让画布有入口；与 inbox 入口并列）
- **验证**：`pnpm --filter web build` exit 0；`/canvas/` 在静态产物里；puppeteer 加载零 page error、tldraw DOM 挂载（spike 已证可行）

### P4-T2 · Card 自定义 ShapeUtil

- `features/canvas/card-shape-util.tsx`：
  - `type CardShape = TLBaseShape<'card', { cardId: string; title: string; w: number; h: number }>`
  - `class CardShapeUtil extends ShapeUtil<CardShape>`：`static type = 'card'`、`getDefaultProps()`、`getGeometry()`（`Rectangle2d`）、`component()`（`HTMLContainer`：白底黑边 8px 圆角 + Space Grotesk 标题，颜色全走 `var(--color-*)` token）、`indicator()`（选中描边）
- 注册到 `<Tldraw shapeUtils={[cardShapeUtil]} />`
- **验证**：`onMount` 里 `editor.createShape({ type: 'card', ... })` 能渲染一张 Bauhaus 风格卡；可选中/拖动/缩放

### P4-T3 · 数据绑定（DB 为真相源，§6.11）

- `features/canvas/default-canvas.ts`：单一默认 `canvasId` 常量（稳定字符串）
- `features/canvas/canvas-binding.ts`：
  - **card ↔ TLShape 双向转换**：`cardToShape(card)` / `shapeToPosition(shape)`
  - **加载**：mount 后 `service.listOnCanvas(defaultCanvasId)` → 每个 card `editor.createShape(cardToShape(card))`（用 `cardId` 作为 shape id，保证往返一致）
  - **回写**：`editor.store.listen(cb, { source: 'user', scope: 'document' })` → 防抖 ~300ms → 对变化的 card shape 调 `service.moveToCanvas(cardId, shapeToPosition(shape))`
  - **防自激**：`source: 'user'` 只听用户操作，过滤程序自身 `createShape`；加载与回写用同一 id 映射，避免回写触发再加载
- **验证**：刷新后卡片位置仍在（§6.11 核心承诺，puppeteer 断言：建卡→拖动→navigate→位置不变）

### P4-T4 · 双击建卡 + 点卡复用详情 Modal

- 双击画布空白（tldraw 的 canvas 双击事件，注意与 shape 双击区分）→ `service.create({ title:'', source:{kind:'manual',deviceId:'web'}, canvasPosition:{ canvasId: defaultCanvasId, x, y, w:240, h:120, z } })` → 打开详情 Modal（编辑模式）
- 点 card（tldraw shape 单击/双击）→ 打开 Phase 3 详情 Modal（只读 + 编辑 + 归档 + 软删）
- 详情 Modal 从 `apps/web/src/app/inbox/page.tsx` 的 `CardDetail` 抽出复用（如耦合太紧则复制最小版本，注明来源）
- **验证**：双击空白建卡并落点；点已有卡能看详情/编辑/归档；编辑后画布卡片标题同步

### P4-T5 · 视觉（包豪斯）+ 截图

- 画布背景 8px 点阵网格（spec §5.4；CSS `radial-gradient` 用 `var(--color-black)` 低透明度点，8px 间距）
- 隐藏 tldraw 冗余 chrome（不需要的菜单/工具条用 `<Tldraw>` props 或 `editor` API 关闭；保留选择/拖动必需的）
- region=canvas 黑条顶部（spec §5.4 / §5.2：canvas→black）
- 组件层**禁止写死 hex/px**（grep `#[0-9a-fA-F]{3,6}` 在 `features/canvas/` 必须为空，除点阵背景的 currentColor 用法）
- 截图（复用 `p3-shots.cjs` 模板 → `scripts/p4-shots.cjs`，基于 `scripts/p4-spike-render.cjs` 扩展）：
  - 空画布 / 放 3 张卡（含多媒介标题）/ 拖动后 / 刷新后位置仍在 / 移动视口
  - 归档 `docs/design/screenshots/phase-4/` + README 逐项打勾对照 spec §5.4 / §6.3 / §6.11
- **验证**：6 色 token / 字体 / 8px 网格在 `/canvas` 仍对（视觉契约不破）

### P4-T6 · 收尾四件套

- `docs/changelog.md` 追加 `## 2026-06-19 · phase 4 · canvas`（交付 + 核心承诺验证 + 关键决策 + 已知/后续）
- `docs/decisions/2026-06-19-phase-4.md` + `docs/decisions/INDEX.md` 索引一行
- `git commit`（Conventional Commits，如 `feat(canvas): phase 4 — tldraw integration + card shape`）
- `git tag v0.5.0-phase-4`（Phase 3 是 `v0.4.0-phase-3`，minor +1）
- `git status` 干净

---

## 4. 验收清单

- [ ] `pnpm --filter domain test` 全绿（Phase 4 不改 domain，确认没破坏）
- [ ] `pnpm --filter db test` 全绿（Phase 4 不改 db，确认没破坏）
- [ ] `pnpm --filter web build` exit 0，`/canvas/` 在静态产物里
- [ ] `/canvas` 在浏览器渲染，tldraw 挂载，零 console error
- [ ] Card ShapeUtil 渲染 Bauhaus 风格卡，可选中/拖动/缩放
- [ ] **双击空白建卡**，落点正确，能进编辑
- [ ] **拖动卡片后刷新页面，位置仍在**（§6.11 核心承诺，puppeteer 断言）
- [ ] 点卡能看详情 / 编辑 / 归档 / 软删（复用 Phase 3 Modal）
- [ ] 编辑标题后画布卡片同步
- [ ] 6 色 hex / 字体 / 8px 网格在 `/canvas` 仍对（视觉契约不破）
- [ ] `features/canvas/` 内无写死 hex/px（grep 验证）
- [ ] 截图归档 `docs/design/screenshots/phase-4/` + README 逐项打勾
- [ ] changelog + memory + commit + tag 四件套齐全
- [ ] `git status` 干净

---

## 5. 审核标准（主模型自审逐项查）

> 详见 `docs/archive/ralph/README.md` §6（归档，标准仍适用）。Phase 4 特别注意：

### 代码质量
- [ ] `/canvas` 页面 + `features/canvas/*` 全是 client 组件，没误用 server 特性
- [ ] 没引入 spec 没有的依赖（只允许 `@tldraw/tldraw@3.15.6`）
- [ ] 组件层没写死 hex / px（`grep -rE '#[0-9a-fA-F]{3,6}' apps/web/src/features/canvas/` 为空）
- [ ] 数据流走 `service.create/listOnCanvas/moveToCanvas`，不绕过 domain 直写 repo

### 架构一致
- [ ] 没改 spec / 没破坏 domain 零依赖 / 没动 packages/db schema（domain/db 测试零改动仍全绿）
- [ ] `/canvas` 是静态路由（无 `[param]`），canvas id 走客户端常量（spec §6.12）
- [ ] tldraw 代码集中在 `apps/web/src/features/canvas/`（ADR-0002 feature-sliced），不散落到 domain/db
- [ ] 没碰已 tag 的 Phase 0/1/2/3 产物

### 测试 + 视觉
- [ ] domain + db 测试仍全绿
- [ ] `pnpm --filter web build` exit 0
- [ ] 截图覆盖：空画布 / 多卡 / 拖动 / 刷新后位置 / 视口移动
- [ ] 视觉契约（6 色 / 字体 / 网格）未破

### 安全
- [ ] 复用的 Phase 3 详情 Modal 仍走 `rehype-sanitize`（Markdown 正文）
- [ ] 软删二次确认仍在

### Git 卫生
- [ ] Conventional Commits
- [ ] 无 console.log 残骸 / 死代码 / TODO
- [ ] `git status` 干净才能收尾

---

## 6. 风险

| 风险 | 处理 |
|---|---|
| tldraw v3 + React 19.0.0 runtime 兼容 | **spike 已验证 GREEN（零 error 挂载）**；若 T2/T3 中 ShapeUtil 路径出新问题，按 spec §12 回退方案 2（仅相机 + DOM 叠加），tldraw 代码集中在 `features/canvas/` 便于替换 |
| 静态导出下 tldraw 访问 `window` | 挂载守卫 + client 组件内 `useEffect` 动态 `import()`（spike 已证） |
| 包体 ~2.1MB | 已确认 code-split 懒加载，只在 /canvas 加载，可接受 |
| listen 回写与 load 竞态（回写触发再加载） | `source: 'user'` 只听用户改动 + 防抖 300ms + cardId 作 shape id 的稳定映射 |
| 双击建卡与 tldraw shape 双击冲突 | 用画布空白双击事件，区分空白 vs shape；建卡后立即 openModal |
| tldraw chrome 与包豪斯冲突 | T5 隐藏冗余菜单 + 点阵背景；完整换肤留后 |
| 详情 Modal 复用耦合 inbox 页 | 抽公共组件或复制最小版本并注明；不为此重构 Phase 3 |

---

## 7. 产出与汇报

完成后主动给出：

1. `pnpm --filter web build` 输出 + 产物大小（确认 tldraw chunk 懒载）
2. `/canvas` 截图（空画布 / 多卡 / 拖动 / 刷新后位置 / 视口移动，桌面 + 移动）
3. 视觉对照笔记（逐项打勾）
4. **持久化再验证**：建卡 → 拖动 → 刷新 → 位置仍在（§6.11 核心承诺）
5. 下一步预告：Phase 5（Canvas 完整：网格/自由/缩放/对齐）

---

## 8. 完成信号

```xml
<promise>PHASE COMPLETE</promise>
```

**严格条件**：第 4 节验收清单全部 ✅ + 第 5 节审核标准全部满足 + `git status` 干净。任一不满足就**继续迭代，不输出假 promise**。
