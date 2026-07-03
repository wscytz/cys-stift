# packages/canvas-engine — 自研画布引擎

> 引擎无关的画布核心:**零业务依赖**。CanvasElement 是通用模型(与 cys-stift 的
> Card/Relation 域无关),可独立于 apps/web 复用。

## 铁律

- **零业务依赖**:不 import `@cys-stift/domain` / react / next / 任何 cys-stift 业务模块。
  引擎只认识 `CanvasElement`(通用 {id,kind,x,y,w,h,...})和**注入式** token 解析器。
- **token 注入**:颜色/字体不硬编码,走 `TokenResolver`(默认 `domTokenResolver` 读 CSS 变量)。
  调色板认知(6 原色映射)在 `colorOf`,但具体值由 resolver 给——引擎不耦合 DOM 也不认识 cys-stift token 表。
- **CanvasHost 是契约**:绑定 / DSL / 快照 / 关系只依赖此接口。`SelfBuiltAdapter`
  (Canvas 2D) 与 `InMemoryCanvasHost`(单测)是两个实现,过同一套契约测试。
- **CanvasElement 统一模型**:实时渲染 / SVG 导出 / DSL 文本全是它的不同视图。6 个 active kind(card/arrow/freedraw/text/rect/frame);z 序由模型级 `KIND_LAYER` 决定(frame=-1 底层),非数组顺序。工具(tool)是 adapter 层概念(`'select'|'freedraw'|'eraser'|'text'|'connect'`),不在 CanvasElementKind 里。
- 改引擎 → `pnpm --filter @cys-stift/canvas-engine lint`(tsc --noEmit)零错 + 单测全绿。

## 结构

```
src/
├── index.ts                     barrel(公开 API)
├── canvas-host.ts               CanvasHost 接口 + CanvasElement/CanvasView/UserChange
├── in-memory-host.ts            InMemoryCanvasHost(纯内存,单测用)
├── self-built-adapter.ts        SelfBuiltAdapter(Canvas 2D 实现 + 交互)
├── self-built-render.ts         渲染纯函数(renderElements / drawSelectionOutlines / drawMarquee / colorOf / wrapLines)
├── self-built-text.ts           measureText / textEditKeyAction
├── self-built-hittest.ts        screenToPage / hitTest
├── self-built-arrow.ts          箭头几何(端点 / dash / arrowhead)+ 边界框辅助
├── rdp.ts                       保角 RDP 点简化(simplifyPoints;commitFreedraw store-time 调,点序列 R2 本地不外发)
├── self-built-freedraw.ts       commitFreedraw / bboxOf / freedrawPointsOf(R2 唯一 sanctioned reader)/ translateFreedraw / scaleFreedrawToBox
├── smooth-path.ts               Catmull-Rom 贝塞尔平滑(smoothBezierSegments / buildSmoothPath;render+SVG 同源)
├── freedraw-convert.ts          freedrawToRect(转矩形,镜像 freedrawToArrow)
├── freedraw-classify.ts         classifyFreedraw(本地启发式)/ freedrawToArrow / detectArrowRoute / duplicateFreedraw
├── gesture-recognizer.ts        $1 手势识别器(Wobbrock UIST 2007;本地模板匹配,点序列不外发)
├── gesture-templates.ts         circle/rect/triangle/check 模板 + recognizeShape
├── self-built-resize.ts         handleAtPoint / resizeGeometry
├── self-built-marquee.ts        marqueeSelect
├── self-built-keyboard.ts       arrowKeyDelta / selectAllIds / parseKeyboardAction
├── bounds.ts                    unionBounds / expandBounds / Bounds(通用 AABB 几何)
├── elements-to-svg.ts           CanvasElement[] → SVG(对齐渲染视觉)
├── align-distribute.ts          applyAlign(对齐/分布/等大,选中多元素 → patch Map)
└── __tests__/                   vitest 覆盖(契约 + 各纯函数)
```
