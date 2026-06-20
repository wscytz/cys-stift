# Plan · Phase multi-canvas · 多画布 UI(2026-06-20)

> 承接 spec §4.9(schema 早支持,但 UI 缺最后一块 — 留后很久)。
> Plan:补 UI 层,**domain CanvasService 已就绪(Phase 2 实现 + 1 vitest),web 端接入 + canvas 切换/CRUD**。
> 本档是实施计划;执行者(主模型 Claude)照此推进 + 自审。

## 背景(为什么)

`packages/domain/src/services/canvas-service.ts`(Phase 2)已有 `CanvasService.create / get / listForWorkspace`,`Canvas` 类型(`types.ts:108`)有 id/workspaceId/name/view/createdAt/updatedAt。Card 的 `canvasPosition.canvasId` 已是 `CanvasId`,CardService 有 `moveToCanvas / removeFromCanvas / listOnCanvas`。

但 web 端没接入:
- `apps/web/src/lib/db-client.ts` 只暴露 `CardService`,**没有 CanvasService**
- `apps/web/src/features/canvas/default-canvas.ts` 硬编码 `DEFAULT_CANVAS_ID = 'default-canvas'`,所有 canvas 操作(画布创建/inbox send-to-canvas/canvas view 持久化)都用这个 hardcoded id
- 用户无法新建第二个画布,无法在多个画布间切换

MVP scope:补 web 端 canvas 列表 + 切换 + CRUD UI,**inbox "Send to canvas" 与 view 持久化在 MVP 中保持单画布行为**(向后兼容,不破坏现有测试)。

## 探索结论(已确认,别重造)

- **`Canvas` schema 完整**(`types.ts:108-115`):id / workspaceId / name / view / createdAt / updatedAt。view 字段就是 spec §4.3 的 CanvasView(zoom/pan/gridMode/gridSize)。
- **web 5 个 store 模式可复用**:`cards` / `drafts` / `media` / `canvas-view` / `settings`,都 `useSyncExternalStore` + stable snapshot + `hydrateOnce` + 模块单例 + `notify`。
- **canvas-store 选 web-local**(`cys-stift.canvases.v1`):Phase 8 Tauri fs 替换时公共 API 不变。
- **切画布 = 切 `activeCanvasId`** + canvas page 接收 prop(同 active editor prop 模式,v0.11 canvas-refactor 已用)。
- **inbox "Send to canvas" 仍用 `DEFAULT_CANVAS_ID`**(MVP 不动 inbox):多画布切换只对 `/canvas` 路由有效,其它路由不变。
- **canvas view 持久化仍按单 canvas**(MVP 不动):`cys-stift.canvas-view.v1` 仍是单值,切画布 view 不隔离。spec §4.9 说 view 可分 canvasId,留作下一 phase。
- **tldraw editor 切画布**:切时需要 remount tldraw 组件(`<Tldraw key={canvasId}>`)以避免 stale shapes — tldraw `loadCardsIntoEditor` 只在 onMount 一次性跑。

## 范围

### ✅ 做

**`apps/web/src/lib/canvas-store.ts`(新,~120 行)**:
- `CanvasesSnapshot { canvases: Canvas[]; activeCanvasId: CanvasId }`
- `STORAGE_KEY = 'cys-stift.canvases.v1'`
- seed:`DEFAULT_CANVAS_ID` 永远在 canvases 列表中(如果 store 为空,自动 seed;如果 store 已有但 activeCanvasId 不在列表,fallback 到 DEFAULT)
- 模块单例 + `hydrateOnce()` + `notify()` + `getSnapshot()` stable ref
- API:
  - `canvasStore.get()` — 同步读,内部 hydrate
  - `canvasStore.create(name: string)` — 新建 Canvas(name 去重处理),自动 activate
  - `canvasStore.rename(id, newName)` — 改名
  - `canvasStore.delete(id)` — 删除(MVP:refuse if `activeCanvasId === id`;user 先切换再删)
  - `canvasStore.setActive(id)` — 切画布
  - `canvasStore.subscribe(cb)` — internal
- hook `useCanvases(): { snapshot: CanvasesSnapshot; ready: boolean }`

**`apps/web/src/app/canvas/page.tsx`(改)**:
- 工具栏中央加 Canvas 切换下拉 + "+ New" + "Rename" + "Delete" 按钮(只在选中非 active 时可删)
- `useCanvases()` 读 activeCanvasId
- `<TldrawCanvas ... canvasId={activeCanvasId}>` 传 prop,TldrawCanvas 已透传
- `<TldrawCanvas key={activeCanvasId}>` remount(切画布时清空 tldraw store)
- `onCanvas` 数从 `service.listOnCanvas(activeCanvasId)` 读
- 删除画布时:有卡(`service.listOnCanvas(id).length > 0`)→ 弹 confirm Modal,确认后把该画布所有卡的 `canvasPosition` 清(回到 inbox);空画布直接删
- 新建画布:弹 inline input + "Create" / "Cancel"
- Rename 画布:点画布名变 input,Enter 保存 / Esc 取消

**`scripts/multi-canvas-shots.cjs`(新,~150 行)**:
- seed DEFAULT 画布 + 1 卡(`canvasPosition.canvasId = 'default-canvas'`)
- /canvas:打开,卡 visible,下拉显示 "default canvas"(seed 时名字)+ active
- 点 "+ New" → 输入 "Project B" → Enter → 下拉显示 "Project B",active 切换,canvas 显示空(无卡)
- 切回 "default canvas" → 卡重新 visible
- 切到 Project B → 点 "Rename" → 改 "Project C" → 列表显示 "Project C"
- 创建新 "scratch" 画布(active 切到 scratch),切回 Project C,点 "Delete" → confirm → 列表少 1
- 0 page error
- 7 断言全过

**回归**:`canvas-refactor` / `send-back` / `p6.5d` / `p4` / `p5` 全过(切画布是 canvas page 局部,不影响其它路由)

**closeout 四件套**:`changelog` / `decisions/2026-06-20-multi-canvas.md` / `MEMORY.md` / 根 `CLAUDE.md` / `current-session.md` + tag **`v0.15.0-multi-canvas`**。

### ❌ 不做(留后)

- inbox "Send to canvas" 用 activeCanvasId(MVP 保持 DEFAULT_CANVAS_ID)
- canvas view 持久化按 canvasId 拆分(spec §4.9 支持,留 phase 后)
- workspace 多 workspace 切换(spec §4.6 留位,UI 仅单 workspace)
- 拖卡跨画布(drag to canvas)MVP 没要
- 画布排序 / 收藏
- "switch to canvas X" 直链 URL hash(`/canvas#X`),MVP 用 page state

## 关键代码形态

**`canvas-store.ts` 核心**:

```ts
const STORAGE_KEY = 'cys-stift.canvases.v1'

interface CanvasesSnapshot {
  canvases: Canvas[]
  activeCanvasId: CanvasId
}

const SEED_CANVAS: Canvas = {
  id: DEFAULT_CANVAS_ID,
  workspaceId: WORKSPACE_ID,
  name: 'default canvas',
  view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'snap', gridSize: 8 },
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

let _snap: CanvasesSnapshot = { canvases: [SEED_CANVAS], activeCanvasId: DEFAULT_CANVAS_ID }

function load(): CanvasesSnapshot {
  // hydrate from localStorage; if missing DEFAULT, seed it
  // if activeCanvasId not in list, fallback to DEFAULT
}

export const canvasStore = {
  get(): CanvasesSnapshot { hydrateOnce(); return _snap },
  create(name: string): CanvasId { /* add + setActive + persist */ },
  rename(id: CanvasId, name: string): void { /* ... */ },
  delete(id: CanvasId): void {
    // refuse if active; user must switch first
    if (_snap.activeCanvasId === id) throw new Error('Cannot delete active canvas')
    /* remove + persist */
  },
  setActive(id: CanvasId): void { /* ... */ },
  subscribe(cb: () => void): () => void { /* ... */ },
}
```

**`canvas/page.tsx` 切换 UI**:

```tsx
const { snapshot, ready } = useCanvases()
const activeCanvasId = snapshot.activeCanvasId

// 工具栏加 dropdown
<CanvasSwitcher
  canvases={snapshot.canvases}
  activeId={activeCanvasId}
  onSwitch={(id) => canvasStore.setActive(id)}
  onCreate={(name) => canvasStore.create(name)}
  onRename={(id, name) => canvasStore.rename(id, name)}
  onDelete={(id) => {
    // clear cards on this canvas → inbox first
    for (const c of service.listOnCanvas(id)) {
      service.removeFromCanvas(c.id)
    }
    canvasStore.delete(id)
  }}
/>

<TldrawCanvas key={activeCanvasId} editor={editor} canvasId={activeCanvasId} ... />
```

## 纪律(执行时)

- ❌ 不改 spec · 不重新选型 · 不加未要求依赖 · 组件层不写死 hex(全 token) · 不破坏 domain 零依赖
- ✅ 静态导出:`/canvas` 是静态路由(非 `[param]`),active canvasId 用 page state 而非 URL — 静态导出无 dynamic route
- ✅ 实跑 exit code,不假装通过
- ✅ canvas-store 沿用 cards/drafts/media 等 web-local store 模式
- ✅ seed DEFAULT_CANVAS_ID 与现有 inbox/canvas/default-canvas 一致
- ✅ 切画布用 `<Tldraw key>` remount 避免 stale editor

## 验证(端到端)

```bash
pnpm --filter domain test     # 17 passed(本次未改 domain)
pnpm --filter db test         #  7 passed
pnpm --filter web build       # exit 0,14 静态页

# e2e
pnpm --filter web dev --port 3016 &
node scripts/multi-canvas-shots.cjs      # 新功能
node scripts/canvas-refactor-shots.cjs   # canvas 回归
node scripts/send-back-shots.cjs         # canvas 回归
node scripts/p6.5d-shots.cjs             # view 持久化回归
node scripts/p7-shots.cjs                # archive 回归
node scripts/p6.5b-shots.cjs             # inbox 回归
node scripts/trash-shots.cjs             # trash 回归
node scripts/archive-detail-shots.cjs    # archive detail 回归
node scripts/batch-soft-delete-confirm-shots.cjs  # batch confirm 回归
```

断言要点:create/rename/delete/switch 全过;切画布后 tldraw 显示对应卡的画布;删除非 active 画布 OK;0 page error;回归全过。