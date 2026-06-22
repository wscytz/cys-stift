# Phase multi-canvas · 多画布 UI(2026-06-20)

> 承接 spec §4.9 schema 早已支持多画布,web 端只缺最后一块 UI 留后。
> Plan:[`docs/plans/2026-06-20-multi-canvas.md`](../../plans/2026-06-20-multi-canvas.md)
> Tag:**v0.15.0-multi-canvas**

## 背景

`packages/domain/src/services/canvas-service.ts`(Phase 2)已有 `CanvasService.create / get / listForWorkspace`,`Canvas` 类型(`types.ts:108`)完整(id / workspaceId / name / view / createdAt / updatedAt)。Card 的 `canvasPosition.canvasId` 是 `CanvasId`,`CardService` 有 `moveToCanvas / removeFromCanvas / listOnCanvas`。

但 web 端没接入:
- `apps/web/src/lib/db-client.ts` 只暴露 `CardService`,**没有 CanvasService**
- `apps/web/src/features/canvas/default-canvas.ts` 硬编码 `DEFAULT_CANVAS_ID = 'default-canvas'`,所有 canvas 操作(画布创建 / inbox send-to-canvas / canvas view 持久化)都用这个 hardcoded id
- 用户无法新建第二个画布,无法在多个画布间切换

## 决策

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 存储 | 接入 `CanvasService` (db 包) / **web-local canvasStore** | **web-local** | db 包的 `CanvasService` 接收 repository,Tauri fs 替换时再用;MVP 与 cards/drafts/media 等 5 个 web-local store 模式一致,Phase 8 Tauri 时公共 API 不变。 |
| 入口 UI | 自造 popover dropdown / **native `<select>`** | **native select** | a11y 0 成本(键盘 / mobile / screen reader 都内建);工具栏 32px 高度适配;自造需 50+ 行代码无收益。 |
| Delete 行为 | 拒绝 active(用户先切) / **删 active 自动 fallback default** | **fallback** | UI 更直:用户点 Delete 不需先切。`delete` 方法检测 wasActive 后改 activeCanvasId。 |
| Delete 默认画布 | 允许 / **拒绝** | **拒绝** | default 是 seed,删了 store 重新 seed 但 UI 闪烁不友好;`if (id === DEFAULT_CANVAS_ID) return false` + Delete 按钮 disabled。 |
| Delete 前卡处理 | 直接删(静默丢失) / **`removeFromCanvas` 把卡回 inbox** | **回 inbox** | 防止卡被画布"吞掉"——用户删画布后在 inbox 看到所有回流的卡。 |
| 切画布时 editor | 保留同一 editor / **`<TldrawCanvas key={canvasId}>` remount** | **remount** | `loadCardsIntoEditor` 只在 onMount 跑一次;不 remount 会有 stale shapes。 |
| Create 命名 dedup | 报错 / **自动加 " (N)"** | **dedup** | store 永远不出现重复名,UI 直觉("Project B" 已有则 "Project B (2)")。 |
| inbox send-to-canvas | 改用 activeCanvasId / **保持 hardcode DEFAULT** | **hardcode** | 扩到 activeCanvasId 需 inbox 接 canvasStore,扩大 scope;记入 plan 留后。 |
| view 持久化分 canvasId | 是 / **否(MVP 单值)** | **否** | `cys-stift.canvas-view.v1` 仍是单值;spec §4.9 支持,plan 留后。 |

## 改动清单(2 文件 + 1 e2e + 1 决策档 + 1 决定档)

### `apps/web/src/lib/canvas-store.ts`(新,~200 行)

- `CanvasesSnapshot { canvases: Canvas[]; activeCanvasId: CanvasId }`
- `STORAGE_KEY = 'cys-stift.canvases.v1'`
- `WORKSPACE_ID = toWorkspaceId('default')`(MVP 单 workspace,Phase 4+ multi-tenant)
- `SEED_CANVAS`:`DEFAULT_CANVAS_ID` + 名字 "default canvas" + 默认 view + epoch(0) 排序最前
- 永远 seed DEFAULT(如果 store 已有但 activeCanvasId 不在,fallback 到 DEFAULT)
- 模块单例 + `hydrateOnce()` + `notify()` + `getSnapshot()` stable ref + `useSyncExternalStore` + `useCanvases()` hook
- API:`get() / setActive(id) / create(name) / rename(id, name) / delete(id) -> boolean`
- `delete` 拒绝 DEFAULT,删 active 时 fallback active = DEFAULT
- `create` dedup:名字已存在则 `name (2)`,以此类推
- isCanvas / isSnapshot runtime type guards
- crypto.randomUUID 优先,failback `Date.now + Math.random` 拼 id

### `apps/web/src/app/canvas/page.tsx`(改)

- import 加 `canvasStore, useCanvases` + `Modal` from `@cys-stift/ui` + `CanvasId` from domain
- 新 state:`creatingName / renamingId / confirmDeleteId`
- `onCanvas` 从 `activeCanvasId` 算
- 工具栏中央加 `<CanvasSwitcher />` + `+New` / `Rename` / `Delete` ghost 按钮
- 新 `CanvasSwitcher` 子组件:native `<select>` + ✎ 按钮(点击变 inline `<input class="crename">`,Enter 提交,Esc 取消,blur 提交)
- 新 `+New` Modal(input class `cinput` autofocus,Enter 提交,Create button)
- 新 `Delete` Modal(显示画布名 + "N card(s) on this canvas will move back to the inbox.")
- `<TldrawCanvas key={activeCanvasId}>` 切画布 remount
- styles 字符串加 `.cselect` / `.cselect-edit` / `.crename` / `.cinput` / `.confirm__body` / `.confirm__actions`(沿用 archive batch confirm 命名空间)

### `scripts/multi-canvas-shots.cjs`(新,~165 行)

- seed 1 卡在 default canvas
- /canvas:卡 visible(1 shape),switcher 显示 default canvas,Delete 按钮 disabled
- +New "Project B" → 切到 Project B(0 shapes),switcher 2 项
- 切回 default → 卡 visible(1 shape)
- Project B → rename "Project C"(inline input + Enter)
- Project C → Delete → confirm Modal → 确认 → store 列表 ["default canvas"] + active 回到 default
- 切回 default → Delete 按钮再次 disabled(seed 守恒)
- 15 断言全过 + 0 page error

## 验证(实跑 exit code)

```
pnpm --filter domain test     → 17 passed(回归,本次未改 domain)
pnpm --filter db test         →  7 passed
pnpm --filter web build       → exit 0, 14 静态页(不变)
                              /canvas 484 → 486 kB(+2 kB 切换器 / 2 Modals)

10 个 e2e 全过:
node scripts/multi-canvas-shots.cjs       → PASS ✓ 15/15(新)
node scripts/p7-shots.cjs                 → ✓ ALL ASSERTIONS PASS
node scripts/p6.5b-shots.cjs              → ✓ ALL ASSERTIONS PASS
node scripts/trash-shots.cjs              → PASS ✓ 7/7
node scripts/archive-detail-shots.cjs     → PASS ✓ 15/15
node scripts/batch-soft-delete-confirm-shots.cjs → PASS ✓ 15/15
node scripts/canvas-refactor-shots.cjs    → PASS ✓ 5/5
node scripts/send-back-shots.cjs          → PASS ✓ 7/7
node scripts/import-rollback-shots.cjs     → ✓ ALL ASSERTIONS PASS
node scripts/p6.5d-shots.cjs              → ✓ ALL ASSERTIONS PASS
```

## 关键工程决策(总结)

- **web-local canvasStore(非 domain CanvasService)**:MVP 与现有 5 个 store 模式一致,Phase 8 Tauri 时可再迁或保持。
- **native `<select>`**:0 成本 a11y,工具栏高度适配。
- **`<TldrawCanvas key={canvasId}>` remount**:`loadCardsIntoEditor` 只 onMount,切画布 remount 防 stale。
- **删除前 `removeFromCanvas`**:卡在画布上静默消失?先回 inbox,user 在 inbox 看到所有回流卡。
- **删除 active 自动 fallback default**:`delete` 检测 wasActive 改 active = DEFAULT,无需 UI 提示"先切再删"。
- **dedup 命名**:store 永远不出现重复名。
- **inbox send-to-canvas / view 持久化分 canvasId 仍单值**:MVP scope 收口,记入 plan 留后。

## 显式留后(均已记 plan)

- inbox "Send to canvas" 用 activeCanvasId(MVP 仍 hardcode DEFAULT)
- canvas view 持久化按 canvasId 拆分
- workspace 多 workspace 切换(spec §4.6 留位)
- 拖卡跨画布(drag to canvas)
- 画布排序 / 收藏
- "switch to canvas X" URL hash 直链
- 暗色模式 / 标签搜索 / OPFS / 录屏
- Phase 8 Tauri build + 签名公证

## 纪律遵守

- ❌ 没改 spec · 没重新选型 · 没加依赖 · 没破坏 domain 零依赖
- ✅ 实跑 exit code:`pnpm --filter web build` exit 0;10 个 e2e 全过
- ✅ 静态导出 14 页不变
- ✅ commit + tag;Conventional Commits
- ✅ closeout 四件套

## 关键文件位置

| 想知道什么 | 看哪里 |
|---|---|
| 本 phase plan | `docs/plans/2026-06-20-multi-canvas.md` |
| 共享 store | `apps/web/src/lib/canvas-store.ts`(新) |
| UI 接入 | `apps/web/src/app/canvas/page.tsx` |
| e2e | `scripts/multi-canvas-shots.cjs` |
| 截图 | `docs/design/screenshots/phase-multi-canvas/` |