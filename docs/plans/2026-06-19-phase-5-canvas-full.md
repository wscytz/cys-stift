# Phase 5 实现计划 · Canvas 完整（网格 / 自由模式、缩放、对齐）

> 🟡 **待执行**（主模型手动执行 + 自审，见根 `CLAUDE.md` "Ralph 状态"）。
> 这是 Ralph 停用后主模型手动执行的第三个 phase（Phase 3/4 之后）。

| 字段 | 值 |
|---|---|
| 计划 | Phase 5：Canvas 完整 — 8px snap / 自由模式切换 + 缩放控件 + snap 指示线 |
| 创建 | 2026-06-19 |
| 范围决策 | **Lean**（仅 spec §8 4 件；视图持久化、Delete 键同步打磨留 Phase 5+，见 `docs/STATE.md`） |
| 依据 spec | §4.3（`CanvasView = { zoom, pan, gridMode: 'snap' \| 'free', gridSize: 8 }`）/ §5.4（Canvas 视觉骨架：8px 黑条 + 8px 点阵网格背景）/ §6.3（tldraw Custom Shape API）/ §6.11（tldraw 持久化策略，本阶段不持久化 view）/ §1.4（双击建卡 + MVP 单画布）/ §8（路线图 Phase 5 段：网格 / 自由模式、缩放、对齐）/ §12（剩余风险） |
| ADR | ADR-0005（tldraw as canvas renderer） |
| 上游交付 | Phase 4（`/canvas` production 路由 + tldraw v3 懒载 + Card ShapeUtil + §6.11 位置持久化 + 双击建卡/开卡）|
| 下游交付 | Phase 6（inbox 完整 / 全局快捷键 / mini input）前 Canvas 交互完整可玩 |
| 受众 | human + 任意 LLM（claude / gpt / gemini） |

---

## 0. 目标

把 Phase 4 的"可拖动 / 位置持久化"画布升级为"可玩"的画布：**网格 snap / 自由模式可切换、缩放有显式控件、拖动/缩放时出辅助对齐线**。tldraw v3 的 snap 与指示线能力**开箱即用**，本阶段主要工作是**暴露成 UI**（按钮 + 键盘快捷键 + 视觉），不重造轮子。

**核心承诺**：一个真实用户打开 `/canvas` → 看到顶部多了 snap/zoom 工具条 → 拖动卡片时**位置自动对齐 8px 网格 + 出现细黑对齐线**；点 snap 切换为 free → 拖动时无吸附无指示线；点 zoom in / zoom out / fit → 视图平滑缩放。

**Lean 范围声明**（不做的明确留后）：
- ❶ 视图持久化（zoom/pan/gridMode 写回 `canvases.viewJson`）→ 留 Phase 5+
- ❷ Delete 键与 DB 同步打磨（tldraw Delete 只删 shape，刷新会从 DB 回来）→ 留 Phase 5+
- ❸ tldraw chrome 完整换肤（菜单/工具条全方位包豪斯化）→ 留后
- ❹ inbox → canvas send 动作 → 留 Phase 5+
- ❺ 多画布 UI / `/canvas?id=` 深链 → 留后

---

## 1. 范围

### ✅ 本阶段做

#### 1.1 snap / free 模式切换（spec §4.3 `gridMode: 'snap' | 'free'`）
- 顶部工具条右侧加一个 **Toggle 按钮**（`Tag` 风格，黑底/灰底指示当前模式）
- 状态来源：本地 `useState<'snap' | 'free'>`（**不持久化**，刷新回 snap）
- 切换时调 `editor.user.updateUserPreferences({ isSnapMode: next })`
- 视觉：当前模式 = 黑底白字；非激活 = 白底黑边
- 配套显示当前 `gridSize`（写死 8px，spec §4.3 固定）

#### 1.2 缩放控件 UI（spec §4.3 `zoom`）
- 工具条右侧加 3 个 icon 按钮：`zoom in` / `zoom out` / `fit`
- 按钮调 `editor.zoomIn()` / `editor.zoomOut()` / `editor.zoomToFit()`（tldraw API）
- 中间显示当前 zoom 百分比（`Math.round(editor.getCamera().z * 100) + '%'`）
- 同步键盘快捷键：`+` / `-`（zoom in/out）、`0` 或 `1`（fit）
- 缩放上下限：跟随 tldraw 默认（不另设 min/max，避免与 `editor.setCameraOptions` 复杂度纠缠）

#### 1.3 snap 指示线（spec §8 "对齐"）
- **不自建**——tldraw v3 `SnapManager` 在 snap 模式下自动渲染对齐线（点对齐 + 间距线），且颜色可定制
- 验证：snap 模式下拖动卡，tldraw DOM 里出现 snap indicator 元素（`[class*="tl-snap-indicator"]` 或类似）
- 若默认指示线颜色与包豪斯冲突（蓝/绿），在 `tldraw-canvas.tsx` 顶部 CSS 覆盖：把 `.tl-snap-indicator` 描边色改为 `var(--color-black)`，粗细 1px
- free 模式下指示线不显示（tldraw 默认行为）

#### 1.4 视觉整合
- 工具条沿用 `<Toolbar region="canvas">`（黑条，spec §5.4），所有新控件**只**放在黑条右侧
- 按钮全走 `@cys-stift/ui` 已有原色（黑/白/红），不新增颜色 token
- 缩放百分比用 `var(--font-mono)`（mono caps，与 Phase 1-4 风格一致）
- 工具条加 8px 间距分隔左（面包屑 + Tag）和右（snap + zoom）

### ❌ 本阶段不做（明确留后）

- **视图持久化**（zoom/pan/gridMode 写 `canvases.viewJson`；domain 需补 `CanvasService.updateView` + `CanvasRepository.update`）→ **Phase 5+**（不在本 plan）
- **Delete 键同步打磨**（tldraw Delete → `CardService.softDelete`，需二次确认交互）→ **Phase 5+**
- tldraw chrome 完整换肤（菜单/工具条全方位包豪斯化）→ 后续打磨
- inbox → canvas send 动作 → Phase 5+
- 多画布 UI / `/canvas?id=` 深链 → 留后（spec §1.4 / §6.12 预留）
- 自定义 snap threshold（`editor.snaps.getSnapThreshold()`）/ 自定义 snap 指示线样式（仅在默认颜色冲突时覆盖一次）→ 不做
- 缩放动画曲线定制（用 tldraw 默认 `TLCameraMoveOptions`，不传 `duration`）→ 不做
- 旋转 snap / handle snap（`snapType: 'align'`）→ spec §8 未列，留后

---

## 2. 前置（已就绪 / 已验证）

**Phase 4 已就绪，Phase 5 直接复用，domain / db 不动：**

- `/canvas` production 路由 + `apps/web/src/features/canvas/` 6 文件 + §6.11 数据流 → Phase 4 完成
- tldraw v3.15.6 spike：构建 + 挂载 + 拖动 + 持久化 全部 GREEN（puppeteer 断言）
- `CardShapeUtil` 已有 `BaseBoxShapeUtil`，内置 selection / drag / resize 手柄，snap 模式自动生效（v3 默认开）
- `<Toolbar region="canvas">` 黑条 + `<Tag color="black">` 计数 + `<Button>` variants 全套 → Phase 1 组件库就绪
- 0 个新依赖

**tldraw v3 snap / zoom 能力已确认**（context7 查证）：

| 能力 | API | 备注 |
|---|---|---|
| 切 snap / free | `editor.user.updateUserPreferences({ isSnapMode: next })` | v3 默认开 snap |
| 读 snap 状态 | `editor.user.getUserPreferences().isSnapMode` | |
| grid size | `editor.getDocumentSettings().gridSize` | 默认 8；本阶段不调（spec §4.3 固定 8） |
| 写 grid size | `editor.updateDocumentSettings({ gridSize })` | 本阶段不用 |
| zoom in / out | `editor.zoomIn() / zoomOut()` | |
| reset zoom | `editor.resetZoom()` | |
| fit content | `editor.zoomToFit() / zoomToSelection()` | |
| 读 zoom | `editor.getCamera().z` | |
| 写 camera | `editor.setCamera({ x, y, z })` | 本阶段不用（不持久化） |
| snap 指示线 | tldraw v3 `SnapManager` 自动渲染 | 默认颜色需校验 |

---

## 3. 任务清单

### P5-T1 · 工具条扩展：右侧 snap/zoom 控件
- `apps/web/src/app/canvas/page.tsx` 在 `<Toolbar>` 内、面包屑 + Tag 之后，加右侧区（flex `justify-between`）
- 右侧区包含：
  - `<Tag color={snapMode === 'snap' ? 'black' : 'gray'}>` 显示 "SNAP 8" / "FREE"（可点击切换）
  - 分隔竖线 1px × 16px
  - 缩放按钮组：`<Button variant="ghost">−</Button>` + 百分比 `<span>` + `<Button variant="ghost">+</Button>` + `<Button variant="ghost">FIT</Button>`
- 不引新组件，原地 JSX（按钮少、组合简单，**不**为 4 个按钮抽新组件，YAGNI）
- 颜色 token：`var(--color-black)` / `var(--color-white)` / `var(--color-gray)` / `var(--color-red)` focus；`var(--font-mono)` 数字

### P5-T2 · snap / free 模式接线
- `canvas/page.tsx` 增 `snapMode: 'snap' | 'free'` 本地 state（默认 `'snap'`，符合 spec §4.3 默认）
- 工具条 Tag `onClick` 切换：调 `editorRef.current?.user.updateUserPreferences({ isSnapMode: snapMode === 'snap' ? false : true })`
- 同步更新本地 state
- 键盘快捷键：`g`（grid toggle，参考 tldraw 默认习惯——本阶段只加 1 个 `g` 快捷键；缩放快捷键放 T3）
- **不持久化**——刷新回到 snap（Lean 范围）

### P5-T3 · 缩放控件 + 键盘快捷键
- 工具条 zoom 按钮 `onClick` 调对应 `editor.zoomIn/Out/zoomToFit`
- 缩放百分比显示：`useValue` 订阅 `editor.getCamera()`（tldraw 响应式），取 `Math.round(z * 100) + '%'`
- 键盘快捷键（`canvas/page.tsx` `useEffect` 注册到 `window`，cleanup 注销）：
  - `+` / `=` → `zoomIn()`
  - `-` / `_` → `zoomOut()`
  - `0` / `1` → `zoomToFit()`
  - `g` → toggle snap/free（与 T2 共用）
- 快捷键**必须忽略**输入框 / Modal 内的按键（检查 `event.target` 是否在 `INPUT / TEXTAREA / [contenteditable]` 内，是则 return）
- **不**做 `?` 帮助浮层（YAGNI，按键就 4 个）

### P5-T4 · snap 指示线样式校验 + 包豪斯覆盖
- `apps/web/src/features/canvas/tldraw-canvas.tsx` 顶部静态 `import '@tldraw/tldraw/tldraw.css'` 之后，**新增** `import './canvas-overrides.css'`
- 新建 `apps/web/src/features/canvas/canvas-overrides.css`：
  - `.tl-snap-indicator` 描边色 `var(--color-black)`、粗细 1px（若默认是蓝/绿则覆盖；先 puppeteer 跑一遍确认默认颜色再决定覆盖规则）
  - 若 tldraw 默认指示线已用 `currentColor` 或黑，则 CSS 文件**空着不写**——保持 lean
- 用 grep 验证：`features/canvas/canvas-overrides.css` 内无写死 hex/px
- 若 tldraw 默认指示线**完全不可见**（snap 模式也不出），是 P5-T4 风险——见 §6 风险表

### P5-T5 · 视觉与截图
- 8px 点阵背景沿用 Phase 4（已 OK）
- 工具条右侧控件垂直居中、8px 间距、黑条高度 47px 不变
- 截图脚本 `scripts/p5-shots.cjs`（参考 `p4-shots.cjs` 模式）：
  1. 空画布：toolbar 新增 SNAP 8 + zoom 100% + 三个 zoom 按钮可见
  2. snap 模式拖动：seeded 卡 → 拖到非 8 倍数坐标 → 拖动过程中 tldraw DOM 含 snap indicator 元素（puppeteer 断言 `[class*="snap"]` count > 0）
  3. free 模式拖动：切到 FREE → 拖到非 8 倍数坐标 → snap indicator 数为 0
  4. 缩放后：点 zoom in 3 次 → 百分比 = 100 → 175 → 300 → 450（tldraw 默认 1.5x 步进）；截图 175% 状态
  5. zoom to fit：seeded 3 张散开 → 点 FIT → 3 张都进视口 → 截图
  6. 首页入口截图沿用 Phase 4 `06-home-entries.png`（功能不变）
- 归档 `docs/design/screenshots/phase-5/` + README 视觉对照笔记
- 视觉对照：6 色 token 不破；黑条不变；按钮 hover/focus 红下划线（Input 同款）

### P5-T6 · 收尾四件套
- `docs/changelog.md` 追加 `## 2026-06-19 · phase 5 · canvas full`
- `docs/decisions/2026-06-19-phase-5.md` + `docs/decisions/INDEX.md` 索引一行
- 更新 `docs/STATE.md`（状态推进到 Phase 6）
- 更新根 `CLAUDE.md`（状态：Phase 5 ✅，next Phase 6）
- `git commit`（Conventional Commits，如 `feat(canvas): phase 5 — snap/zoom/guides`）
- `git tag v0.6.0-phase-5`（Phase 4 是 `v0.5.0-phase-4`，minor +1）
- `git status` 干净

---

## 4. 验收清单

- [ ] `pnpm --filter domain test` 全绿（Phase 5 不改 domain）
- [ ] `pnpm --filter db test` 全绿（Phase 5 不改 db）
- [ ] `pnpm --filter web build` exit 0，`/canvas/` 在静态产物里
- [ ] `/canvas` 工具条右侧可见 **SNAP 8** / **FREE** 切换 Tag + **−** / **%** / **+** / **FIT** 4 按钮
- [ ] snap 模式拖动：松手后 `canvasPosition.x` 是 8 倍数（puppeteer 断言 `x % 8 === 0`）
- [ ] free 模式拖动：松手后 `canvasPosition.x` 可为非 8 倍数（puppeteer 断言至少 1 张卡 `x % 8 !== 0`）
- [ ] snap 模式拖动过程中：tldraw DOM 内有 snap indicator 元素（puppeteer 断言 `[class*="snap"]` count > 0）
- [ ] free 模式拖动过程中：snap indicator 数 = 0
- [ ] 缩放按钮：点 `+` 3 次 → 百分比正确递增（tldraw 默认 1.5x 步进，puppeteer 断言读出的 zoom z 等于 1.5^3 ≈ 3.375）
- [ ] 点 `FIT` 后所有 seeded 卡都在视口内（puppeteer 断言 `getViewportPageBounds()` 包含所有卡 bounds）
- [ ] 键盘 `+` / `-` / `0` / `1` / `g` 全部生效；在 Input/Textarea 内**不**触发
- [ ] 缩放百分比用 mono 字体（`getComputedStyle` font-family 包含 mono）
- [ ] 6 色 hex / 字体 / 8px 网格在 `/canvas` 仍对（视觉契约不破）
- [ ] `features/canvas/` 内无写死 hex/px（`canvas-overrides.css` 也算，grep 验证）
- [ ] 截图归档 `docs/design/screenshots/phase-5/` + README 视觉对照笔记
- [ ] changelog + memory + context + commit + tag + 根 CLAUDE.md 状态推进 六件套齐全
- [ ] `git status` 干净

---

## 5. 审核标准（主模型自审逐项查）

> 沿用 `docs/archive/ralph/README.md` §6 归档标准。Phase 5 特别注意：

### 代码质量
- [ ] 工具条扩展是 client 组件内 JSX 改动，**没**抽无意义的新组件
- [ ] 没引入 spec 没有的依赖（**0 新依赖**）
- [ ] 组件层没写死 hex / px（`grep -rE '#[0-9a-fA-F]{3,6}' apps/web/src/features/canvas/ apps/web/src/app/canvas/` 为空）
- [ ] 缩放 / snap 状态全走本地 `useState` + `useValue`（不走 Redux / Context，YAGNI）
- [ ] 快捷键 effect 有 cleanup（component 卸载时 `removeEventListener`）
- [ ] 快捷键忽略 input/textarea/contenteditable（防止打字触发 zoom）

### 架构一致
- [ ] 没改 spec / 没破坏 domain 零依赖 / 没动 packages/db schema
- [ ] `/canvas` 仍是静态路由（无 `[param]`）
- [ ] tldraw 代码仍集中在 `apps/web/src/features/canvas/`（ADR-0002 feature-sliced）
- [ ] 没碰已 tag 的 Phase 0/1/2/3/4 产物
- [ ] **不**碰 `canvases.viewJson`（Lean 范围，视图不持久化）

### 测试 + 视觉
- [ ] domain + db 测试仍全绿
- [ ] `pnpm --filter web build` exit 0
- [ ] 截图覆盖：snap 模式 / free 模式 / 缩放后 / fit 后 / 工具条
- [ ] 视觉契约（6 色 / 字体 / 网格）未破
- [ ] 缩放百分比用 mono 字体
- [ ] snap 指示线颜色与包豪斯一致（黑 1px 或 tldraw 默认即可，不蓝不绿）

### 安全
- [ ] 复用的 Phase 3 详情 Modal 仍走 `rehype-sanitize`
- [ ] 软删二次确认仍在
- [ ] 快捷键不破坏 Modal 内文字输入

### Git 卫生
- [ ] Conventional Commits
- [ ] 无 console.log 残骸 / 死代码 / TODO
- [ ] `git status` 干净才能收尾

---

## 6. 风险

| 风险 | 处理 |
|---|---|
| tldraw v3 snap 指示线默认颜色与包豪斯冲突（蓝/绿） | P5-T4 CSS 覆盖为 `var(--color-black)` 1px；puppeteer 跑一遍确认 |
| tldraw v3 `BaseBoxShapeUtil` snap 默认行为不是 8px 而是别的 | `editor.getDocumentSettings().gridSize` 应返回 8；不一致则 P5-T4 写 `updateDocumentSettings({ gridSize: 8 })`（mount 后调一次，幂等） |
| 缩放步进不是 1.5x 而是别的 | puppeteer 跑出来看实际步进，调整验收断言 |
| 键盘快捷键与 tldraw 内置快捷键冲突（tldraw 有 `+`/`-` 默认） | tldraw 默认 `+`/`-` 也是 zoom in/out，**正好不冲突**；`g` 需验证 tldraw 是否占用——若冲突，listener 用 `capture: true` 并 `preventDefault` |
| 缩放百分比订阅 `editor.getCamera()` 触发频繁重渲染 | tldraw v3 `useValue` 自带去抖；不行就 `useDeferredValue` |
| 工具条加右侧控件后黑条高度溢出 | 黑条固定 47px（Phase 1 token），按钮 height 24px + 8px 间距，容纳 |
| free 模式拖到非 8 倍数后回到 snap 模式 + 拖动 → 跳到最近 8 倍数（视觉跳跃） | 行为正确；不在 Phase 5 优化 |
| `BaseBoxShapeUtil` resize 手柄 snap 不生效 | tldraw v3 默认 snap 对 translate + resize 都生效；若不生效，P5-T4 内 `editor.updateDocumentSettings({ snapMode: 'always' })` 强制开 |
| 0 新依赖 → 若 `editor.user.updateUserPreferences` 找不到 isSnapMode 字段 | v3.15.x 文档已查证 `isSnapMode` 在 `UserPreferences` 内；若实际不存在，fallback 用 `editor.snaps.setIndicators([])` 间接关 snap，或在 CardShapeUtil 拖动事件中手动调 `snapToGrid` |

---

## 7. 产出与汇报

完成后主动给出：

1. `pnpm --filter web build` 输出 + 产物大小（确认 0 新依赖、tldraw chunk 仍懒载）
2. `/canvas` 截图（snap 模式拖动 / free 模式拖动 / 缩放 175% / zoom to fit / 工具条特写）
3. 视觉对照笔记（逐项打勾）
4. **puppeteer 交互断言**（snap 吸附到 8 倍数 / free 不吸附 / 缩放步进 / FIT 包含所有卡）
5. 下一步预告：Phase 6（inbox 完整 / 全局快捷键 / mini input；或 Phase 5+ 的视图持久化、Delete 键同步打磨——按用户届时决策）

---

## 8. 完成信号

```xml
<promise>PHASE COMPLETE</promise>
```

**严格条件**：第 4 节验收清单全部 ✅ + 第 5 节审核标准全部满足 + `git status` 干净。任一不满足就**继续迭代，不输出假 promise**。
