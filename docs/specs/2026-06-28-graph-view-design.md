# 全局图谱视图设计(/graph)— 知识网络 Phase 1

> 来源:产品方向探索(`/tmp/product-direction.md`)。方向 A「知识网络」的 Phase 1 里程碑。
> 目的:补「整理和回溯」缺口——把养出来的关系网络(双链 + 关系箭头)变成可鸟瞰、可跳转、可回溯的全局图谱。

## 背景

cy's Stift 在「记下来」(inbox/捕获)和「养起来」(画布/关系/DSL)两端接近专业级,**唯独「整理和回溯」是空的**:timeline 只按时间,search 只按词,没有「按关系/主题组织检索」的维度。用户原话「obsidian 级笔记…整理…知识库式存储」的重心正在此。

图谱是知识库产品的灵魂视图。cy's Stift 的差异化:**Obsidian 的图谱边是无类型装饰(都是 wiki-link),cy's Stift 的边带语义三维签名**(blocks/references/derived-from/related-to,线型+箭头+颜色),图谱本身可读、可操作、可导出。这是 DSL + 关系系统对笔记能力的独特贡献。

## 地基核实(Explore agent 摸底)

- **双链已物化为 arrow 元素**:`[[B]]` 经 `syncWikiLinkArrows` 后变成 `kind='arrow' && from=A && to=B && meta.wikilink===true` 的 references 箭头(`wiki-links.ts`)。**不是独立边表**。
- **关系箭头也是 arrow 元素**:三维签名存 CanvasElement 本身(color/dash/arrowhead/text),`relation-types.ts` 的 `inferRelationType` 反推类型。
- **两类边已统一**:都是 `kind==='arrow'`,聚合只需遍历所有画布 freeform 收集 arrow。
- **canvas-engine 无力导向布局**:它是自由画布(用户定位),grep 全仓库无 d3-force/dagre/elkjs。布局需新写或引依赖。
- **节点数据/路由壳/跳转直接复用**:`service.listAll()`、search/timeline 页模式、CardDetailModal。

## 决策汇总(brainstorming)

| 项 | 决策 |
|---|---|
| 布局算法 | 引 d3-force(~8KB,放 web 层 features/graph/,不在零依赖 canvas-engine) |
| 边视觉编码 | 全复用三维签名(blocks/references/derived-from/related-to)+ 双链单独签名 |
| 节点点击 | 弹 CardDetailModal(零成本,不动 canvas page) |
| 节点范围 | 全部卡(含归档,排除软删)+ 顶部过滤器 |
| 节点视觉 | 形状=卡类型,颜色=主标签色 |
| 交互 | 缩放 + 平移 + hover 高亮(淡化非邻居);节点可拖(松手回弹不固定) |

## 设计

### 第 1 节 — 架构与数据流

新增 `apps/web/src/features/graph/`(web 层,不动零依赖 canvas-engine):

```
features/graph/
├── aggregate-edges.ts    边聚合器:遍历所有画布 freeform → 收集 arrow → 统一 GraphEdge
├── graph-filter.ts        过滤纯函数(隐藏归档/标签/类型 + 联动去悬空边)
├── graph-layout.ts        d3-force 布局封装(nodes/edges → 带坐标节点 + 控制句柄)
├── graph-canvas.tsx       Canvas 2D 渲染(render loop + 缩放/平移/hover/拖拽)
└── graph-filters.tsx      顶部过滤器 UI
```

数据流:
1. `useDb()` → `service.listAll().filter(c => !c.deletedAt)` → 节点(含归档,排除软删)
2. `useCanvases()` → `snapshot.canvases` → 遍历每个 canvasId
3. `canvasFreeformStore.load(canvasId)`(异步,Promise.all)→ 合并所有 elements
4. `filter kind==='arrow' && from && to` → GraphEdge[]
5. 顶部过滤器(隐藏归档/标签/类型)→ 过滤节点 + 联动去悬空边
6. `createGraphSimulation(nodes, edges)` → 节点带 x/y/vx/vy
7. `graph-canvas.tsx` Canvas 2D 渲染:边(三维签名)+ 节点(形状=类型,颜色=标签色)
8. hover 节点 → 高亮该节点 + 邻边邻节点,淡化其他
9. 点击节点 → `setDetail(card)` → CardDetailModal

路由:`app/graph/page.tsx`('use client',照抄 search/timeline 模式)。静态路径,静态导出无问题。nav 加「图谱」入口(画布之后)。

### 第 2 节 — 渲染细节(Canvas 2D)

`graph-canvas.tsx` 复用 canvas-engine 原子绘制(colorOf/dashPattern/arrowhead 几何),render loop 和布局独立。

**节点绘制(形状=类型,颜色=主标签色):**
- 形状映射(Bauhaus 几何):note=矩形 / code=矩形带切角 / link=平行四边形 / quote=带引号矩形 / image=正方形。
- 颜色 = 主标签色(tags[0]?.color);无标签 → 中性灰。走 token(colorOf 解析)。
- 节点中心绘标题前 ~8 字(JetBrains Mono 小字),缩放小时只绘形状。
- hover/pinned 节点 → 黑色硬边框 + 轻微放大。

**边绘制(全复用三维签名):**
- 遍历 GraphEdge,从 relationType(blocks/references/derived-from/related-to)取 RELATION_TYPES 的 {color, dash, arrowhead};双链(isWikilink)单独签名(蓝细虚线,arrowhead=none)。
- canvas-engine 的 colorOf(token 解析)+ dashPattern 画线段;有 arrowhead 的画三角头。
- 边在节点下层(z 序:边先节点后)。

**hover 高亮(淡化非邻居):**
- hover 节点 N → 算 N 的邻居集(直接相连节点 id)+ 邻边 id。
- 绘制时:邻居节点 + N 邻边 → 正常不透明度;其他 → alpha ~0.15。
- 鼠标移出 → 全部恢复。

**缩放 + 平移:**
- 滚轮 → zoom(zoom*1.1 / /1.1,clamp 0.2–4),以鼠标位置为锚点。
- 空白处拖动 → 平移(panX/panY)。
- 顶栏「适配」按钮 → 算节点 bbox → 缩放居中(复用 canvas page zoomBy('fit') 的 unionBounds/normalizeBox 思路)。
- screen→graph 坐标:`graphX = (screenX - panX) / zoom`。

**节点拖拽(松手回弹,不固定):**
- 节点 pointerdown → 进入拖拽 → pointermove 临时设 fx/fy 跟随鼠标。
- pointerup → 清 fx/fy → d3-force 继续模拟,弹回受力平衡。
- 拖拽中暂停 hover 计算(避免抖动)。

**render loop:**
- `simulation.on('tick', render)` 每帧重绘。
- alpha 衰减到 0 后停 tick;用户拖拽/过滤变化 → `simulation.alpha(0.3).restart()`。
- requestAnimationFrame 驱动;卸载时 `simulation.stop()` + 取消 rAF。

**hitTest:**
- screen→graph 坐标,逆序遍历节点判断点是否在形状内(矩形/平行四边形各自包含判断;节点形状简单自写)。

**空状态 / 加载态:**
- 聚合中 → 「正在构建图谱…」骨架。
- 无卡 / 过滤后无节点 → 空状态(简单文字引导,复用 cv-empty 样式风格)。
- 孤立节点(无边)仍显示(图谱的「叶」),不丢弃。

### 第 3 节 — 边聚合器 + 过滤器(纯函数 + 单测)

**边聚合器 `aggregate-edges.ts`:**

```ts
export interface GraphEdge {
  from: string
  to: string
  signature: { color: string; dash: 'solid'|'dashed'|'dotted'; arrowhead: 'arrow'|'triangle'|'none' }
  relationType: RelationType | null
  isWikilink: boolean
  arrowId: string
  canvasId: CanvasId
}

export interface GraphNode {
  id: string
  title: string
  type: CardType
  tagColor: string | null
  archived: boolean
}

// 聚合:遍历所有画布 freeform → arrow 元素 → GraphEdge[](异步)
export async function aggregateEdges(
  canvases: { id: CanvasId }[],
  loadFreeform: (id: CanvasId) => Promise<CanvasFreeformSnapshot | null>,
): Promise<GraphEdge[]>

// 节点:从 cards 派生(纯函数)
export function cardsToNodes(cards: Card[]): GraphNode[]
```

**过滤纯函数 `graph-filter.ts`:**

```ts
export interface GraphFilter {
  hideArchived: boolean
  tag: string | null
  type: CardType | null
}

export function filterGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  filter: GraphFilter,
): { nodes: GraphNode[]; edges: GraphEdge[] }
```

逻辑:
1. 节点过滤:hideArchived 去归档;tag 留含该标签;type 留该类型。
2. 边联动:两端任一不在过滤后节点集 → 边丢弃。
3. 多画布同 from/to 多条边去重:同 from/to+同 relationType 合并;不同 relationType 各保留一条(签名不同视觉不同)。

**设计点:**
- `aggregateEdges` 注入 `loadFreeform`(解耦,单测传 mock);web 调用传 `(id) => canvasFreeformStore.load(id)`。
- `cardsToNodes`:`tagColor = card.tags[0]?.color ?? null`(TagColor 是 10 色 CSS var,透传给 colorOf)。
- arrow from/to 指向已删卡 → filterGraph 联动丢弃(节点集不含已删卡)。

**测试(vitest 纯函数):**
- `aggregate-edges.test.ts`:mock loadFreeform 返回含 wikilink/各 relationType/from-to 的 snapshot → 断言 signature/relationType/isWikilink;空 from/to arrow 过滤;多画布合并;同 relationType 去重。
- `graph-filter.test.ts`:hideArchived/tag/type 各过滤;悬空边联动丢弃;多 relationType 保留。

### 第 4 节 — d3-force 布局 + page 组装 + i18n + nav

**布局封装 `graph-layout.ts`:**

```ts
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'

export interface PositionedNode extends GraphNode {
  x: number; y: number; vx: number; vy: number
}

export function createGraphSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: { width: number; height: number },
): {
  nodes: PositionedNode[]
  onTick: (cb: () => void) => void
  fixNode: (id: string, x: number, y: number) => void
  releaseNode: (id: string) => void
  restart: () => void
  stop: () => void
}
```

force 配置(经验值,可微调):
- `forceLink(edges)`:id 映射,distance ~80,strength 0.3
- `forceManyBody()`:strength -120(斥力)
- `forceCenter(width/2, height/2)`:居中
- `forceCollide(24)`:节点不重叠
- alpha 衰减默认;到 0 停 tick。

**graph page 组装 `app/graph/page.tsx`:**
- 'use client' + useDb + useCanvases。
- useEffect 异步:`aggregateEdges(canvases, loadFreeform)` → setEdges;`cardsToNodes(...)` → setNodes。
- useState<GraphFilter> → `<GraphFilters>`。
- useMemo `filterGraph(nodes, edges, filter)` → 过滤 nodes/edges。
- `<GraphCanvas nodes edges onNodeClick />` + `<CardDetailModal>`。
- 加载/空态分支。

**i18n key(messages.ts 新增):**
```
'graph.title'               图谱 / Graph
'graph.emptyTitle'          还没有关系 / No connections yet
'graph.emptyHint'           建卡片、用 [[双链]] 或关系箭头连接,图谱会在这里展开
'graph.loading'             正在构建图谱… / Building graph…
'graph.filter.hideArchived' 隐藏归档 / Hide archived
'graph.filter.tag'          标签 / Tag
'graph.filter.type'         类型 / Type
'graph.fit'                 适配 / Fit
'graph.legend'              图例 / Legend
```

**nav 入口:** 顶栏 nav 加「图谱」(收件箱/画布/图谱/归档/时间线/搜索/回收站/设置),画布之后。

**设计点:**
- d3-force mutate 节点(simulation 直接改 x/y/vx/vy)。GraphCanvas 读实时坐标渲染。
- **不通过 React 重绘**:tick ~60fps 走 setState 会卡。GraphCanvas 内部 Canvas 2D 重绘,React 只管挂载/卸载 + props(节点/边集变化才重建 simulation)。
- 节点/边变化重建 simulation:过滤变化 → useMemo 新 nodes/edges → useEffect 依赖变 → stop 旧 + create 新。第一版简化(过滤即重建,抖动可接受,YAGNI 优化)。
- 只引 `d3-force` 子包(不引整个 d3),~8KB。
- legend(图例):图谱角落小图例说明各 relationType 签名。第一版可做。

## 涉及文件

| 文件 | 责任 | 新建/改 |
|---|---|---|
| `apps/web/src/features/graph/aggregate-edges.ts` | 边聚合 + cardsToNodes | 新建 |
| `apps/web/src/features/graph/graph-filter.ts` | 过滤纯函数 | 新建 |
| `apps/web/src/features/graph/graph-layout.ts` | d3-force 封装 | 新建 |
| `apps/web/src/features/graph/graph-canvas.tsx` | Canvas 2D 渲染 + 交互 | 新建 |
| `apps/web/src/features/graph/graph-filters.tsx` | 过滤器 UI | 新建 |
| `apps/web/src/app/graph/page.tsx` | 图谱页组装 | 新建 |
| `apps/web/src/features/graph/__tests__/aggregate-edges.test.ts` | 聚合单测 | 新建 |
| `apps/web/src/features/graph/__tests__/graph-filter.test.ts` | 过滤单测 | 新建 |
| `apps/web/src/lib/i18n/messages.ts` | graph.* key | 改 |
| 顶栏 nav 组件 | 加图谱入口 | 改(找 nav 定义处) |
| `apps/web/package.json` | 加 d3-force + @types/d3-force 依赖 | 改 |

## 验收

- `pnpm -r test` 全绿(含 aggregate-edges / graph-filter 新单测)。
- `pnpm -r lint` 零新增(canvas-engine/domain 零错;web 仅预存 fixture 基线)。
- `pnpm --filter web build` exit 0。
- e2e(puppeteer):`/graph` 页加载,有卡有双链/关系时渲染节点+边;无卡时空状态;点节点弹 CardDetailModal。
- 无 `'use server'` / API routes / 动态路由段(静态导出铁律)。
- d3-force 只在 web 层,canvas-engine 零依赖不破。

## YAGNI 边界(Phase 1 不做)

- 块引用 `((id))`(Phase 2)。
- 关系面板全局化(Phase 2)。
- 命令面板升级 / 标签聚合墙(Phase 3)。
- 节点 pin 固定(松手回弹,不固定,已定)。
- 过滤变化的抖动优化(增量布局,YAGNI)。
- 节点数 >300 的虚拟化/聚类(第一版提示先过滤,YAGNI)。
- 图谱导出 SVG(后续)。
- local graph(局部图谱,选卡看其网,Phase 2 可选)。
- 从图谱拖节点进画布(后续)。
