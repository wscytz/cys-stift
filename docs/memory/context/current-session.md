# 当前会话交接（Phase 4 → Phase 5）

> 用途：spec §9.1 指定的跨会话/跨模型延续档。compact、切模型都不丢。
> 写入时机：Phase 4 closeout 后，下次启动时由新会话/新模型先读此档。
> 每次有重要进展（plan 写完、closeout 完成等）必须回写更新本档。

---

## 阶段定位（接 Phase 5 用）

- **当前**：Phase 4 ✅（commit `57d7b16`，tag `v0.5.0-phase-4`，git clean）
- **下一个**：**Phase 5 — Canvas 完整**（spec §8 行 648–661：网格 / 自由模式、缩放、对齐）
- **状态锚点**：`/Users/jinxunuo/projects/cys-stift/CLAUDE.md`（根项目锚点，任何会话都先读）

---

## Phase 5 范围种子（按事实清单，不是我建议）

来自三处明确的"给 Phase 5"清单，整理为**必做**和**可选**两类：

### ✅ Phase 5 必做（spec §8 + Phase 4 closeout 共识）
1. **网格 snap** — 8px 步进；位置/尺寸吸附（spec §4.3 gridSize=8，§5.4 点阵背景已有）
2. **自由模式切换** — `CanvasView.gridMode: 'snap' | 'free'` 切换 UI
3. **缩放控件 UI** — zoom in / zoom out / zoom to fit 显式按钮（Phase 4 隐藏了 tldraw chrome）
4. **对齐辅助线** — snap 模式自动出（tldraw v3 内置 snapping）

### ❓ Phase 5 选做（closeout 标 Phase 5+，需用户决定是否纳入本阶段）
5. **视图持久化** — `canvases.viewJson` 的 `zoom/pan/gridMode` 防抖回写
   - 前提：domain 需补 `CanvasService.updateView` + `CanvasRepository.update`（目前都不存在）
   - schema 列已就位（spec §4.9），无任何读写代码
6. **Delete 键同步打磨** — tldraw Delete 只删 shape（刷新从 DB 回来）；需桥接到 `CardService.softDelete`

---

## 现有 tldraw 集成的关键代码位置

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/canvas/`：

| 文件 | 做什么 |
|---|---|
| `tldraw-canvas.tsx` | 客户端挂载守卫 + `useEffect` 内 `import('./canvas-editor')`（动态 import 边界） |
| `canvas-editor.tsx` | `<Tldraw shapeUtils hideUi onMount>` + §6.11 load/writeback 接线 + DOM dblclick 监听 |
| `card-shape-util.tsx` | `CardShapeUtil extends BaseBoxShapeUtil`，白底黑边 8px 圆角，CSS variable token |
| `canvas-binding.ts` | §6.11 数据流；含 `cardShapeIdOf` / `cardIdFromShapeId` / `loadCardsIntoEditor` / `bindCardWriteback`（300ms 防抖）/ `addCardShape` / `updateCardShape` / `removeCardShape` |
| `card-detail-modal.tsx` | 复用 Phase 3 `MarkdownBody`；view/edit + archive/soft-delete |
| `default-canvas.ts` | `DEFAULT_CANVAS_ID = toCanvasId('default-canvas')`（spec §1.4 单画布） |

`apps/web/src/app/canvas/page.tsx` — `/canvas` production 路由，editor handle 经 `onEditorReady` 提到 page 层。

---

## tldraw v3 踩坑清单（接 Phase 5 的人不要重新踩）

> 锁版本：**tldraw v3.15.6**（不是 v5）。npm latest 已 v5.1.x，但 v5 peer 要 React ≥19.2.1。我们 React 19.0.0 pinned。升 React 必须先确认 tldraw 兼容矩阵。

1. **shape id 必须 `shape:` 前缀** — tldraw 强校验；`cardShapeIdOf` 加前缀，`cardIdFromShapeId` 剥前缀。
2. **动态 import 边界在 `tldraw-canvas.tsx`** — tldraw 模块加载时访问 `window`，静态导出预渲染期会炸。`useEffect` 内 `import('./canvas-editor')`。tldraw ~2.1MB 独立 chunk，懒载不污染其他路由首屏。
3. **`mergeRemoteChanges` 避自激** — 加载用 `editor.store.mergeRemoteChanges(() => createShape)` 标 remote 源；写回监听 `store.listen({source:'user'})` 只听用户拖动。
4. **`pointerEvents: none` on HTMLContainer** — 否则 HTML 覆盖层吞 pointer、tldraw 拖不动卡片。Phase 5 卡内仍无交互需求，保持 `none`。
5. **`changes.updated` value 是 `[from, to]` 元组** — 不是 `{before, after}`。用 `change?.[1]` 取 after。
6. **`TLRecord.type` 访问需窄化** — `TLPage` 没有 type；先 `after?.typeName === 'shape' && after.type === 'card'`。
7. **`BaseBoxShapeUtil.indicator(shape)`** 是抽象方法，必须实现（返回 `<rect>`）。
8. **`verbatimModuleSyntax`** — `TLBaseShape` 必须 type-only import（`import { ..., type TLBaseShape }`）。
9. **`@tldraw/tldraw/tldraw.css`** — 顶层静态 `import`，动态 `import()` CSS TS 会报（CSS 无 JS export）。
10. **tldraw "Made with tldraw" 徽章** — 免费版 license 必需署名，**保留**（上 license 后才可去）。

---

## 验证命令（Phase 5 验收同 Phase 4）

```bash
pnpm --filter domain test           # domain vitest（必须全绿；Phase 5 若扩 CanvasService 会加测试）
pnpm --filter db test               # db 集成测试（必须全绿；Phase 5 视图持久化会触 schema）
pnpm --filter web build             # Next.js 静态导出（必须 exit 0；/canvas 路由不能炸）
python3 -m http.server 3016 --directory apps/web/out    # 模拟 Tauri 静态托管
node scripts/pN-shots.cjs           # puppeteer 截图 + 交互断言（参考 p4-shots.cjs 模式）
```

---

## 纪律提示（接 Phase 5 必须遵守）

- ❌ 不要修改 `docs/superpowers/specs/2026-06-19-cys-stift-design.md`（五轮定稿）
- ❌ 不要重新选型 / 不要加未要求依赖（YAGNI）
- ❌ 不要在组件层写死 hex/像素值（全 token）
- ❌ 不要破坏 `packages/domain` 的零依赖特性
- ❌ 不要假装 build/test 通过
- ❌ 不要输出假 `<promise>` 跳过验收
- ✅ 静态导出：no SSR / no API routes / no Server Actions / no `[param]` 路由；客户端状态走 Modal/tab
- ✅ `useDb()` snapshot 引用必须稳定（`useSyncExternalStore`）
- ✅ 提交到 main + tag；Conventional Commits
- ✅ Phase plan 写到 `docs/superpowers/plans/YYYY-MM-DD-phase-N-<slug>.md`
- ✅ 流程：写 plan → self-review → 用户 review → 实现 → 四件套 closeout（changelog / decisions / MEMORY / tag + 根 CLAUDE.md 状态推进）

---

## Phase 4 已通过的事项（不要重新怀疑）

- tldraw v3 + React 19.0.0 + Next 15 静态导出可挂载渲染（puppeteer 零 page error）
- §6.11 数据绑定：DB `cards.canvasPosition` 单一真相源；拖动 → 300ms 防抖 → `moveToCanvas` 回写
- 位置持久化跨刷新：puppeteer 断言 100 → 320 → 320 ✅
- 双击空白建卡 / 双击卡开详情 / 编辑标题实时反映 / 归档即时移除 全部断言通过
- 6 色 token + Space Grotesk/Inter/JetBrains Mono + 8px 网格 + 黑 region 条 在 /canvas 仍对
- `features/canvas/` 内 hex grep 零命中

---

## 下一步（接 Phase 5 第 1 步）

1. **读**：`docs/superpowers/specs/2026-06-19-cys-stift-design.md` §4.3 / §5.4 / §6.11 / §8 / §12 风险（再核一遍）
2. **问用户**：Lean（仅 spec §8 4 件）vs Full（再加视图持久化 + Delete 键打磨）
3. **写**：`docs/superpowers/plans/2026-06-19-phase-5-<slug>.md`
4. **review**：self-review → 用户 review → 批准后实施