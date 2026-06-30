# v0.40 打磨清单

> 来源:用户 v0.40.0 手测反馈(2026-06-30)。功能已上来,交互逻辑需打磨。
> D(AI 感知弱)等 UI 做完再 review,本文档暂不列入,留作后续。

---

## P0 — A. 箭头连接手感(拖拽创建新箭头)

**现象**:从一张卡拖出箭头连到另一张卡时,拖到一半会卡顿;换目标时没拉到连线就消失了。

**根因(双根因)**:

1. **卡顿 — 渲染路径重**(非状态机问题)
   - `packages/canvas-engine/src/self-built-adapter.ts:670-675` `onMove` 的 connect 分支每次 move 都 `scheduleRender()`
   - `renderNow()`(:104-169)每帧全量 `sortByLayer`(O(n log n))+ 视口剔除 + 重绘所有可见元素 + 预览线
   - connect 预览**未做增量**,画布元素多时高频 pointermove → RAF 排队 → 视觉卡顿

2. **中途消失 — `pointercancel` 复用 `onUp` 在坏坐标 hitTest 失败**(最可能真凶)
   - `:868` `pointercancel` 直接复用 `onUp`;`onUp` 的 connect 分支(:771-803)读 `e.clientX/clientY` 做 hitTest
   - `pointercancel` 事件坐标可能是 0 或中断点 → `hitTest` 落空 → 不建箭头 → 预览消失
   - 系统/浏览器手势、触屏多点、OS 通知打断都会触发 `pointercancel`

3. **次要 — 松手无容差 + move 中无目标反馈**
   - `self-built-hittest.ts:99-101` card 命中是严格 bbox 内,无容差;松手点偏 1px 即 `toId=null`
   - `onMove` 的 connect 分支只更新坐标,**move 过程中完全不判定目标**(无高亮/吸附),用户无法判断是否对准

**修法**:
- [ ] `pointercancel` 路径直接丢弃 `connecting`,不走 `onUp` 的 hitTest(取消即取消,不在坏坐标判定)
- [ ] 松手 hitTest 给 card 加几像素容差(可复用 arrow 的 6px 容差思路)
- [ ] move 中做目标命中高亮(当前 provisional 目标卡描边),给用户"对准了"的反馈
- [ ] 渲染优化:connect 拖拽时跳过视口剔除重算 / 只重绘预览层,或给 `scheduleRender` 加 dirty 标记防重复 RAF

**规模**:中(状态机修小,渲染优化需谨慎不破坏现有 draw 路径)

---

## P1 — B. 切换不退出选择态

**现象**:画布选中一张卡后,切到别的画布/页面再回来,那张卡仍处于选中态,应切走时自动退出。

**根因**:
- 选中态唯一源:`SelfBuiltAdapter.selectedIds`(实例字段,`self-built-adapter.ts:56`),局部于 adapter,非全局
- `apps/web/src/app/canvas/page.tsx:669-673` `switchCanvas` 只 `setDetail(null)` + `canvasStore.setActive(id)`,**没有 `adapter.setSelectedIds([])`**
- 现状靠 `:1055` `<SelfCanvas key={activeCanvasId}>` 的隐式重建"顺带"清空 — 是副作用不是契约
- **路由离开 /canvas 再回来**(点顶栏去 /inbox、/search 等):不触发 key 变化,page 实例 + adapter ref 保留,选中态原样残留 ← 用户描述的直接场景

**修法**:
- [ ] `switchCanvas`(:669)显式 `handle.current.adapter?.setSelectedIds([])` — 不只靠 key 重建
- [ ] 路由离开 /canvas 时 clear selection(用 `usePathname` 或 effect cleanup)— 需先确认 layout 是否保留 page 实例
- [ ] 顺手审一遍其它"应 clear 但没有"的入口(目前点空白/Esc/删除 已 clear,切换/路由跳转 缺)

**规模**:小

---

## P1 — C. 图谱视图状态不维持

**现象**:/graph 每次打开都重跑 force 布局,丢掉上次 zoom/pan/节点位置,刷新太随意,希望维持"差不多"的状态。

**根因(缺持久化,三条)**:

| 丢失的东西 | 存哪 | 为什么丢 | 关键位置 |
|---|---|---|---|
| 节点坐标 x/y | `createGraphSimulation` 返回的 `PositionedNode[]`,只在 `handleRef` 内存 | 每次 mount 用 `Math.random()` 重新随机初始位置 + `restart()` 重跑 force | `graph-layout.ts:44-52`、`graph-canvas.tsx:138-141` |
| zoom/pan | `viewRef = useRef<View>({zoom:1,panX:0,panY:0})` | 纯组件 ref,不写 localStorage,卸载即丢 | `graph-canvas.tsx:52`、`:252-265`、`:209-215` |
| 节点固定点 fx/fy | 同 `PositionedNode` 内存 | 同上 | `graph-layout.ts:82-95`、`graph-canvas.tsx:186-188` |

- `apps/web/src/features/graph/` 全目录 grep `localStorage`/`persist`/`saveGraph` → 0 命中
- **对比**:画布页已有成熟持久化范式 `apps/web/src/lib/canvas-view-store.ts`(per-canvas zoom/pan/gridMode 读写 localStorage),graph 页从未实现对等的 `graph-view-store`

**修法**:
- [ ] 新建 `graph-view-store.ts`(参考 `canvas-view-store.ts`):持久化 zoom/pan
- [ ] `createGraphSimulation` 支持传入初始节点坐标(去 `Math.random`,有缓存坐标时用缓存,无则抖动)
- [ ] 持久化节点坐标(x/y,可选 fx/fy)— 序列化 `{nodeId: {x,y}}` 存 localStorage
- [ ] `GraphCanvas` mount 时恢复视口 + 节点坐标;view 变化 / simulation tick 稳定后回写(throttle)
- [ ] 边界:节点新增/删除后,缓存坐标对新节点用 fallback,旧节点保留;数据量大时考虑只存视口 + fx/fy 固定点

**规模**:中(store + 布局参数化 + mount 恢复 + 回写节流)

---

## 推荐执行顺序

1. **B(选择态清理)** — 最小改动,快速见效,先把交互契约理顺
2. **A(箭头手感)** — 最影响使用,但渲染优化需谨慎;先修 pointercancel + 容差 + 目标高亮(状态机层),渲染优化作为子项可后置
3. **C(图谱状态维持)** — 独立模块,参考已有 canvas-view-store 范式,改动可控

每条做完:测试 + 真机手测 + commit,再推下一条。

---

## 后续(等 UI)

- D. AI 感知弱 — UI 做完后统一 review AI 功能的入口/反馈/可见性
