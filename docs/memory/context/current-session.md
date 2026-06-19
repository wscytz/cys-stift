# 当前会话交接(Phase 7 → P6.5a 草稿自动保存)

> 用途:spec §9.1 指定的跨会话/跨模型延续档。compact、切模型都不丢。
> 写入时机:每完成一个 phase closeout 时回写。
> 启动时由新会话/新模型先读此档。

---

## 阶段定位

- **当前**:Phase 7 ✅(`/archive` 路由 + 网格/时间轴双视图 + 多选批量 + tag `v0.8.0-phase-7`;git 干净)
- **下一个**:**P6.5a 草稿自动保存**(路线图 `docs/development/roadmap.md` §1 下一行)—— Mini Input + CreateCardForm 草稿 → SQLite(关闭重开恢复)
- **状态锚点**:`/Users/jinxunuo/projects/cys-stift/CLAUDE.md`(根项目锚点)+ `docs/development/roadmap.md`(30 轮路线图)

---

## 执行模式(2026-06-19 起生效)

**用户授权:跑 30 轮(主 agent,不开 subagent),按 `docs/development/roadmap.md` §1 顺序一直做下去,完成一个就开下一个,合适时自动 compact。**

- 路线图 §1 表是权威执行顺序
- 每轮 = 一个 phase(写 plan → 实现 → 验收 → commit + tag + 六件套 closeout)
- 失败 5 轮未解决 → stuck mode 写 `docs/memory/decisions/*-stuck.md`
- 30 轮硬上限用完 → 强制收尾

---

## Phase 7 关键交付速览

- `apps/web/src/app/archive/page.tsx`(新):`/archive` 路由 + 蓝条 Toolbar + grid/timeline tab + 多选 + 浮动工具条 + 空态
- `apps/web/src/features/archive/archive-card-tile.tsx`(新):`ArchiveCardTile` tile+row 双 variant 共用
- `apps/web/src/features/archive/timeline.tsx`(新):日分组(UTC)+ 行式卡片
- `apps/web/src/app/page.tsx`(改):首页加 Archive 蓝箭头入口 + footer 推进 phase 7 / v0.8.0
- `scripts/p7-shots.cjs`(新):8 截图 + 8 断言
- `docs/design/screenshots/phase-7/`(8 PNG + README)
- **domain / db 零改动**(复用 Phase 2/3 archive/unarchive/softDelete)+ **0 新依赖**

puppeteer 8/8 断言全过。

---

## Phase 7 关键工程决策(接 P6.5 别再踩)

1. **复用 `CardService` 已有方法**(archive/unarchive/softDelete)→ P6.5 加新业务方法时优先复用,domain/db 尽量零改动。
2. **Tile + Row 双 variant 共用一个组件**:P6.5 任何"网格 + 列表"双视图复用此模式(`variant` prop 切换)。
3. **多选 Set 状态不可变更新**:切换 selectMode / 批量操作后 `clearSelected()` 防泄漏。P6.5 多选场景同理。
4. **浮动工具条 z-index 50** < CaptureHost 200 < Modal 100;互斥显示无冲突。
5. **Archive 不开 detail modal**(避免触碰 tagged Phase 3 `CardDetail`)→ P6.5b 抽 `features/card/` 共享 detail modal 后,archive tile onClick 接通。
6. **时间轴日分组用 UTC ISO date** → P9 暴露本地时区。
7. **批量 soft-delete 不二次确认**(Lean,软删不真删)→ P9 JSON 导出前补二次确认。
8. **首页入口三色分明**:inbox 红 / canvas 黑 / archive 蓝 —— P6.5 加新入口(如 settings)选剩余 token(gray / yellow / white)保持包豪斯原色集。

---

## P6.5a 范围种子(下一个 phase)

草稿自动保存(spec §5.5 "输入即保存草稿到 SQLite"):
- `DraftService` 新增到 `packages/domain`(零依赖)
- `drafts` SQLite 表:`id / kind: 'capture' | 'manual' / payload: text(json) / updatedAt`
- Mini Input + inbox CreateCardForm 改动 → 防抖 500ms 写 DraftService.upsert
- 打开时先查 DraftService.get 填回
- 提交成功后清除
- **注意**:当前浏览器端 db-client 是 in-memory + localStorage(Phase 2),草稿表也要走同样的客户端存储;Phase 2.5(wa-sqlite + OPFS)统一替换

需要 P6.5a plan 时再读:
- spec §5.5(Mini Input "输入即保存草稿")
- Phase 6 closeout `docs/memory/decisions/2026-06-19-phase-6.md` 已知/后续段
- 现有 capture 代码:`apps/web/src/features/capture/`
- 现有 db-client:`apps/web/src/lib/db-client.ts`

---

## 现有 Archive 代码(Phase 7 新增)

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/archive/`:

| 文件 | 做什么 |
|---|---|
| `archive-card-tile.tsx` | `ArchiveCardTile` tile+row 双 variant(蓝条 + meta + 选中态 checkbox)|
| `timeline.tsx` | 日分组(UTC)+ 行式卡片堆叠 |

`apps/web/src/app/archive/page.tsx` 持有 `view: 'grid' | 'timeline'` + `selectMode: boolean` + `selected: Set<CardId>` 状态。

---

## 现有 Capture 代码(Phase 6)

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/capture/`:

| 文件 | 做什么 |
|---|---|
| `capture-sink.ts` | `interface CaptureSink` + `class WebCaptureSink` |
| `mini-input.tsx` | Mini Input 组件(spec §5.5 视觉)|
| `capture-host.tsx` | 挂 `keydown` 监听 + `useDb()` + 单实例 Mini Input |

`apps/web/src/app/layout.tsx` 挂 `<CaptureHost />`(root layout)。

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

## 纪律提示(接 P6.5 必须遵守)

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

### Phase 0-7 全部通过
- **Phase 0** — monorepo + Next.js 静态导出 + Tauri 壳 + 包豪斯占位首屏
- **Phase 1** — packages/ui 组件库(7 组件)+ /design 视觉契约页
- **Phase 2** — domain + db (drizzle/SQLite) + /dev/db 烟测页 + 持久化证据
- **Phase 3** — /inbox production 路由 + 多媒介表单 + 详情/编辑/归档 + Markdown 渲染
- **Phase 4** — /canvas + tldraw v3 + Card ShapeUtil + §6.11 DB 真相源
- **Phase 5** — snap/free + 缩放控件 + snap 指示线 + 键盘快捷键
- **Phase 6** — 全局快捷键 + Mini Input + WebCaptureSink
- **Phase 7** — /archive 网格/时间轴 + 多选批量 + 蓝条 region

### 不变量
- 6 色 token + Space Grotesk/Inter/JetBrains Mono + 8px 网格 在所有路由都对
- `features/` + `app/` 各 phase hex grep 零命中
- domain 10 tests + db 7 tests 全绿
- `pnpm --filter web build` exit 0,12 个静态页(含 /archive)

---

## 下一步(接 P6.5a 第 1 步)

1. **读**:spec §5.5 + Phase 6 closeout 已知/后续 + 现有 capture 代码 + db-client
2. **写**:`docs/superpowers/plans/2026-06-19-phase-6.5a-drafts.md`
3. **实现** + 验收(domain DraftService + drafts 表 + Mini Input/CreateCardForm 改造)
4. **四件套 closeout**

**第 3 轮起**(Phase 7 = 第 2 轮;roadmap = 第 1 轮 / 0.5)。30 轮预算剩余 ~27 轮。
