# 当前会话交接（Phase 5 → Phase 6）

> 用途：spec §9.1 指定的跨会话/跨模型延续档。compact、切模型都不丢。
> 写入时机：每完成一个 phase closeout 时回写。
> 启动时由新会话/新模型先读此档。

---

## 阶段定位

- **当前**：Phase 6 ✅（commit 待打，tag `v0.7.0-phase-6`；`Cmd/Ctrl+Shift+Space` 全局快捷键 + Mini Input + WebCaptureSink 走 `service.fromCapture`；git 干净）
- **下一个**：**Phase 7+ 候选**（Tauri 全局快捷键 / 菜单栏 / 编辑多媒介 / inbox→canvas send / 图片上传 / 草稿自动保存 / 快捷键自定义 / 多 CaptureSink 实现 / 手动 capture 改用 WebCaptureSink）
- **状态锚点**：`/Users/jinxunuo/projects/cys-stift/CLAUDE.md`（根项目锚点，任何会话都先读）

---

## Phase 6 关键交付速览

- `apps/web/src/features/capture/capture-sink.ts`（新）：`interface CaptureSink` + `class WebCaptureSink implements CaptureSink`（走 `service.fromCapture`，零运行时依赖，全部 `import type`）
- `apps/web/src/features/capture/mini-input.tsx`（新）：spec §5.5 视觉（居中浮层 + 2px 红边 + 顶部 8px 红条 + z-index 200 + Escape/Enter/Cmd+Enter 键盘）
- `apps/web/src/features/capture/capture-host.tsx`（新）：挂载 `keydown` 监听 + `useDb()` 注入 service + 单实例 Mini Input（root layout 挂载）
- `apps/web/src/app/layout.tsx`（改）：挂 `<CaptureHost />`（所有路由生效）
- `apps/web/src/app/page.tsx`（改）：首页新增 Capture 红条入口（decorative，无 onClick）
- `scripts/p6-shots.cjs` + `docs/design/screenshots/phase-6/`（9 截图）+ `README.md` 视觉笔记
- **0 新依赖** + **domain/db 零改动**（`service.fromCapture` 已有 + 1 个 vitest 覆盖）

puppeteer 8/8 断言全过：shortcut open / enter expands body / cmd+enter saves / source.kind=shortcut / persisted across reload / shortcut on /canvas / input guard / zero page errors。

---

## Phase 6 关键工程决策（接 Phase 7 别再踩）

1. **`CaptureSink` 接口放 `features/capture/` 而非 domain**：依赖倒置，web-local 接口 + 实现，domain 不感知。`CardService.fromCapture` 作为底层统一入口。**接 Phase 7 加新 sink（Tauri / menubar / webhook）时也放 `features/capture/`。**
2. **Mini Input 不复用 `<Modal>`**：z-index 200 vs 100，边框 2px 红 vs 1px 黑，**自建 `.mi-*` CSS**。Phase 7 若加同款弹层（如 inbox→canvas 的 "send to canvas" 确认）也是同样策略。
3. **`Input` 不 forwardRef**（Phase 1 组件未支持）：用 `autoFocus` 兜底——Mini Input 早返 `null` 后再渲染那一拍浏览器触发。**Phase 7 若需 focus 别的 Input 也用 autoFocus。**
4. **首页 Capture 入口纯展示**（无 onClick）：避免 event bus；按快捷键即可。
5. **Enter 展开 body 用 `placeholder` 字符串判别 active element**：Mini Input 内只有一个 Input；ref 更鲁棒但 Input 不支持。**Phase 7 别的地方要判别 input 类型也用 placeholder / data 属性。**
6. **puppeteer 用 `Control+Shift+Space`**：macOS Chrome headless 模式 `Meta+Shift+Space` 被 Spotlight 系统级拦截；浏览器内 `Control` 跨平台一致，**真实用户 `Cmd+Shift+Space` 浏览器内仍工作**（CaptureHost 接受 `metaKey || ctrlKey`）。
7. **不重构 inbox CreateCardForm**（tagged Phase 3）：手动 capture 入口仍走 `service.create`（不绕道 WebCaptureSink）。**Phase 7+ 统一时**再改 CreateCardForm 走 WebCaptureSink.submit。
8. **0 新依赖**：沿用 react + domain + Phase 1 组件库。

---

## Phase 7+ 候选范围种子

按 spec + Phase 6 closeout 已知/后续：

### Tauri 端（apps/desktop 实施后）
- **Tauri 全局快捷键**：`@tauri-apps/plugin-global-shortcut` 注册 `Cmd+Shift+Space`（OS 级，不需浏览器 focus）
- **Tauri 菜单栏 capture**：Tauri menu API 添 capture 入口
- 新增 `TauriCaptureSink implements CaptureSink` 放 `features/capture-tauri/`

### Inbox 完整
- **编辑多媒介**（详情 Modal 改 links/codeSnippets/quotes）：复用 Phase 3 CreateCardForm 的 `ListEditor` / `CodeEditor` / `QuoteEditor` 拆出来共享
- **inbox → canvas send 动作**：inbox 卡片右键或 detail Modal 加 "Send to canvas" 按钮，service.create 副本到画布

### 数据层扩展
- **图片上传 / MediaAsset 落盘**：spec §4.5 已声明需落盘基础设施
- **草稿自动保存**：spec §5.5 "输入即保存草稿到 SQLite"
- **快捷键自定义**：spec §5.5 "可在设置改"

### Capture 扩展
- **多 CaptureSink 实现**：webhook / mobile / alfred 5 个待实现
- **手动 capture 入口改用 WebCaptureSink**：unify inbox CreateCardForm

---

## 现有 Canvas 代码（接 Phase 7 也别忘了）

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

## 现有 Capture 代码（Phase 6 新增）

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/capture/`：

| 文件 | 做什么 |
|---|---|
| `capture-sink.ts` | `interface CaptureSink` + `class WebCaptureSink`（依赖倒置；接 Phase 7 加 TauriCaptureSink 等同结构）|
| `mini-input.tsx` | Mini Input 组件（spec §5.5 视觉 + z-index 200 + Escape/Enter/Cmd+Enter）|
| `capture-host.tsx` | 挂 `keydown` 监听 + `useDb()` + 单实例 Mini Input |

`apps/web/src/app/layout.tsx` 挂 `<CaptureHost />`（root layout，所有路由生效）。

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