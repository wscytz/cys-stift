---
date: 2026-06-23
status: accepted
decides: 移除 tldraw 依赖,主画布切自研 Canvas 2D 渲染器
supersedes: docs/adr/0005-tldraw-shape.md(若有)
audience: [claude, human]
---

# ADR:移除 tldraw,主画布切自研 Canvas 2D 渲染器

## 状态

Accepted(2026-06-23)。配套 spec §3.4/§6.x 修订走五轮审查(独立于本 ADR)。

## 背景

cy's Stift 画布原基于 tldraw 3.15.6(spec §3.4/§6.x)。开发者反馈 2026-06-22 第三点提出:tldraw 依赖评估 + 自研替代 + 文本描述语言 + 基座更换。

### 移除 tldraw 的动机

1. **许可/分发**:tldraw license 非标准 OSS(商用 ~几千刀;不商用要遥测)。本项目 GPL-3.0-or-later + 隐私优先(deviceId 永不外发、无 vision),tldraw 的遥测条款与隐私姿态有张力。移除后许可风险清零。
2. **含金量**:自研画布是核心资产——路线 A(渐进自研)把画布做成自己拥有的渲染器,是特色的一部分。
3. **原生层优势**:自研后,`CanvasElement[]` 成为统一模型——live 渲染 / SVG 导出 / PNG 光栅化 / `.cystift` 几何 / DSL 文本 全是同一数据的视图。现状(子3)已兑现:导出层从 tldraw `getSvgString`(外包 + 10 次重试)换成自研 `elementsToSvg`(我们控,无重试),`.cystift` 几何从 opaque tldraw snapshot 换成透明 CanvasElement[]。

### 自研可行性(已验证)

路线 A 渐进执行(Phase 0 → Phase 2 子1-4),SelfBuiltAdapter(Canvas 2D,零 tldraw)已功能完备并跑在主路由 `/canvas`:
- 渲染 5 种元素(card/rect/freedraw/arrow/text)+ 拖拽 + pan/zoom + 命中
- 手绘(向量点序列)+ 文本编辑(IME,浮动 textarea 原生 composition)
- 选择 + Delete + 四角 resize + 多选组移动 + 框选 + connect 拖出 arrow
- 方向键微移 + Ctrl+A 全选 + Ctrl+Z/Y undo/redo(50 步快照栈)
- 导出(SVG/PNG/.cystift 全走 CanvasElement[])+ 关系层(RelationPanel + auto-relate)

**316 web 单测 + 14 套真实 Chrome 冒烟**全绿。主路由 `/canvas` 跑自研渲染器,基础业务(多画布/视图持久化/双击开卡/发回/归档/软删/AI 布局)全通。

## 决策

**移除 `@tldraw/tldraw` 依赖 + 删 tldraw 代码文件,主画布完全用 SelfBuiltAdapter。**

### 删除范围(代码)

所有 tldraw 代码文件已无 importer(子1-4 切换后成死代码,仅为 typecheck 保留):
- `apps/web/src/features/canvas/tldraw-canvas.tsx`
- `apps/web/src/features/canvas/canvas-editor.tsx`
- `apps/web/src/features/canvas/canvas-editor-binding-bridge.tsx`
- `apps/web/src/features/canvas/canvas-double-click-bridge.tsx`
- `apps/web/src/features/canvas/canvas-view-persistence-bridge.tsx`
- `apps/web/src/features/canvas/canvas-toolbar.tsx`(legacy tldraw toolbar)
- `apps/web/src/features/canvas/card-shape-util.tsx`(tldraw ShapeUtil)
- `apps/web/src/features/canvas/card-handles.ts`(tldraw createShape/createBinding)
- `apps/web/src/features/canvas/host/tldraw-adapter.ts` + 测试
- `apps/web/src/app/dev/tldraw/page.tsx`(Phase 4 spike 页)
- `apps/web/package.json`:`@tldraw/tldraw` 依赖

### 保留

- `CanvasHost` 接口(`host/canvas-host.ts`)——引擎无关抽象,SelfBuiltAdapter 实现它。TldrawAdapter 删了,接口留(未来若有其它引擎可接)。
- `export-bounds.ts` 的旧 `resolveExportShapes`(纯函数,无 tldraw import;子3 并存)——可一并清,或留(无害)。

### spec 修订(独立五轮审查)

spec `docs/specs/2026-06-19-cys-stift-design.md` §3.4(技术栈:tldraw)与 §6.x(画布集成:tldraw API)需修订为「自研 Canvas 2D 渲染器」。spec 冻结,改走五轮审查——**独立于本 ADR**,审查通过后才改 spec。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 自研渲染器交互打磨长尾(对齐 tldraw 数年细化) | 已达「good enough」(316 测试 + 14 冒烟);polish 持续迭代。子5 后按需补(如 onSelectionChange 事件替轮询、text 编辑接主路由、dash 渲染) |
| 真实大数据量性能未压测 | 视口剔除已有;按需优化(WebGL 是未来选项,非本期) |
| spec 审查不过 | 子1-4 已把能力和真实场景验证做实(主路由跑通),给审查充分证据 |
| tldraw 旧数据(.cystift 含 snapshot)恢复 | 子3 `restoreCystiftPayload` 降级 `elements ?? []`(旧文件只恢复 cards) |

## 后续(子5 后)

- **onSelectionChange 事件**:替 RelationPanel/auto-relate 的 200/300ms 轮询。
- **text 编辑接主路由**:toolbar 的 Text 按钮在,但点 canvas 无反应(edit session 还在 /dev/canvas-self)。
- **dash 渲染**:关系类型 dash 留后续(Canvas 2D arrow 现不画 dash)。
- **token gap**:`--color-green`/`--color-canvas` 未定义(readToken 回退兜底)。

## 约束符合

- 本 ADR + 代码删除**不删 spec**(spec 修订走独立五轮审查)。
- `packages/domain` 零依赖不破坏。
- 颜色/像素走 token;静态导出无 server;GPL-3.0-or-later 不变。
