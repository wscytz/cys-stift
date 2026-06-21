# Phase canvas-refactor · useEffect 驱动 canvas-editor(2026-06-20)

> 承接 `docs/memory/decisions/2026-06-19-review-findings.md` 的 #4 + #5。
> 原始 review 给的标准修法:"把 onMount 里的 listener/timer 提到 React `useEffect`,以 editor 为 dep,cleanup 不猴补丁"。
> Plan:[`docs/superpowers/plans/2026-06-20-canvas-editor-refactor.md`](../../superpowers/plans/2026-06-20-canvas-editor-refactor.md)
> Tag:**v0.11.0-canvas-refactor**

## 背景

review 时只剩 #4 `editor.dispose` 猴补丁 + #5 `editor.store.listen` 无 filter 两个脆弱点(产品决策 #2 已在 `v0.10.0-trash` 关掉)。原 plan:"留到动 canvas 时一起重构成 useEffect"。本次是第一次动 canvas-editor,**顺势关闭两条**,无功能变化。

两条都集中在 `canvas-editor.tsx` 的 `Tldraw.onMount` 回调里(原 :53-104)。把副作用全堆在 onMount 不是 React-y 的写法:tldraw 实例的"准备好" ≠ React 组件的"挂载",副作用应该跟 React 生命周期走,而不是依赖 tldraw 内部清理路径。

## 决策

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| editor handle 流向 | page ref / **page state + 下传 prop** / editor ref 上传 | **page state + 下传 prop** | page 已有 `useState<Editor\|null>(null)`(Phase 5 提升,给 CardDetailModal 用 onSave/onArchive/onDelete 同步 shape),**复用同一 handle**作为 prop 给 canvas-editor。无新 state、无新 ref。 |
| view 持久化机制 | editor.store.listen + scope filter / **useValue 订阅** | **useValue** | tldraw 已有响应原语(`useValue('key', () => editor.getX())`),ZoomGroup 已用过,React-friendly;**完全跳过 listen 的"所有 store changes"问题**(#5 根因)。 |
| dblclick 监听 | wireDoubleClick onMount + 隐式 cleanup / **useEffect + add/removeEventListener** | **useEffect** | 旧实现靠 tldraw 卸载容器时事件自然回收(隐式 lifetime);新实现显式 cleanup,React 卸载时确定 listener 已移除(#4 根因)。 |
| onOpenCard deps | 直接 deps / **ref 中转** | **ref** | page `onOpenCard={(card) => setDetail({card})}` 每次 render 新函数;不绕 ref 会让 effect 每次 render 重订(add/remove listener)。 |
| 改的层 | 只 canvas-editor / **canvas-editor + page 1 行** | **canvas-editor + page 1 行** | page 必须把 editor 传下来;TldrawCanvas 已 `{...props}` 透传,无需改。 |
| scope | 只改 view 持久化 / **view + dblclick** | **view + dblclick** | 两条都是 onMount 的副作用,一次关掉,不留半成品。 |

## 改动清单(3 文件 + 1 e2e + 4 决策档)

### canvas-editor.tsx(主改动,~150 行 → ~180 行,纯重写 onMount + 拆两个 bridge 组件)

- 接收新 prop `editor: Editor \| null`
- onMount 只剩一次性副作用:view apply + loadCardsIntoEditor + bindCardWriteback + `__canvasEditor` + onEditorReady
- `<ViewPersistenceBridge editor={editor} />`:
  - `useValue('cvp camera', () => editor?.getCamera(), [editor])`
  - `useValue('cvp isGridMode', () => editor?.getInstanceState().isGridMode, [editor])`
  - useEffect deps `[editor, cam?.z, cam?.x, cam?.y, isGrid]` → 500ms setTimeout → canvasViewStore.update;cleanup `clearTimeout`
- `<DoubleClickBridge editor canvasId service onOpenCard />`:
  - `useRef` 存 onOpenCard + service 引用(避免 effect 重订)
  - useEffect deps `[editor, canvasId]` → `editor.getContainer().addEventListener('dblclick', ...)`;cleanup `removeEventListener`
- 全删:`editor.store.listen(callback)` 无 filter;`editor.dispose = () => {...}` 猴补丁
- 保留:`onEditorReady` callback、`__canvasEditor` 诊断句柄

### page.tsx(1 行)

```diff
- <TldrawCanvas service={service} canvasId={...} onOpenCard={...} onEditorReady={...} />
+ <TldrawCanvas service={service} canvasId={...} editor={editor} onOpenCard={...} onEditorReady={...} />
```

### TldrawCanvas.tsx(0 改动)

`{...props}` 已透传,加 `editor` 自动跟着传。

### scripts/canvas-refactor-shots.cjs(新,~180 行)

- seed 1 卡 + 设 view (zoom 1, snap)
- 反复切 /canvas ↔ /inbox × 4 → 相机稳定 + 0 page error
- 设 view (zoom 2, free, pan -120,-60) → reload → 全部还原
- **拖卡 → view-store 持久化 0 写入**(#5 核心断言:before === after 深相等)
- 双击空白处建第 2 张卡
- 0 page error(剔除 Next dev mode favicon 404 的 console noise)

### p6.5d-shots.cjs(回归,0 改动)

跑一次,确认 view 持久化行为完全不变。结果:**✓ ALL ASSERTIONS PASS**(zoom 4 / pan -540,-319.5 / free 全部跨 reload 保留)。

## 验证(实跑 exit code)

```
pnpm --filter domain test     → 15 passed(回归)
pnpm --filter db test         →  7 passed(回归)
pnpm --filter web build       → exit 0, 14 静态页(不变),canvas chunk 体积 484 kB(不变)
node scripts/p6.5d-shots.cjs              → ✓ ALL ASSERTIONS PASS(view 持久化行为不变)
node scripts/canvas-refactor-shots.cjs    → PASS ✓ (5/5 断言)
  ├─ cameraStable       = true(4 次切换后稳定)
  ├─ reloadRestored     = true(zoom 2 / free / pan -120,-60 还原)
  ├─ viewUnchangedDrag  = true(拖卡 view-store 0 写入 — #5 核心)
  ├─ dblClickWorks      = true(双击建卡成功)
  └─ noErrors           = true(0 page error)
```

## 关键工程决策(总结)

- **`useValue` > `editor.store.listen(callback)`**:tldraw 响应原语精确订阅标量,跳过 listen 全量订阅。功能等价但零浪费。
- **副作用按 lifetime 分**:onMount 一次性(view apply + binding 装载)vs bridge useEffects 响应式(view 持久化 + dblclick)。React 卸载时 bridge cleanup 自动跑,不依赖 tldraw 内部清理路径。
- **回调 ref 中转**:避免 page 每次 render 新函数导致 bridge effect 重订 listener;这是 React useEffect 的常见反模式。
- **最小 page.tsx 改动**:1 行 prop 透传,逻辑零变化。
- **保留诊断句柄**:`window.__canvasEditor` 给 puppeteer 用,本 phase e2e 仍依赖它。

## 显式留后(未要求,YAGNI)

- canvas dblclick 走 captureSinkRegistry(plan 提过;当前实现是直接 `service.create` + `addCardShape`,能用,不动)
- 多画布 UI(spec §4.9 schema 已支持;MVP 单 canvas)
- view 持久化迁到 domain `CanvasService.updateView`(Phase 8 Tauri 时统一,公共 API 不变)
- "重置 view" 按钮(已知 UX 缺口)
- 拖卡期间显示辅助线 / 网格高亮(纯视觉,留后)
- canvas 离线编辑(Phase 8 Tauri)

## 纪律遵守

- ❌ 没改 spec · 没重新选型 · 没加依赖 · 没破坏 domain 零依赖
- ✅ 实跑 exit code:`pnpm --filter web build` exit 0;两个 e2e PASS
- ✅ 静态导出 14 页不变(无新增路由)
- ✅ canvas chunk 体积不变(484 kB)
- ✅ commit 到 main + tag;Conventional Commits
- ✅ closeout 四件套

## 关键文件位置

| 想知道什么 | 看哪里 |
|---|---|
| 本 phase plan | `docs/superpowers/plans/2026-06-20-canvas-editor-refactor.md` |
| 主改动 | `apps/web/src/features/canvas/canvas-editor.tsx` |
| page 1 行 | `apps/web/src/app/canvas/page.tsx`(editor prop) |
| e2e | `scripts/canvas-refactor-shots.cjs` |
| view 持久化回归 | `scripts/p6.5d-shots.cjs`(未改,跑通) |
| 截图 | `docs/design/screenshots/phase-canvas-refactor/` |
