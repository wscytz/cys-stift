# 详情页建关系设计 — 知识网络 Phase 2b

> 来源:Phase 2a 块引用+全局关系已完成(看)。本 spec 是 **2b**(详情页建+删关系,完成"看+建"闭环)。图谱连节点建关系(原 3d)留后续。

## 背景

Phase 2a 让详情页能**看**全局关系(backlinks 区),但关系只能在画布用 connect 工具建。Phase 2b 补"建+删":详情页直接添加关系(选目标卡+类型 → 落 default canvas arrow),backlinks 区可删。

## 地基核实

- **canvasFreeformStore.save(canvasId, elements)**(`canvas-freeform-store.ts:233`)— 详情页无 host,直接读 default canvas snapshot → push arrow → save。`load(canvasId)`(:221)读。
- **DEFAULT_CANVAS_ID** = `'default-canvas'`(`default-canvas.ts`)。
- **searchCards(cards, query)**(`@cys-stift/domain`)— picker 搜索复用打分。
- **RELATION_TYPES**(`relation-types.ts`)— 5 种(blocks/references/derived-from/related-to/embeds),picker 列 4 种(不含 embeds,embeds 靠 `((标题))` 物化)。
- **GraphEdge.canvasId**(Phase 1)— backlinks 区据此判断 arrow 属哪个画布(只 default canvas 的可删)。
- **限制**:useGlobalEdges 只在画布列表变化聚合,freeform 变化不触发。建关系后切路由(去图谱页)才看到新边。第一版接受。

## 决策汇总

| 项 | 决策 |
|---|---|
| 范围 | 只详情建关系;图谱连节点留后续 |
| 目标拾取 | 搜索框选卡 + 类型(同面板两步) |
| 方向 | 当前→目标单向(from=当前 to=目标) |
| 删除 | backlinks 区每条 × 按钮(只 default canvas arrow 可删) |
| 落点 | default canvas freeform arrow(手动关系,无 meta) |
| embeds | picker 不列(embeds 靠 `((标题))` 物化,不手动建) |

## 设计

### 架构

**relation-builder.ts**(纯数据操作):
```ts
export async function addRelation(from: CardId, to: CardId, type: RelationType): Promise<void>
export async function removeRelation(arrowId: string): Promise<void>
```
- addRelation:`load(DEFAULT_CANVAS_ID)` → elements push arrow(签名 type.color/dash/arrowhead + text=type.id,**无 meta**)→ `save(DEFAULT_CANVAS_ID, elements)`。
- removeRelation:`load` → elements splice 该 arrowId → `save`。

**relation-picker.tsx**(建关系面板):
- 搜索框(复用 searchCards)+ 结果列表 + 关系类型按钮组(4 种,swatch 色块)+ 确认。
- 确认 → addRelation(current, selected, type) → 关闭。

**card-detail 共享版**:
- 加可选 props:`allCards?: Card[]`、`canEditRelations?: boolean`(默认 false)。
- backlinks 区:canEditRelations 时每条加 × 删除(只 GraphEdge.canvasId===DEFAULT_CANVAS_ID 的显示 ×,非 default 的只显示)+ 区底部"+ 添加关系"按钮 → 打开 relation-picker。

### 数据流

建关系:详情 picker 确认 → addRelation → default canvas freeform 写入 → 关闭 picker → backlinks 区需刷新(详情用 useGlobalEdges 的 edges + 本地乐观更新,或重新触发)。**第一版**:建关系后关 picker,backlinks 区靠 graph page 重新 mount 时不一定刷新;**用乐观更新**:addRelation 成功后,调用方(card-detail)本地 edges state 加一条(构造 GraphEdge)立即显示。

删除:removeRelation → 乐观更新从本地 edges 移除该 arrowId。

图谱刷新:建/删后切到图谱页(路由切换 mount → useGlobalEdges 重聚合)看到变化。第一版接受。

### 关键设计点

1. **default canvas 作全局关系池**:详情建的关系都落 default canvas。用户在 default canvas 会看到这些 arrow(关系本就该在某画布可见)。
2. **手动关系无 meta**:区别 wikilink(meta.wikilink)/embed(meta.embed)。不冲突。重复(同对卡同类型)第一版不去重(YAGNI)。
3. **删除范围**:backlinks × 只对 default canvas arrow(canvasId===DEFAULT_CANVAS_ID)。非 default 的(connect 建的)只显示,提示"在画布删除"。
4. **向后兼容**:card-detail 新 props 可选,不传 = 现有行为。
5. **picker 无 embeds**:embeds 是 `((标题))` 物化独占,手动建无嵌入效果。
6. **乐观更新**:建/删后本地 edges 立即更新,不等 useGlobalEdges 重聚合。

### 涉及文件

| 文件 | 变更 |
|---|---|
| `apps/web/src/features/canvas/relation-builder.ts` | addRelation/removeRelation(新) |
| `apps/web/src/features/canvas/__tests__/relation-builder.test.ts` | 单测(mock freeform store) |
| `apps/web/src/features/card/relation-picker.tsx` | 建关系面板(新) |
| `apps/web/src/features/card/card-detail.tsx` | backlinks × 删除 + 添加入口 + picker + 乐观更新 |
| `apps/web/src/app/graph/page.tsx` | 传 allCards + canEditRelations |
| `apps/web/src/lib/i18n/messages.ts` | 添加/删除/搜索 key |

### 验收
- `pnpm -r test` 全绿(relation-builder 单测)。
- `pnpm -r lint` 零新增(canvas-engine/domain 零错)。
- `pnpm --filter web build` exit 0。
- e2e:详情添加关系 → default canvas freeform 含 arrow → 图谱(切路由)显示;× 删除 → arrow 移除。
- 静态导出铁律不破。

### YAGNI 边界
- 图谱连节点建关系(留后续)。
- 关系去重(YAGNI)。
- freeform 变化自动刷新图谱(事件总线,留后续)。
- 非 default canvas 关系删除(只显示)。
- picker 的 embeds 类型。
