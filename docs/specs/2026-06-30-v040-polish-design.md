# v0.40 交互打磨设计

> 日期:2026-06-30
> 来源:用户 v0.40.0 手测反馈。功能已上来,交互逻辑需打磨。
> 范围:三块互相独立的交互打磨 — B(选择态清理)/ A(箭头拖拽手感)/ C(图谱状态维持)。
> 一份 spec,一个 plan,按 B → A → C 顺序实装,每块单独 commit + 手测。
> 配套 backlog(根因定位):`docs/specs/2026-06-30-v040-polish-backlog.md`
> 不含:D(AI 感知弱)— 等 UI 做完再 review,留作后续。

---

## B. 选择态清理

### 问题

画布选中一张卡后,切到别的画布 / 别的页面再回来,那张卡仍处于选中态。应切走即退出选择。

### 根因

- 选中态唯一源:`SelfBuiltAdapter.selectedIds`(实例字段,`packages/canvas-engine/src/self-built-adapter.ts:56`),局部于 adapter 实例,非全局 store。
- `apps/web/src/app/canvas/page.tsx:669-673` `switchCanvas` 只 `setDetail(null)` + `canvasStore.setActive(id)`,**没有 `adapter.setSelectedIds([])`**。
- 现状靠 `:1055` `<SelfCanvas key={activeCanvasId}>` 的隐式重建"顺带"清空 — 是 React key 的副作用,不是契约。一旦 key 改稳定值就泄漏。
- **路由离开 /canvas 再回来**(点顶栏去 /inbox、/search 等):不触发 key 变化,`CanvasPage` 实例 + adapter ref 在客户端路由间保留,选中态原样残留 — 这是用户实际遇到的场景。
- 已 clear 的入口(不动):点空白(:640)、Esc(:909)、删除(:929)。

### 设计

把"切走即清"从隐式副作用升级为显式契约,覆盖两个切走路径:

1. **切画布** — `switchCanvas`(page.tsx:669)在 `setActive` 前显式 `handle.current.adapter?.setSelectedIds([])`。即便 key 重建已隐式清,也显式做(契约化,防 key 防线被改)。

2. **路由离开 /canvas** — `CanvasPage` 加 `usePathname` effect:pathname 不以 `/canvas` 开头时,`adapter.setSelectedIds([])`。需先确认 `/canvas` page 是否在路由切换时保留实例(静态导出 + 持久 layout,实例应保留 — 见实现期验证);若 layout 真卸载 page,此 effect 退化为 no-op,不破坏。

3. 不引入全局 selection store(没必要 — selection 本就是 adapter 实例级瞬态,持久化无意义)。

### 验证

- 选中卡 → 切画布 → 切回:无选中。
- 选中卡 → 去 /inbox → 回 /canvas:无选中。
- 选中卡 → 点空白 / Esc:仍清(回归)。
- 卡片跳转切画布(pendingJumpCardRef,page.tsx:887):目标卡被主动选中是预期行为,不在此清理范围。

---

## A. 箭头拖拽手感

### 问题

从一张卡拖出箭头连到另一张卡(connect 工具)时:拖到一半卡顿;换目标时没拉到连线就消失了。

### 根因(双根因)

**根因 1 — 卡顿:渲染路径重(非状态机问题)**

- `self-built-adapter.ts:670-675` `onMove` 的 connect 分支每次 move 都 `scheduleRender()`。
- `renderNow()`(:104-169)每帧全量 `getElements()` + `sortByLayer`(O(n log n))+ 视口剔除 filter + `renderElements` 重绘所有可见元素 + 预览线。
- connect 预览未做增量 — 画布元素多时高频 pointermove → RAF 排队 → 视觉卡顿。
- 附带:`scheduleRender`(:95-102)虽有 `rafId` 去重(同帧多次调用只排一次 RAF),但每帧仍全量重绘。

**根因 2 — 中途消失:`pointercancel` 复用 `onUp` 在坏坐标 hitTest 失败(最可能真凶)**

- `:868` `pointercancel` 直接复用 `onUp`。`onUp` 的 connect 分支(:771-803)读 `e.clientX/clientY`(:773-774)做 hitTest(:776)。
- `pointercancel` 事件(系统手势 / 触屏多点 / OS 通知打断)的 clientX/clientY 可能是 0 或中断点 → `hitTest` 落空 → 不建箭头 → `connecting = null`(:796)→ 预览消失。
- 次要:`self-built-hittest.ts:99-101` card 命中是严格 bbox 内,无容差,松手偏 1px 即 `toId = null`。
- 次要:`onMove` connect 分支(:670-675)只更新坐标,move 过程中完全不判定目标(无高亮/吸附),用户无法判断是否对准。

### 设计

**双层渲染(修根因 1)**

- 静态层缓存:元素层排序 + 视口剔除结果缓存,依赖"元素集 + view"签名;不变时不重算。
- 预览层:connect 拖拽时只重绘预览线 + 目标高亮,不触发静态层重算。
- 缓存失效条件:元素 upsert/remove、view(zoom/pan)变化、selection 变化、undo/redo。其中 view 变化时视口剔除需重算,但元素层排序不变 — 拆分两层缓存粒度。
- 风险控制:不破坏现有 draw 路径(`renderNow` → `renderElements` → `drawSelectionOutlines` 顺序保留);加回归测试覆盖:元素增删后缓存失效、view 变化后视口剔除重算、预览层不污染静态层。
- 现有 `arrow-interaction-audit.test.ts` 回归 + 新增双层缓存测试。

**状态机修复(修根因 2)**

1. **`pointercancel` 不再复用 `onUp` 的 connect 判定** — 拆分:pointercancel 走"丢弃"路径,对 `connecting` 直接置 null,不做 hitTest、不建箭头。(其它 drag/resize/erase 态 pointercancel 仍复用 onUp 清理 — 那些是清理无副作用,只有 connect 的 hitTest 有副作用即"建错箭头/在坏坐标判定"。)
2. **松手 hitTest 给 card 加容差** — 沿用 arrow 的 6px 容差思路,card bbox 外扩几像素命中,偏几像素仍能连上。
3. **move 中目标高亮** — `onMove` connect 分支跑一次 hitTest,命中的目标卡描边高亮(token 蓝,复用 `drawSelectionOutlines` 的描边风格但用蓝区分);`connecting` 扩展 `toId?: string` 记录当前命中目标,松手即据此判定(不再单独再 hitTest,避免 move→up 间坐标跳变)。

### 验证

- 大画布(50+ 元素)拖箭头:不卡顿(预览跟手,静态层不重算)。
- 拖拽中目标卡有蓝色描边高亮;移开高亮消失。
- 系统手势 / 触屏打断 pointercancel:不残留预览、不建错箭头。
- 松手点偏目标卡几像素(容差内):仍能连上。
- 松在空白 / 同一张卡:不建箭头(回归)。
- 现有 arrow-interaction-audit 测试全绿。

---

## C. 图谱视图状态维持

### 问题

`/graph` 每次打开都重跑 force 布局,丢掉上次 zoom/pan/节点位置,刷新太随意。希望维持"差不多"的状态。

### 根因(缺持久化,三条)

| 丢失的东西 | 存哪 | 为什么丢 | 关键位置 |
|---|---|---|---|
| 节点坐标 x/y | `createGraphSimulation` 返回的 `PositionedNode[]`,只在 `handleRef` 内存 | 每次 mount 用 `Math.random()` 重新随机初始位置 + `restart()` 重跑 force | `graph-layout.ts:44-52`、`graph-canvas.tsx:138-141` |
| zoom/pan | `viewRef = useRef<View>({zoom:1,panX:0,panY:0})` | 纯组件 ref,不写 localStorage,卸载即丢 | `graph-canvas.tsx:52`、`:252-265`、`:209-215` |
| 节点固定点 fx/fy | 同 `PositionedNode` 内存 | 同上 | `graph-layout.ts:82-95`、`graph-canvas.tsx:186-188` |

- `apps/web/src/features/graph/` 全目录无 `localStorage`/`persist`/`saveGraph` — 0 持久化。
- **对比范式**:`apps/web/src/lib/canvas-view-store.ts` — 画布页已有的 per-canvas zoom/pan/gridMode localStorage 持久化 + 配额回滚 + useSyncExternalStore。graph 页从未做对等实现。

### 设计

**新 `apps/web/src/lib/graph-view-store.ts`**(照搬 `canvas-view-store.ts` 结构):

- 持久化内容(单 key,整个图谱一个状态,不分 canvas — 图谱是全局的):
  - 视口:`{zoom, panX, panY}`
  - 节点坐标:`Record<nodeId, {x, y, fx?: number, fy?: number}>` — 含拖拽固定点
- localStorage key:`cys-stift.graph-view.v1`
- 同样配额回滚 + `notifyQuota` + `useSyncExternalStore`(复用 canvas-view-store 的模式)。
- 序列化裁剪:节点坐标只存已知当前节点 id(打开时按当前 nodes 过滤,删除的节点缓存项不写回)。

**布局参数化** — `graph-layout.ts`:

- `createGraphSimulation(nodes, edges, opts)` 的 `opts` 加可选 `initialPositions?: Record<nodeId, {x,y,fx?,fy?}>`。
- 有缓存坐标的节点用缓存(含 fx/fy 固定点直接 fix);无缓存的节点维持现有抖动 fallback(`width/2 + (random-0.5)*100`)。
- 去掉无条件的 `Math.random()` 初始位置 — 改为"无缓存才抖动"。

**恢复 / 回写** — `graph-canvas.tsx`:

- mount:从 store 读视口 → 注入 `viewRef` 初始值(替掉硬编码 `{zoom:1,panX:0,panY:0}`);读节点坐标 → 传给 `createGraphSimulation` 作 `initialPositions`。
- view 变化(wheel / pan):throttle 回写视口到 store(约 200ms)。
- simulation tick 稳定后(alpha 衰减到阈值,simulation 自带 `onEnd` 或 alpha<0.01):回写所有节点坐标到 store。
- 节点拖拽 fix(`:186-188`):拖拽结束回写该节点 fx/fy。

**边界**:

- 节点新增(新卡片/新画布)→ 无缓存,fallback 抖动,不破坏旧布局。
- 节点删除 → 回写时按当前 nodes 过滤,旧缓存项自然淘汰。
- 数据量大时降级:默认全存;若 localStorage 写入频繁配额满,降级为只存视口 + fx/fy 固定点(x/y 由 force 重算但固定点保留)。降级由配额回滚机制自动触发,不显式配置。
- 图谱过滤(只看某标签等)改变 nodes 集合:缓存按 nodeId 索引,过滤后未显示的节点缓存保留(不过滤写回),重开仍可恢复。

### 验证

- `/graph` 拖动节点 + 缩放 + 平移 → 离开 → 重进:视口 + 节点位置恢复。
- 新增卡片后打开 `/graph`:新节点落中心抖动,旧节点位置不变。
- 删除卡片后打开:该节点缓存清理,不报错。
- 配额满:降级到只存视口 + fx/fy,不崩(回归 canvas-view-store 的配额测试范式)。
- 现有 graph 测试全绿。

---

## 实装顺序

1. **B**(最小,先理顺契约)— 改 `switchCanvas` + 加 `usePathname` effect。
2. **A**(最影响使用)— 先状态机修复(pointercancel + 容差 + 目标高亮),再双层渲染优化。
3. **C**(独立模块)— 新 store + 布局参数化 + mount 恢复 + 回写。

每块:测试 + build + 真机手测 + commit,再推下一条。

---

## 不做(YAGNI)

- 不引入全局 selection store(selection 是 adapter 实例级瞬态)。
- 不做箭头连接桩 / 锚点 UI(用户反馈是手感问题,不是缺锚点;现有"卡片任意位置 down 即开连"够用,配合目标高亮已解决对准问题)。
- 不做图谱布局算法升级(只维持状态,不换布局)。
- 不做 AI 感知优化(D,等 UI)。
