# Phase 5 视觉 + 交互对照笔记

> 截图：`docs/design/screenshots/phase-5/`（10 张）
> 测试：puppeteer-core + 系统 Chrome 驱动 `apps/web/out`
> 服务：`python3 -m http.server 3016 --directory apps/web/out`

---

## 结论

**Phase 5 核心承诺达成（spec §8 路线图 "网格 / 自由模式、缩放、对齐"）**：tldraw v3 在 Phase 4 基础上加入 snap/free 切换 + 显式缩放控件 + snap 指示线样式覆盖。

puppeteer 6 项断言全过：
- ✓ snap 模式拖 +147 → 落点 x=488（8 倍数）
- ✓ free 模式拖 +147 → 落点 x=747（非 8 倍数）
- ✓ zoom 控件：100% → 200% → 400% → 800%（tldraw v3 默认 2x 步进）
- ✓ FIT：3 张散卡全部进视口
- ✓ 键盘 `g` 切换 snap/free
- ✓ 零 page error

---

## 10 张截图

| 文件 | 内容 |
|---|---|
| `00-toolbar.png` | 工具条右侧：SNAP 8（黑底白字）+ 缩放按钮组（− 100% + FIT）+ divider |
| `01-cards-default.png` | 3 张 seeded 卡 + 完整工具条（SNAP 8 + 缩放）|
| `02-cards-snap-dragged.png` | snap 模式拖动后：第一张卡选中态（蓝框）落点对齐 8px |
| `03-toolbar-free.png` | 按 `g` 切换后：SNAP 8 → FREE（白底黑字）|
| `04-cards-free-dragged.png` | free 模式拖动后：落点非 8 倍数（自由）|
| `05-canvas-zoomed-in.png` | zoom 800%：卡显著放大，百分比 mono 数字 |
| `06-canvas-zoom-to-fit.png` | FIT 后约 56%：3 张散卡全部进视口 |
| `07-toolbar-keyboard-toggle.png` | reload + 键盘 `g`：SNAP 8 → FREE |
| `08-mobile-toolbar.png` | 390px 视口：hint + 缩放百分比 + dividers 隐藏（snap tag 紧凑可见）|
| `09-home-entries.png` | 首页入口（与 Phase 4 一致）|

---

## puppeteer 交互断言（spec §8）

```
[snap result]      shotcard00000001 x = 488, x%8==0: true    ✓ 吸附 8px
[free result]      shotcard00000002 x = 747, x%8!=0: true    ✓ 自由落点
[zoom]             100 → 200 → 400 → 800                     ✓ 2x 步进（tldraw 默认）
[fit]              cards in viewport: [true,true,true] → true ✓ 全部进视口
[keyboard g]       SNAP 8 → FREE                             ✓ 快捷键工作
pageErrors:        none                                       ✓ 零错误
```

---

## 视觉对照笔记（spec §5.4 / §5 / §6.3）

### 工具条扩展
- ✅ 黑 region 条（`var(--color-black)`，47px 高）不变
- ✅ 左侧：面包屑 + hint（mobile 隐藏）+ 计数 Tag + ← home
- ✅ 右侧（Phase 5 新增）：
  - **SNAP 8 / FREE 切换按钮**（黑底白字 ↔ 白底黑字，mono caps，32px 高）
  - **缩放按钮组**（− / % / + / FIT，mono 数字 100% 在中央，hairline border）
- ✅ 1px × 24px gray divider 分隔左/中区/右区

### 6 色 token 仍对
- 工具条黑条 = `var(--color-black)` ✅
- SNAP 8 黑底 + 白字 ✅
- FIT 按钮 hover 黑底白字 ✅
- 100% mono 数字 = `var(--color-black)` ✅
- 缩放按钮 focus 红 outline = `var(--color-red)` ✅

### 字体 + 网格
- 数字 100% / SNAP 8 / FREE / FIT / 缩放符号：`var(--font-mono)`（mono caps）✅
- 缩放按钮高度 32px（沿用 8px 节奏）✅
- 卡片间距 8px dot 网格仍对（Phase 4 沿用）✅
- `features/canvas/` + `app/canvas/` 内 **hex grep 零命中**（颜色全走 `var(--color-*)` token）✅

### 组件复用（packages/ui）
- `<Toolbar region="canvas">` 黑条 ✅
- `<Tag color="black">` 计数 ✅
- 4 个本地 `<button>`（snap 切换 + 3 zoom 按钮）— YAGNI 不抽新组件
- 缩放百分比用 `useValue` 订阅 `editor.getCamera().z`（tldraw 响应式 hook）

### snap 指示线样式（Phase 5 覆盖）
- ✅ `apps/web/src/features/canvas/canvas-overrides.css` 把 `.tl-snap-indicator` / `.tl-snap-point` / `.tl-snap-gap` 默认 `hsl(0, 76%, 60%)` 红覆盖为 `var(--color-black)` 1px
- ✅ 保留 red token 给 inbox/capture region（语义不冲突）
- ✅ free 模式下 tldraw 默认不渲染指示线（isGridMode=false → DefaultCanvas 不挂 Grid）

### tldraw 默认行为（开箱即用）
- ✅ `editor.updateInstanceState({ isGridMode: true })` 开启 grid 模式
- ✅ `editor.updateDocumentSettings({ gridSize: 8 })` 改 grid size（tldraw 默认 10，spec §4.3 要 8）
- ✅ `editor.user.updateUserPreferences({ isSnapMode: true })` 同步 Ctrl 反转行为
- ✅ `editor.zoomIn / zoomOut / zoomToFit` 用 tldraw 默认 API（2x 步进 + ease）
- ✅ `useValue` hook 订阅 `editor.getCamera().z` 实现响应式百分比

---

## 关键工程决策

1. **`useState<Editor | null>` 而非 `useRef<Editor>`**：Phase 4 用 ref 留坑——ref 改值不触发 re-render，导致 toolbar 按钮永远 disabled。Phase 5 第一个真依赖 editor 的功能（snap 切换）就暴露了。改 state 让 toolbar 跟着 editor mount 重新渲染，按钮 enable。这是 React 经典坑，不写快照就不会发现。
2. **toggle 同时设 `isGridMode` 和 `user.isSnapMode`**：tldraw v3 这俩**是独立的**——`isGridMode` 是 snap 总开关，`isSnapMode` 只是 Ctrl 时的反转逻辑。context7 文档没明说，靠读 source 才知道。两者必须同步。
3. **`gridSize` 显式设 8**：tldraw v3 默认 `gridSize: 10`，不是 spec §4.3 要求的 8。P5-T4 验证时读 editor state 发现这一点，加 `editor.updateDocumentSettings({ gridSize: 8 })`。
4. **缩放按钮用本地 `<button>` 而非 `@cys-stift/ui` Button**：Button 高度 40px + padding 大不适合工具条 47px 黑条内紧凑布局。本地按钮 height 32px 贴 toolbar 尺度，颜色/边框全走 token，不破坏视觉契约。
5. **`window.__canvasEditor` 诊断 hook**：puppeteer 脚本需要读 live editor state（isGridMode / gridSize / camera z），通过 window 暴露避免 monkey-patch 内部。生产无副作用（仅 1 行赋值），调试价值高。
6. **snap 指示线覆盖为黑**：tldraw 默认 `--color-snap: hsl(0, 76%, 60%)` 饱和红，包豪斯 6 色 red 保留给 inbox/capture region（语义），canvas snap 线用黑更克制（注册标尺感）。
7. **0 新依赖**：沿用 `@tldraw/tldraw@3.15.6` + Phase 1-4 全套组件 + 全 token。
8. **mobile hint + dividers + 百分比隐藏**：390px 视口工具条横向溢出（pre-existing，Phase 4 就有但被掩盖）。Phase 5 加 snap/zoom 后溢出加剧到 SNAP tag 还在视口外。**隐藏 hint + dividers + pct 让 snap tag 可见**，但 zoom 按钮在 390px 仍溢出（不可点）—— 已知问题，记录到后续，**完整 mobile toolbar 重排是 Phase 5+ 工作**。

---

## 与 spec 的差距（已知 / 后续 phase）

| 项 | 现状 | 后续 phase |
|---|---|---|
| 视图持久化（zoom/pan/gridMode 写 `canvases.viewJson`） | 不持久化（刷新回默认 zoom=1 + gridMode=snap）| Phase 5+（Lean 排除） |
| Delete 键与 DB 同步（tldraw Delete → `CardService.softDelete`）| tldraw Delete 只删 shape，刷新从 DB 回来 | Phase 5+（Lean 排除） |
| 自定义 snap threshold / 缩放曲线 / 旋转 snap | 全用 tldraw 默认 | 后续打磨 |
| tldraw chrome 完整换肤（菜单/工具条全方位包豪斯化）| 仅 8px 点阵背景 + hideUi | 后续 |
| inbox → canvas send 动作 | 无（双击建卡为主路径）| Phase 5+ |
| 多画布 UI / `/canvas?id=` 深链 | spec §1.4 / §6.12 预留 | 留后 |
| mobile toolbar 横向溢出（snap tag 在 390px 可见，但 zoom 按钮溢出）| hint/dividers/pct 隐藏让出空间 | Phase 5+ mobile polish |
| 缩放步进固定 2x（tldraw 默认）| 不可配置 | YAGNI |

---

## 验收对照（spec §4.3 / §5.4 / §8）

- ✅ `pnpm --filter domain test` — 10 全绿（Phase 5 不改 domain）
- ✅ `pnpm --filter db test` — 7 全绿（Phase 5 不改 db）
- ✅ `pnpm --filter web build` — exit 0，10 个静态页（含 `/canvas`）
- ✅ spec §8 Phase 5 四件：网格 snap/free / 缩放控件 / 对齐指示线 / 视觉整合
- ✅ 6 色 hex / 字体 / 8px 网格 / 黑 region 条 仍对
- ✅ `features/canvas/` + `app/canvas/` hex grep 零命中
- ✅ 10 截图 + 视觉对照笔记
- ✅ puppeteer 6/6 交互断言全过