# 当前会话交接(P6.5a → P6.5b inbox 多媒介编辑)

> 用途:spec §9.1 指定的跨会话/跨模型延续档。compact、切模型都不丢。
> 写入时机:每完成一个 phase closeout 时回写。
> 启动时由新会话/新模型先读此档。

---

## 阶段定位

- **当前**:P6.5a ✅ 草稿自动保存(防抖 500ms 写 web-local localStorage + 关闭重开恢复 + 提交清除;tag `v0.8.1-phase-6.5a`;git 干净)
- **下一个**:**P6.5b inbox 多媒介编辑**(路线图 `docs/development/roadmap.md` §1 下一行)—— 详情 Modal 编辑模式暴露 links/codeSnippets/quotes 编辑器
- **状态锚点**:`/Users/jinxunuo/projects/cys-stift/CLAUDE.md`(根项目锚点)+ `docs/development/roadmap.md`(30 轮路线图)

---

## 执行模式(2026-06-19 起生效)

**用户授权:跑 30 轮(主 agent,不开 subagent),按 `docs/development/roadmap.md` §1 顺序一直做下去,完成一个就开下一个,合适时自动 compact。**

- 路线图 §1 表是权威执行顺序
- 每轮 = 一个 phase(写 plan → 实现 → 验收 → commit + tag + 六件套 closeout)
- 失败 5 轮未解决 → stuck mode 写 `docs/memory/decisions/*-stuck.md`
- 30 轮硬上限用完 → 强制收尾

---

## P6.5a 关键交付速览

- `apps/web/src/lib/draft-store.ts`(新):`DraftStore` 单例 + `useDraft` hook + localStorage 持久化;`Draft.payload: unknown` 各自 cast
- `apps/web/src/lib/use-debounced-callback.ts`(新):通用防抖 hook,unmount cleanup
- `apps/web/src/features/capture/mini-input.tsx`(改):`useDraft('capture')` 恢复 + 防抖 upsert + 提交/clear 时 `draftStore.clear`
- `apps/web/src/app/inbox/create-card-form.tsx`(改):`useDraft('manual')` 恢复 + 防抖 upsert 完整表单状态 + reset 时 `draftStore.clear`
- `scripts/p6.5a-shots.cjs`(新):7 项交互断言 + 6 截图
- `docs/design/screenshots/phase-6.5a/`(6 PNG + README)
- **domain / db 零改动** + **0 新依赖**

puppeteer 7/7 断言全过。

---

## P6.5a 关键工程决策(接 P6.5b 别再踩)

1. **草稿独立 localStorage key**(`cys-stift.drafts.v1`,与 `cys-stift.cards.v1` 分离)→ P6.5b 任何"草稿式"持久化都遵循此模式(独立 key + 不污染 domain)。
2. **草稿不进 domain**(web-local UI 状态)→ P6.5b 任何 UI 草稿/临时状态同理。
3. **`unknown` payload + 消费方 cast**→ P6.5b 多媒介草稿也用此模式(避免类型耦合)。
4. **防抖 500ms + useDebouncedCallback hook**→ P6.5b 任何字段级持久化复用。
5. **Escape 保留 / 提交清除 / 空草稿自动 clear**→ P6.5b 多媒介编辑器的草稿逻辑同理。
6. **snapshot 引用稳定** + **restore 用 `[ready]` deps** → P6.5b 任何 useSyncExternalStore 同模式。
7. **CreateCardForm 改造不破坏 Phase 3 多媒介**:只加 useEffect 草稿读写 + 防抖 upsert,不动表单结构 → P6.5b 详情 Modal 编辑模式同理(扩 patch 白名单 + 暴露 editor,不破坏 view)。

---

## P6.5b 范围种子(下一个 phase)

Inbox 多媒介编辑(详情 Modal 改 links/codeSnippets/quotes):
- 抽 `ListEditor` / `CodeEditor` / `QuoteEditor` 从 `inbox/page.tsx` 到 `apps/web/src/features/card/`
- 详情 Modal 编辑模式暴露 3 个 editor(已抽的 editor 复用)
- 提交走 `CardService.update(id, {links, codeSnippets, quotes})`(需扩 `update` 白名单,domain 零改动只增字段白名单)
- 草稿复用 P6.5a:`useDraft('edit-card')` 存正在编辑的 cardId + 草稿状态

需要 P6.5b plan 时再读:
- spec §4.2 `Card.links / codeSnippets / quotes` + §4.8 `CaptureInput` 字段
- Phase 3 closeout `docs/memory/decisions/2026-06-19-phase-3.md` 已知/后续段
- Phase 3 plan `docs/superpowers/plans/2026-06-20-phase-3-inbox.md` "❌ 没做"段
- 现有 inbox 代码:`apps/web/src/app/inbox/page.tsx` (详情 Modal)
- 现有 CreateCardForm editor:`apps/web/src/app/inbox/create-card-form.tsx` (ListEditor/CodeEditor/QuoteEditor)

---

## 现有 Capture 代码(Phase 6)

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/capture/`:

| 文件 | 做什么 |
|---|---|
| `capture-sink.ts` | `interface CaptureSink` + `class WebCaptureSink` |
| `mini-input.tsx` | Mini Input 组件(spec §5.5 视觉 + P6.5a 草稿)|
| `capture-host.tsx` | 挂 `keydown` 监听 + `useDb()` + 单实例 Mini Input |

`apps/web/src/app/layout.tsx` 挂 `<CaptureHost />`(root layout)。

---

## 现有 Archive 代码(Phase 7)

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/archive/`:

| 文件 | 做什么 |
|---|---|
| `archive-card-tile.tsx` | `ArchiveCardTile` tile+row 双 variant(蓝条 + meta + 选中态 checkbox)|
| `timeline.tsx` | 日分组(UTC)+ 行式卡片堆叠 |

`apps/web/src/app/archive/page.tsx` 持有 `view: 'grid' \| 'timeline'` + `selectMode: boolean` + `selected: Set<CardId>` 状态。

---

## 现有 Canvas 代码(Phase 4-5)

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/canvas/`:

| 文件 | 做什么 |
|---|---|
| `tldraw-canvas.tsx` | 客户端挂载守卫 + 动态 `import('./canvas-editor')` |
| `canvas-editor.tsx` | `<Tldraw shapeUtils hideUi onMount>` + snap/gridSize + dblclick |
| `card-shape-util.tsx` | `CardShapeUtil` 白底黑边 8px 圆角 |
| `canvas-binding.ts` | §6.11 数据流;防抖 300ms |
| `card-detail-modal.tsx` | 复用 Phase 3 `MarkdownBody`;view/edit + archive/soft-delete |
| `canvas-overrides.css` | snap 指示线黑色 1px |
| `default-canvas.ts` | `DEFAULT_CANVAS_ID` |

`apps/web/src/app/canvas/page.tsx` 持有 `[editor, setEditor] = useState<Editor|null>`。

---

## 纪律提示(接 P6.5b 必须遵守)

- ❌ 不要修改 `docs/superpowers/specs/2026-06-19-cys-stift-design.md`(五轮定稿)
- ❌ 不要重新选型 / 不要加未要求依赖(YAGNI)
- ❌ 不要在组件层写死 hex/像素值(全 token)
- ❌ 不要破坏 `packages/domain` 的零依赖特性
- ❌ 不要假装 build/test 通过
- ❌ 不要输出假 `<promise>` 跳过验收
- ✅ 静态导出:no SSR / no API routes / no Server Actions / no `[param]` 路由
- ✅ `useDb()` snapshot 引用必须稳定(`useSyncExternalStore`)
- ✅ 提交到 main + tag;Conventional Commits
- ✅ Phase plan 写到 `docs/superpowers/plans/YYYY-MM-DD-phase-N-<slug>.md`
- ✅ 流程:写 plan → 实现 → 四件套 closeout(changelog / decisions / MEMORY / tag + 根 CLAUDE.md 状态推进)
- ✅ 30 轮路线图:`docs/development/roadmap.md`

---

## 已通过事项(不要重新怀疑)

### Phase 0-7 + P6.5a 全部通过
- **Phase 0** — monorepo + Next.js 静态导出 + Tauri 壳 + 包豪斯占位首屏
- **Phase 1** — packages/ui 组件库(7 组件)+ /design 视觉契约页
- **Phase 2** — domain + db (drizzle/SQLite) + /dev/db 烟测页 + 持久化证据
- **Phase 3** — /inbox production 路由 + 多媒介表单 + 详情/编辑/归档 + Markdown 渲染
- **Phase 4** — /canvas + tldraw v3 + Card ShapeUtil + §6.11 DB 真相源
- **Phase 5** — snap/free + 缩放控件 + snap 指示线 + 键盘快捷键
- **Phase 6** — 全局快捷键 + Mini Input + WebCaptureSink
- **Phase 7** — /archive 网格/时间轴 + 多选批量 + 蓝条 region
- **P6.5a** — 草稿自动保存(防抖 500ms + 关闭重开恢复 + 提交清除)

### 不变量
- 6 色 token + Space Grotesk/Inter/JetBrains Mono + 8px 网格 在所有路由都对
- `features/` + `app/` + `lib/` 各 phase hex grep 零命中
- domain 10 tests + db 7 tests 全绿
- `pnpm --filter web build` exit 0,12 个静态页(含 /archive)

---

## 下一步(接 P6.5b 第 1 步)

1. **读**:spec §4.2 + §4.8 + Phase 3 closeout 已知/后续 + 现有 inbox 详情 Modal + CreateCardForm editors
2. **写**:`docs/superpowers/plans/2026-06-19-phase-6.5b-multi-media-edit.md`
3. **实现** + 验收(抽 features/card/ editors + 详情 Modal 暴露 + CardService.update 白名单扩)
4. **四件套 closeout**

**第 4 轮起**(roadmap 0.5 + P7 1.5 + P6.5a 1.0 = 3 轮;P6.5b = 第 4 轮)。30 轮预算剩余 ~26 轮。
