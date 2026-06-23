---
date: 2026-06-23
status: spec (Phase 2 拆分,待用户复审)
route: A — Phase 2 直接替换 tldraw
realizes: docs/plans/2026-06-22-canvas-self-build-route-a.md (Phase 2)
audience: [claude, human]
---

# Phase 2:主路由 /canvas 切 SelfBuiltAdapter + 移除 tldraw(子项目拆分)

> 用户决策(2026-06-23):「胆大心细直接换」——主路由 `/canvas` 一步切 SelfBuiltAdapter,
> 不留 tldraw fallback;缺口逐个填;最后走 ADR + spec 五轮审查移除 tldraw 依赖。
> Phase 1.5(并存 dogfood)取消,合并进 Phase 2。

## 背景

Phase 0 + Phase 1 已完成:CanvasHost 引擎无关接口 + SelfBuiltAdapter(Canvas 2D,零 tldraw),
功能完备(渲染 5 种元素 + 拖拽 + pan/zoom + 手绘 + 文本 IME + 选择 + Delete + resize + 多选组移动
+ 框选 + connect 拖出 arrow + 方向键微移 + Ctrl+A + undo/redo)。299 web 测试 + 10 套真实 Chrome 冒烟。
**但 SelfBuiltAdapter 只在 `/dev/canvas-self` 验证过,没碰主路由 `/canvas`**——主画布仍跑 tldraw,
含真实业务(多画布 / inbox→canvas / AI 布局 / 关系箭头 / SVG-PNG 导出 / `.cystift` 往返)。

## /canvas 页的 tldraw 依赖面(切 self 要替换的)

`/canvas` page(~400 行)+ 其依赖深度绑 tldraw:
- 画布挂载 `<TldrawCanvas>`、`useValue`、`Editor` 类型
- `CanvasToolbar`(tldraw geo/note/arrow/select 工具系统)
- `RelationPanel` + `auto-relate`(tldraw 选择/binding)
- `ExportDialog` / `export-svg` / `export-raster` / `cystift-payload`(tldraw getSvgString/getSnapshot)
- `CardDetailModal` 交互(双击开卡 / 发回 inbox / 归档 / 删除 → tldraw double-click)
- `SnapToggle` / `ZoomGroup`(tldraw camera)
- `card-shape-util`(tldraw ShapeUtil)

## 子项目拆分(5 个,顺序执行)

每个子项目独立 spec→plan→执行→review。子项目 1 是 keystone(让 SelfBuiltAdapter 首次跑在主路由真实场景)。

### 子项目 1:基础接通(keystone)
- `/canvas` 渲染从 `<TldrawCanvas>` 切到 `<SelfCanvas>`(SelfBuiltAdapter 主路由版)。
- SelfBuiltAdapter 主路由版接通:CardService 全量卡片加载 / 多画布切换 / 视图持久化(pan-zoom-snap)/ 双击开 CardDetailModal / 发回 inbox / 归档 / 软删。
- 卡片用 SelfBuiltAdapter 现有简化渲染(只 title)先跑通——完整渲染留子项目 2。
- **page 改造**:`/canvas` page 顶部 tldraw import(`useValue`/`Editor`/`TldrawCanvas`/`CanvasToolbar`/`RelationPanel`/`ExportDialog`)在切 self 后变成死代码。子项目 1 把 page 拆成:`<SelfCanvas>`(新,SelfBuiltAdapter 主路由版)接管画布 + 卡片交互;tldraw 专用的 `CanvasToolbar`/`RelationPanel`/`ExportDialog` **暂时从 page 移除**(它们绑 tldraw,子项目 2/3/4 再以 self 版接回)。page 顶部 `useValue`/`Editor` import 删除。结果:子项目 1 后 page 只剩 self 路径 + CardDetailModal(已 largely host 无关)。
- tldraw 代码(TldrawAdapter/card-shape-util/TldrawCanvas/CanvasToolbar/RelationPanel/ExportDialog)**暂留不删**(文件留着给子项目 2/3/4 改造参考 + 导出/关系过渡;只是不再被 page import)。
- **验收**:主路由 `/canvas` 用 SelfBuiltAdapter 跑,卡片加载/拖拽/多画布/双击开卡/发回/归档/删除全通;`pnpm --filter web build` exit 0;现有 web 测试不退化。AI 布局复用(Phase 0 已 host 无关)。
- **缺口(留后续子项目)**:卡片完整渲染(子2)、toolbar 工具(子2)、导出(子3)、关系 panel(子4)。子项目 1 后 page 暂无 toolbar/导出/关系入口(功能倒退,用户已接受)。

### 子项目 2:卡片完整渲染 + toolbar 迁 self 工具
- SelfBuiltAdapter 的 card 画全:类型标(NOTE/LINK/CODE/QUOTE/IMAGE)+ body 预览(3 行截断)+ pinned 星 + 颜色 token。对齐 `card-shape-util` 现有视觉(token,不裸 hex)。
- `CanvasToolbar` 从 tldraw 工具系统迁 SelfBuiltAdapter 工具:Select / Draw(freedraw)/ Text / Connect。SnapToggle/ZoomGroup 迁 host.getView/setView。
- 验收:主路由卡片视觉对齐 tldraw 版;toolbar 4 工具可用;build + 测试不退化。

### 子项目 3:导出层迁 CanvasElement(原生层优势落点)
- `export-svg`:`getSvgString(tldraw)` → 自研「CanvasElement[] → SVG」(我们控,无重试循环)。复用现有字体嵌入 / 图片内联(export-svg 已有的原生机器)。
- `export-raster`:SVG → PNG(复用现有)。
- `cystift-payload`:`getSnapshot(tldraw)` → CanvasElement[] + 手绘向量(透明的,不再是 opaque tldraw snapshot)。`.cystift` 往返保留。
- 验收:SVG/PNG 导出 + `.cystift` 导入导出往返在 SelfBuiltAdapter 上全通;现有导出测试不退化。

### 子项目 4:关系 panel + auto-relate 迁 host
- `RelationPanel`:tldraw 选择/binding 读取 → host.getSelectedIds + arrow 元素的 from/to。
- `auto-relate`:tldraw createArrowFromHandle → host.upsert(arrow)(connect 逻辑已实现,复用)。
- `relation-inference` / `relation-types`:已 largely host 无关,接通。
- 验收:关系箭头选择/编辑/自动推断在 SelfBuiltAdapter 上通。

### 子项目 5:移除 tldraw(ADR + spec 五轮审查)
- 写 ADR:为何移除 tldraw(许可 + 含金量 + SelfBuiltAdapter 已验证)+ 风险评估。
- spec §3.4/§6.x 修订草案(tldraw → 自研渲染器)→ **五轮审查**(spec 冻结,改要审查)。
- 删 tldraw 依赖(`@tldraw/tldraw`)+ 删 TldrawAdapter / card-shape-util / TldrawCanvas / tldraw 相关 bridges。
- 全量回归 + bundle 体积对比(tldraw ~2MB chunk 应消失)。
- 验收:审查通过 + 全绿 + bundle 缩小 + 主路由零 tldraw。

## 约束(贯穿所有子项目)

- spec `docs/specs/2026-06-19-cys-stift-design.md` 冻结——子项目 1-4 不改 spec(纯代码 + 内部架构);**只有子项目 5 改 spec**(走五轮审查)。
- CLAUDE.md 硬约束:子项目 1-4 不删 tldraw 依赖(不触发「重新选型」红线,因为 tldraw 还在 node_modules,只是主路由不挂);**子项目 5 删依赖才走 ADR + spec 审查**。
- `packages/domain` 零依赖不破坏;颜色/像素走 token;静态导出无 server 无动态路由。
- 每个子项目:plan → subagent 执行 → review 闸 → commit。每步 TDD + 跑命令看 exit code。
- 不假装通过。现有 299 web 测试 + 10 冒烟是护栏,每个子项目不能让它们退化。

## 风险

| 风险 | 缓解 |
|---|---|
| 子项目 1 后主路由初期缺功能(导出/关系/完整卡片) | 用户已接受「直接切,逐步补」;子项目 1 验收明确列出缺口留给后续 |
| 真实数据量性能(几十卡 + 大量手绘)未测 | 子项目 1 接通后即在真实数据 dogfood;性能问题按需优化(视口剔除已有) |
| 子项目 5 spec 审查不过 | 子项目 1-4 先把能力和真实场景验证做实,给审查充分证据 |
| tldraw 代码暂留期间维护负担 | 子项目 5 一次性清;暂留期不维护 tldraw 代码(只读参考) |

## 与现有文档衔接

- 路线 master plan:`docs/plans/2026-06-22-canvas-self-build-route-a.md`(Phase 2 段)
- Phase 1 产物:`apps/web/src/features/canvas/host/self-built-*.ts`(SelfBuiltAdapter + 纯函数)
- 调研:`docs/decisions/2026-06-22-canvas-research-drawio-archdiag-affine.md`
- STATE.md:Phase 1 打磨全部完成,下一步 Phase 2

## 下一步

用户复审本 spec → 转 writing-plans 出**子项目 1(基础接通)**的实现计划。
