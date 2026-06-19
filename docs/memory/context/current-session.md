# 当前会话交接(P6.5b → P6.5c inbox→canvas send)

> 用途:spec §9.1 指定的跨会话/跨模型延续档。compact、切模型都不丢。
> 写入时机:每完成一个 phase closeout 时回写。
> 启动时由新会话/新模型先读此档。

---

## 阶段定位

- **当前**:P6.5b ✅ Inbox 多媒介编辑(详情 Modal edit 暴露 links/code/quotes editor + editors 抽 features/card 共享 + Phase 3 hint 移除;tag `v0.8.2-phase-6.5b`;git 干净)
- **下一个**:**P6.5c inbox → canvas send**(路线图 `docs/development/roadmap.md` §1 下一行)—— 详情 Modal 加 "Send to canvas" 按钮,卡片发送后出现在 `/canvas`
- **状态锚点**:`/Users/jinxunuo/projects/cys-stift/CLAUDE.md`(根项目锚点)+ `docs/development/roadmap.md`(30 轮路线图)

---

## 执行模式(2026-06-19 起生效)

**用户授权:跑 30 轮(主 agent,不开 subagent),按 `docs/development/roadmap.md` §1 顺序一直做下去,完成一个就开下一个,合适时自动 compact。Ralph 自动循环已装但 max=0=无限,本会话不依赖其自动行为,按 plan 推进。**

- 路线图 §1 表是权威执行顺序
- 每轮 = 一个 phase(写 plan → 实现 → 验收 → commit + tag + 六件套 closeout)
- 失败 5 轮未解决 → stuck mode 写 `docs/memory/decisions/*-stuck.md`
- 30 轮硬上限用完 → 强制收尾

---

## P6.5b 关键交付速览

- `apps/web/src/features/card/editors.tsx`(新):`ListEditor` / `CodeEditor` / `QuoteEditor` + `editorStyles` + `draftLinksToPayload` / `draftCodesToPayload` / `draftQuotesToPayload` 转换函数
- `apps/web/src/app/inbox/page.tsx`(改):详情 Modal `CardDetail` 编辑模式暴露 3 editor + `onSave` 扩 5 字段 patch + Phase 3 hint 移除
- `apps/web/src/app/inbox/create-card-form.tsx`(改):从本地编辑器实现改为 import 自 features/card/editors
- `scripts/p6.5b-shots.cjs`(新):7 项交互断言 + 6 截图
- `docs/design/screenshots/phase-6.5b/`(6 PNG + README)
- **domain / db 零改动** + **0 新依赖**(`update can swap multi-media arrays` vitest 已覆盖)

puppeteer 7/7 断言全过。

---

## P6.5b 关键工程决策(接 P6.5c 别再踩)

1. **editors 抽到 `features/card/editors.tsx`** 是 P6.5b 重构成果 → P6.5c 任何"在详情 Modal 加新功能"直接复用,不重写 editor。
2. **`CardService.update` 白名单已含 links/codeSnippets/quotes** → P6.5c 加 `sendToCanvas` 新业务方法时,优先复用已有,不重复扩 patch。
3. **`editorStyles` 导出共享 CSS** + 每个 consumer `<style>{editorStyles}</style>` → P6.5c 加新组件用同一 .le* 时复用。
4. **state 同步 useEffect deps 多字段模式** → P6.5c 如果加 "on canvas" badge / 派生 state,沿用同样模式。
5. **Canvas `CardDetailModal` 仍独立**(Phase 4 实现,只 title + body)→ P6.5c 之后考虑统一(避免现在触碰 tagged Phase 4)。
6. **Archive tile onClick 不接通**(Lean)→ 后续 P6.5+ 或独立 phase;不引入 query string 处理。

---

## P6.5c 范围种子(下一个 phase)

Inbox → canvas send:
- 新建 `CanvasService.sendToCanvas(cardId, canvasId = DEFAULT_CANVAS_ID)`:复制 card 到 canvases(同 cardId 还是新 id? — spec §4.2 倾向同 cardId,canvas 通过 listOnCanvas 拉)
- **决策**:用 `canvasId` nullable 外键(spec §4.9 canvases 表留好);`CardService.create` 默认 null,inbox→canvas 时设 `canvasId`
- inbox 详情 Modal 加 "Send to canvas" 按钮 → `CanvasService.sendToCanvas(cardId)`
- inbox 卡片详情 Modal 区分 "已送画布" 状态:badge "On canvas" + 跳画布按钮
- 画布已有同一 cardId 则跳过(service 校验)

需要 P6.5c plan 时再读:
- spec §4.2 `Card.canvasId` + §4.9 `canvases` 表
- Phase 4 closeout `docs/memory/decisions/2026-06-19-phase-4.md`
- Phase 4 plan `docs/superpowers/plans/2026-06-19-phase-4-canvas.md`
- 现有 canvas 代码:`apps/web/src/features/canvas/`
- 现有 db schema:`packages/db/src/schema.ts`

---

## 现有 Card 编辑器(Phase 6.5b 新增)

`/Users/jinxunuo/projects/cys-stift/apps/web/src/features/card/`:

| 文件 | 做什么 |
|---|---|
| `editors.tsx` | ListEditor + CodeEditor + QuoteEditor + editorStyles + draft→payload 转换 |

`apps/web/src/app/inbox/page.tsx` 的 `CardDetail` 用 editors 实现 edit mode;`apps/web/src/app/inbox/create-card-form.tsx` 也用。

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
| `card-detail-modal.tsx` | 复用 Phase 3 `MarkdownBody`;view/edit + archive/soft-delete(只 title+body)|
| `canvas-overrides.css` | snap 指示线黑色 1px |
| `default-canvas.ts` | `DEFAULT_CANVAS_ID` |

`apps/web/src/app/canvas/page.tsx` 持有 `[editor, setEditor] = useState<Editor|null>`。

---

## 纪律提示(接 P6.5c 必须遵守)

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

### Phase 0-7 + P6.5a/b 全部通过
- **Phase 0** — monorepo + Next.js 静态导出 + Tauri 壳 + 包豪斯占位首屏
- **Phase 1** — packages/ui 组件库(7 组件)+ /design 视觉契约页
- **Phase 2** — domain + db (drizzle/SQLite) + /dev/db 烟测页 + 持久化证据
- **Phase 3** — /inbox production 路由 + 多媒介表单 + 详情/编辑/归档 + Markdown 渲染
- **Phase 4** — /canvas + tldraw v3 + Card ShapeUtil + §6.11 DB 真相源
- **Phase 5** — snap/free + 缩放控件 + snap 指示线 + 键盘快捷键
- **Phase 6** — 全局快捷键 + Mini Input + WebCaptureSink
- **Phase 7** — /archive 网格/时间轴 + 多选批量 + 蓝条 region
- **P6.5a** — 草稿自动保存(防抖 500ms + 关闭重开恢复 + 提交清除)
- **P6.5b** — Inbox 多媒介编辑(editors 抽 features/card + 详情 Modal 暴露 3 类)

### 不变量
- 6 色 token + Space Grotesk/Inter/JetBrains Mono + 8px 网格 在所有路由都对
- `features/` + `app/` + `lib/` 各 phase hex grep 零命中
- domain 10 tests + db 7 tests 全绿
- `pnpm --filter web build` exit 0,12 个静态页(含 /archive)

---

## 下一步(接 P6.5c 第 1 步)

1. **读**:spec §4.2 + §4.9 + Phase 4 closeout 已知/后续 + 现有 canvas + db schema
2. **写**:`docs/superpowers/plans/2026-06-19-phase-6.5c-inbox-to-canvas.md`
3. **实现** + 验收(CanvasService.sendToCanvas + 详情 Modal "Send to canvas" 按钮 + Card.canvasId 字段)
4. **四件套 closeout**

**第 5 轮起**(roadmap 0.5 + P7 1.5 + P6.5a 1.0 + P6.5b 1.0 = 4 轮;P6.5c = 第 5 轮)。30 轮预算剩余 ~25 轮。