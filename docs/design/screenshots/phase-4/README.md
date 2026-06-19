# Phase 4 视觉 + 持久化对照笔记

> 截图：`docs/design/screenshots/phase-4/`（6 张）
> 测试：puppeteer-core + 系统 Chrome 驱动 `apps/web/out`
> 服务：`python3 -m http.server 3016 --directory apps/web/out`（模拟 Tauri 静态托管）

---

## 结论

**Phase 4 核心承诺达成（spec §6.11）**：tldraw v3 在 Next.js 15 静态导出 + React 19.0.0 下挂载渲染（零 runtime error）；卡片作为自定义 `ShapeUtil` 渲染；DB 的 `cards.canvasPosition` 是唯一真相源——拖动卡片 → 防抖回写 DB → 刷新页面位置仍在。

puppeteer §6.11 round-trip 断言：种子卡 x=100 → 拖动后 x=320（防抖回写）→ 刷新后 x=320（位置存活）。`movedOnDrag: true`、`persistedAcrossReload: true`。

---

## 6 张截图

| 文件 | 状态 |
|---|---|
| `01-empty-desktop.png` | 空画布：toolbar 黑 region 条（8px，`var(--color-black)`）+ 8px 点阵网格背景 + "double-click to create · drag to place" 提示 + 黑 Tag "0" + ← home |
| `02-cards-desktop.png` | 3 张多类型卡（note / link / code，含中文标题"灵感：包豪斯 8px 网格"）：白底 + 单线黑边 + 8px 圆角 + Space Grotesk 标题 + mono 类型标签；黑 Tag "3" |
| `03-cards-mobile.png` | 390px 视口：toolbar + 画布响应式正常 |
| `04-detail-modal.png` | 双击卡片 → 详情 Modal（view 模式）：类型 Tag + Markdown 正文 + links/code/quotes 段 + Edit / Archive / Soft-delete |
| `05-create-modal.png` | 双击空白 → 建卡 Modal（edit 模式）：Title 输入（红 focus 下划线）+ Body textarea + Save / Cancel |
| `06-home-entries.png` | 首页：Inbox（红）+ Canvas（黑）两个入口并列 |

---

## 持久化证据（§6.11，puppeteer 自动断言）

```
seedX:        100
beforeDragX:  100   (loaded from DB → tldraw shape)
afterDragX:   320   (drag → editor.store.listen('user') → 防抖 300ms → moveToCanvas → DB)
afterReloadX: 320   (刷新 → listOnCanvas → 位置存活)
movedOnDrag:          true
persistedAcrossReload: true
pageErrors: []
```

T4 流程断言（双击建卡 + Modal 编辑 + 归档）：

```
modalOpenedOnCreate:      true   (双击空白 → 建卡 + 开 Modal)
savedAndClosed:           true   (保存 → 切回 view 模式)
titleOnCanvasAfterSave:   true   (标题经 updateCardShape 实时反映到画布)
persistedAfterReload:     true
openExistingCardModal:    true   (双击已有卡 → 详情 Modal)
archivedHiddenFromCanvas: true   (归档 → removeCardShape，即时消失)
archivedHiddenAfterReload: true  (loadCardsIntoEditor 过滤 archived)
pageErrors: []
```

---

## 视觉对照笔记（spec §5.4 / §5 / §6.3）

### Canvas 视觉骨架（§5.4）
- ✅ 8px **黑条** region 标识（toolbar 左 8px 列，`var(--color-black)` = rgb(10,10,10)，DOM 实测 8×47px）
- ✅ 8px **点阵网格**背景（`.tl-background` radial-gradient，`var(--color-gray)` 0.8px 点，8px 间距）
- ✅ tldraw 渲染卡片为自定义 shape

### 6 色 token 仍对
- Canvas region 黑条 = `var(--color-black)` ✅
- 卡片白底 = `var(--color-white)`、黑边 = `var(--border-hairline)`（currentColor）✅
- 类型 Tag 黑 = `var(--color-black)` ✅
- 详情 Modal：Edit focus 红 = `var(--color-red)`、Archive secondary、Soft-delete danger 红 ✅
- 代码块 `var(--color-black)` 底 + `var(--color-white)` 字 ✅

### 字体 + 网格
- 卡片标题 Space Grotesk（`var(--font-display)`）✅
- 类型标签 / 面包屑 / 提示 mono caps（`var(--font-mono)`）✅
- 卡片间距、padding、圆角（`var(--radius-sm)` 2px）走 token，8px 节奏 ✅
- `features/canvas/` 内 **hex grep 零命中**（颜色全走 `var(--color-*)`）

### 组件复用（packages/ui）
- Toolbar region="canvas"（黑条）
- Tag（黑计数）
- Modal（详情 + 软删二次确认）
- Input（under-line focus 变红）、Button（primary/secondary/danger/ghost）

---

## 关键工程决策

1. **tldraw v3.15.6（非 v5）**：spec 写 v3；npm latest 已到 v5.1.1，但 v5 peer 要求 React ≥19.2.1（我们 pin 19.0.0），v3.15.6 peer `^18.2.0 || ^19.0.0` 正好匹配 + spec 对齐 + 不动 React。锁 v3。
2. **客户端懒载 + 挂载守卫**：tldraw 模块加载时访问 `window`，静态导出预渲染期会炸。动态 import 边界划在 `tldraw-canvas.tsx`（`useEffect` 内 `import('./canvas-editor')`）——tldraw 代码只在浏览器 mount 后加载。build 验证 + puppeteer 真渲染零 error。tldraw ~2.1MB 独立 chunk，懒载不污染其他路由首屏。
3. **shape id = `shape:` + cardId**：tldraw 强制 shape id 以 `shape:` 前缀（`shape ID must start with "shape:"`）。cardToShape 加前缀，回写时 `cardIdFromShapeId` 剥前缀还原 domain CardId——shape 与卡往返一致。
4. **`mergeRemoteChanges` 避自激**：加载卡片时用 `editor.store.mergeRemoteChanges(() => createShape)` 把变更标 remote 源，写回监听 `store.listen({source:'user'})` 只听用户拖动，不触发回写循环。
5. **`pointerEvents: none` on HTMLContainer**：卡片 HTML 覆盖层若 `pointerEvents:'all'` 会吞掉 pointer，tldraw 拖不动卡片。Phase 4 卡无内部交互，设 `none` 让 tldraw 接管选中/拖拽；开详情走 tldraw 双击事件（DOM dblclick + `getShapeAtPoint` 判空白 vs 卡）。
6. **`hideUi`**：隐藏 tldraw 冗余 chrome（形状工具条 / 菜单），保留选中/拖拽/缩放手柄。网格/缩放/对齐控件留 Phase 5。
7. **editor handle 经 `onEditorReady` 提到 page**：Modal 在 page 层，save/archive/delete 后用 binding helper（`updateCardShape`/`removeCardShape`，均 mergeRemoteChanges）把变更同步回 tldraw——标题实时反映、归档/删除即时移除。
8. **domain / db 零改动**：`CardService.create/listOnCanvas/moveToCanvas` + canvas 列 + 索引（Phase 2）已就绪；archived/deleted 过滤在 `loadCardsIntoEditor` 里做（不动 domain 的 `listOnCanvas`）。

---

## 与 spec 的差距（已知 / 后续 phase）

| 项 | 现状 | 后续 phase |
|---|---|---|
| 网格 snap / free 切换 | 屏幕空间点阵（装饰）；无吸附 | Phase 5 |
| 缩放控件 UI / 对齐辅助线 | tldraw 默认相机，无显式 UI | Phase 5 |
| 画布视图持久化（viewJson zoom/pan） | 不持久化 | Phase 5+ |
| inbox → canvas send 动作 | 无（双击建卡为主路径） | Phase 5+ |
| tldraw chrome 完整换肤 | 仅点阵 + hideUi | 后续 |
| Delete 键删 shape vs DB 同步 | tldraw Delete 只删 shape（刷新后卡从 DB 回来）；MVP 以 Modal 软删为准 | Phase 5 打磨 |
| tldraw "Made with tldraw" 徽章 | 保留（免费版 license 必需署名） | 上 license 后可去 |

---

## 验收对照

- ✅ `pnpm --filter domain test` — 10 tests 全绿（Phase 4 不改 domain）
- ✅ `pnpm --filter db test` — 7 tests 全绿（Phase 4 不改 db）
- ✅ `pnpm --filter web build` — exit 0，10 个静态页（含 `/canvas`）
- ✅ §6.11 持久化跨刷新（puppeteer 断言 100→320→320）
- ✅ 双击建卡 / 点卡详情 / 编辑 / 归档 全流程（puppeteer 断言）
- ✅ 截图覆盖：空画布 / 多卡 / 移动 / 详情 Modal / 建卡 Modal / 首页入口
- ✅ 视觉契约（6 色 / 字体 / 网格 / 黑 region 条）未破
- ✅ `features/canvas/` hex grep 零命中
