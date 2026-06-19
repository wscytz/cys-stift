# 当前会话交接（Phase 5 → Phase 6）

> 用途：spec §9.1 指定的跨会话/跨模型延续档。compact、切模型都不丢。
> 写入时机：每完成一个 phase closeout 时回写。
> 启动时由新会话/新模型先读此档。

---

## 阶段定位

- **当前**：Phase 5 ✅（commit 待打，tag `v0.6.0-phase-5`；snap/free + 缩放 + snap 指示线 + 键盘快捷键；git 干净）
- **下一个**：**Phase 6 — Inbox 完整**（spec §8 路线图：多媒介编辑 / 全局快捷键 / mini input）
- **状态锚点**：`/Users/jinxunuo/projects/cys-stift/CLAUDE.md`（根项目锚点，任何会话都先读）

---

## Phase 5 关键交付速览

- `apps/web/src/app/canvas/page.tsx`：工具条右侧 SNAP/FREE 切换 + 缩放 4 按钮（−/%/+/FIT）+ 键盘快捷键（`+ - 0 1 g`）+ mobile media query
- `apps/web/src/features/canvas/canvas-overrides.css`（新）：snap 指示线覆盖为 `var(--color-black)` 1px（tldraw 默认饱和红冲突）
- `apps/web/src/features/canvas/tldraw-canvas.tsx`：导入 canvas-overrides.css
- `apps/web/src/features/canvas/canvas-editor.tsx`：`isGridMode: true` + `gridSize: 8` + `window.__canvasEditor` 诊断 hook
- `scripts/p5-shots.cjs` + `docs/design/screenshots/phase-5/`（10 截图）+ `README.md` 视觉笔记
- **0 新依赖** + **domain/db 零改动**（视图持久化 Lean 排除）

puppeteer 6/6 断言全过：snap 488%8==0 / free 747%8!=0 / zoom 100→800% / fit all-in / 键盘 g / 零 error。

---

## Phase 5 关键工程决策（接 Phase 6 别再踩）

1. **`useState<Editor>` 替代 `useRef<Editor>`** — Phase 4 用 ref 留坑（ref 不触发 re-render，toolbar 永远 disabled）。Phase 6 若再加依赖 editor handle 的 UI，**必须用 state**。
2. **tldraw v3 snap 真开关是 `editor.updateInstanceState({ isGridMode })`**，**不是** `editor.user.updateUserPreferences({ isSnapMode })`（后者只翻 Ctrl 反转）。两者要同步。
3. **tldraw v3 默认 `gridSize: 10`**（不是 8）。spec §4.3 要 8，**必须** onMount 显式 `editor.updateDocumentSettings({ gridSize: 8 })`。
4. **`useValue` hook 从 `@tldraw/tldraw` 顶层可用**（通过 `@tldraw/editor` re-export `@tldraw/state-react`）。
5. **缩放步进是 tldraw v3 默认 2x**（不是 context7 文档说的 1.5x）。验收断言用 `> previous` 不要 hardcode 1.5 倍数。
6. **`window.__canvasEditor` 诊断 hook**：puppeteer 读 live editor state 用，后续 phase 调试时也方便。生产无副作用。
7. **缩放按钮用本地 `<button>` 而非 `@cys-stift/ui` Button**——Button 40px 高 + padding 大不适合 47px 黑条内紧凑布局。本地按钮 32px，颜色/边框全走 token。

---

## Phase 6 范围种子

按 spec §8 路线图，Phase 6 = "Inbox 完整"：多媒介编辑 / 全局快捷键 / mini input。需要 Phase 6 plan 时再读：
- spec §6.3（Inbox / capture）+ §1.3 + §2 数据模型
- Phase 3 closeout（`docs/development/changelog.md` phase 3 段）已知/后续
- Phase 3 plan（`docs/superpowers/plans/2026-06-20-phase-3-inbox.md`）"❌ 没做"段
- 现有 inbox 代码：`apps/web/src/app/inbox/page.tsx`

---

## 现有 Canvas 代码（接 Phase 6 也别忘了）

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/canvas/`：

| 文件 | 做什么 |
|---|---|
| `tldraw-canvas.tsx` | 客户端挂载守卫 + 动态 `import('./canvas-editor')` |
| `canvas-editor.tsx` | `<Tldraw shapeUtils hideUi onMount>` + onMount 设 isGridMode/gridSize + 诊断 hook + dblclick 监听 |
| `card-shape-util.tsx` | `CardShapeUtil extends BaseBoxShapeUtil`，白底黑边 8px 圆角 |
| `canvas-binding.ts` | §6.11 数据流；防抖 300ms |
| `card-detail-modal.tsx` | 复用 Phase 3 `MarkdownBody`；view/edit + archive/soft-delete |
| `canvas-overrides.css` | Phase 5 新增：snap 指示线黑色 1px |
| `default-canvas.ts` | `DEFAULT_CANVAS_ID` |

`apps/web/src/app/canvas/page.tsx` 持有 `[editor, setEditor] = useState<Editor|null>`（注意：state 不是 ref）。

---

## 纪律提示（接 Phase 6 必须遵守）

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

## 已通过事项（不要重新怀疑）

### Phase 0-5 全部通过
- **Phase 0** — monorepo + Next.js 静态导出 + Tauri 壳 + 包豪斯占位首屏
- **Phase 1** — packages/ui 组件库（7 组件）+ /design 视觉契约页
- **Phase 2** — domain + db (drizzle/SQLite) + /dev/db 烟测页 + 持久化证据
- **Phase 3** — /inbox production 路由 + 多媒介表单 + 详情/编辑/归档 + Markdown 渲染
- **Phase 4** — /canvas + tldraw v3 + Card ShapeUtil + §6.11 DB 真相源（位置跨刷新持久化）
- **Phase 5** — snap/free + 缩放控件 + snap 指示线 + 键盘快捷键（spec §8 4 件）

### 不变量
- 6 色 token + Space Grotesk/Inter/JetBrains Mono + 8px 网格 + 黑 region 条 在所有路由都对
- `features/canvas/` + `app/canvas/` hex grep 零命中
- domain 10 tests + db 7 tests 全绿
- `pnpm --filter web build` exit 0，10 个静态页（含 /canvas）

---

## 下一步（接 Phase 6 第 1 步）

1. **读**：spec §6.3 / §1.3 / §2 + Phase 3 plan "❌ 没做"段 + 现有 inbox 代码
2. **问用户**：范围确认（Lean / Full）
3. **写**：`docs/superpowers/plans/YYYY-MM-DD-phase-6-<slug>.md`
4. **review**：self-review → 用户 review → 批准后实施