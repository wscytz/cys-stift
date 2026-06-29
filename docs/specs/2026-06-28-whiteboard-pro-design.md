# 白板专业度 Phase 1 设计(对齐分布 + 模板 + AI 工作流)

> 来源:产品方向 B「白板专业度」。知识网络(方向 A)已完成。本轮 B 为主 + C 轻量子项(AI 工作流)。
> 图层/命名快照/PDF 导出是大改,留后续 phase。

## 背景

知识网络(图谱/块引用/建关系/命令面板/标签墙)让"整理和回溯"端完整。白板专业度补"养起来"端的专业能力:对齐分布(专业排版)、画布模板(快速起手)、AI 工作流(一键 AI 操作)。

## 地基核实

- **z 序是 KIND_LAYER 固定**(按 kind 分层),无用户 layer 字段——图层留后续。
- **对齐分布**:无(packages/canvas-engine 只有 bounds 几何辅助)。
- **diff-dialog**:基于 host.getHistory()(undo 栈),非命名快照——快照留后续。
- **PDF**:无(有图片导出)——留后续。
- **画布模板**:无。
- **cluster / auto-relate 已有**(`handleAICluster` / `handleAutoRelate`)——AI 工作流复用。
- **serializeCanvasReadable / parseDsl / applyLayout 已有**——模板 = DSL 文本。

## 决策汇总

| 项 | 决策 |
|---|---|
| 范围 | 对齐分布 + 画布模板 + AI 工作流模板 |
| 对齐操作 | 全套 9(left/right/top/bottom/center-h/center-v/distribute-h/distribute-v/equalize),选中≥2 卡顶栏出工具条 |
| 画布模板 | 4 预设(思维导图/流程图/看板/四象限)+ 自建(当前画布存模板),模板=DSL 存 localStorage |
| AI 工作流 | 3 预设(聚类重排/生成关系/总结大纲) |

## 设计

### 子特性 1:对齐分布(引擎层纯函数 + canvas 工具条)

`packages/canvas-engine/src/align-distribute.ts`(零业务依赖):
```ts
export type AlignOp = 'left'|'right'|'top'|'bottom'|'center-h'|'center-v'|'distribute-h'|'distribute-v'|'equalize'
export function applyAlign(elements: CanvasElement[], op: AlignOp): Map<string, {x?:number;y?:number;w?:number;h?:number}>
```
返回 patch Map(元素 id → 新几何)。9 操作:
- 对齐(≥2):left/right/top/bottom/center-h/center-v —— 边界框基准。
- 分布(≥3):distribute-h/distribute-v —— 按排序等间距。
- 等大(≥2):equalize —— 平均 w/h。
对 < 最少元素数的 op 返回空 Map(no-op)。

canvas page:选中≥2 卡时顶栏出对齐按钮组(9 图标)。点击 → applyAlign(selectedCards, op) → host.batch(upsert patch)。单 undo 步。

### 子特性 2:画布模板(4 预设 + 自建)

`apps/web/src/lib/canvas-templates.ts`:
- 4 预设(硬编码 DSL):思维导图(中心 + 放射)/ 流程图(横向链)/ 看板(4 列 frame)/ 四象限(2×2 frame)。
- 自建:`serializeCanvasReadable(elements)` → 存 localStorage `cys-stift.canvas-templates.v1`({name, dsl}[])。
- list/load/save 函数。

`apps/web/src/features/canvas/template-picker.tsx`:新建画布(NewCanvas modal)加"从模板"选项 → 选 → parseDsl + applyLayout 到新画布。

### 子特性 3:AI 工作流模板(3 预设)

`apps/web/src/features/ai/workflows/`:
- 聚类重排:复用 handleAICluster。
- 生成关系:复用 handleAutoRelate。
- 总结大纲(新):读画布卡 → AI 生成 Markdown 大纲 → toast/新卡。
入口:AI 菜单(AiActionMenu/rail)加"工作流"子菜单。AI 未就绪走 AiSetupCard(现有门控)。

### 涉及文件

| 文件 | 变更 |
|---|---|
| `packages/canvas-engine/src/align-distribute.ts` | applyAlign(新) |
| `packages/canvas-engine/src/__tests__/align-distribute.test.ts` | 单测 |
| `packages/canvas-engine/src/index.ts` | 导出 |
| `apps/web/src/app/canvas/page.tsx` | 对齐工具条 + AI 工作流入口 |
| `apps/web/src/lib/canvas-templates.ts` | 4 预设 + 自建 store(新) |
| `apps/web/src/features/canvas/template-picker.tsx` | 选模板(新) |
| `apps/web/src/features/ai/workflows/` | 3 工作流(新) |
| i18n | 对齐/模板/工作流 key |

### 验收
- `pnpm -r test` 全绿(align-distribute 单测进 canvas-engine)。
- `pnpm -r lint` 零新增(canvas-engine/domain 零错)。
- `pnpm --filter web build` exit 0。
- e2e:选中多卡出对齐工具条 + 对齐生效;新建画布选模板;AI 工作流入口。
- 静态导出铁律不破。

### YAGNI 边界
- 图层(layers)/命名快照/PDF 导出(留后续 phase,大改)。
- 自定义 AI 工作流(只预设)。
- 模板编辑/删除(第一版自建只增)。
- 对齐基准元素可选(第一版固定边界框)。
- 工作流的 diff 预览(第一版直接应用)。
