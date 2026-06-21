# Phase 6.5d 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-6.5d/`(4 张)
> 测试:puppeteer-core + 系统 Chrome 驱动 `apps/web` dev server(端口 3016)

---

## 结论

**Phase 6.5d 核心承诺达成(spec §4.3 gridMode + Phase 5 closeout 已知/后续):画布 zoom/pan/gridMode 状态跨刷新保留。** 走 web-local localStorage key `cys-stift.canvas-view.v1`(同 draft-store 模式),**domain / db 零改动**,0 新依赖。

puppeteer 6/6 断言全过:
- ✓ 默认:zoom 1, pan 0,0, isGridMode true
- ✓ Zoom in ×2 → 400%(原 Phase 5 倍进:100 → 200 → 400)
- ✓ `g` 切 free → isGridMode false
- ✓ Pan drag 触发 → camera 变化
- ✓ localStorage 持久化:{zoom:4, panX:-540, panY:-319.5, gridMode:'free', gridSize:8}
- ✓ Reload 后全保留
- ✓ 零 page error

---

## 4 张截图

| 文件 | 内容 |
|---|---|
| `01-canvas-default.png` | 默认状态:100% / SNAP 8 / camera (0,0,1) |
| `02-canvas-zoomed-200.png` | Zoom in ×2 → 400%(toolbar 显示)|
| `03-canvas-panned.png` | Pan drag 后:camera 已位移 |
| `04-canvas-after-reload.png` | Reload 后状态保留:400% + pan 偏移 + SNAP 8 标签(注:SNAP 标签是 gridSize 标签固定显示,gridMode 内部已是 free)|

---

## 视觉契约

- [x] 视觉契约不变(Phase 4-5 已定);view 持久化不影响视觉
- [x] 6 色 token / 字体 / 8px 网格 不破
- [x] `lib/canvas-view-store.ts` + `features/canvas/` hex grep 零命中

---

## 关键工程决策

1. **web-local localStorage key**(`cys-stift.canvas-view.v1`,与 `cards` / `drafts` 分离):view 是 UI 状态,非核心业务实体,不进 domain。
2. **单 canvas 视图(MVP)**:不分 canvasId;spec §4.9 schema `canvases.viewJson` 列留位,Phase 8 Tauri 替换时再走 domain `CanvasService.updateView`。
3. **`hydrateOnce()` 在 `get()` / `update()` 调用**:同步读 localStorage,**避免**首次 mount 时把默认值写回覆盖持久值(原 bug 修复)。
4. **`editor.user.updateUserPreferences({isSnapMode})`**:Phase 5 closeout 决策,不是 `updateInstanceState({user})`(后者类型不接受)。
5. **`editor.store.listen()` 无 scope**(默认全监听):`scope: 'document'` 不触发,与 Phase 4 canvas-binding 同款用法。
6. **防抖 500ms**:`pan 1px` 不写 localStorage,只在停止 500ms 后一次写入;同 canvas-binding 防抖 300ms 思路。
7. **cleanup 在 `editor.dispose` 注入**:tldraw 卸载时清 timer + unsub + 调 prev dispose。
8. **0 新依赖** + **domain / db 零改动**。

---

## 已知 / 后续

- Phase 8 Tauri fs 替换 localStorage 时,view 进 `canvases.viewJson` 列 + domain `CanvasService.updateView`
- 多画布 view 分 canvasId → spec §4.9 schema 留位,UI 留后
- 视图 history(回到上次)→ 留后

---

## 测试方式

```bash
pnpm --filter domain test   # 10 tests
pnpm --filter db test       # 7 tests
pnpm --filter web build     # exit 0,12 静态页
pnpm --filter web dev --port 3016 &
node scripts/p6.5d-shots.cjs   # 6/6 assertions pass
```