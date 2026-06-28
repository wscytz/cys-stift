# 画布可用性打磨设计 (2026-06-28)

> 来源:两轮拟人化测试(UX 走查 3/5 + 逻辑/边界走查 2/5)坐实的 5 个问题。
> 范围:BUG-A(DSL 丢卡)/ BUG-B(静默吞)/ 软删双按钮同名 / 画布建卡入口缺失 / 空状态 motif 缺失。
> 决策记录见本文档「决策汇总」节。

## 背景

两轮拟人化测试后逐条核对源码,确认:

1. **BUG-A(致命,数据丢失)**:`[card #x create]` DSL 粘贴后画布显示 `(untitled)` + 成功 toast,但 `apply-layout.ts:131-142` 的 create 分支只调 `host.upsert()`(画布内存几何),未调 `service.create()` 落 DB。结果:localStorage `cys-stift.cards.v1` 始终为空,F5 后卡消失;更严重——`canvas-binding.ts` 的 `syncCardsToEditor` 会把 host 里不在 DB 的 card 当 orphan 删除,任何切画布/snap 触发 sync 都会立刻删掉孤儿卡。核心卖点(转义+DSL)入口静默丢用户数据。
2. **BUG-B(错误反馈)**:`canvas/page.tsx:457-460` 的 `looksLikeDsl` 只认 5 种 kind 开头;整段无有效行(如 `[unknown_kind #foo]` 或纯 `@pos(...)`)→ return 无 toast,用户粘错无任何反馈。
3. **软删双按钮同名**:`card-detail-modal.tsx:271`(外层)与 `:299`(内层确认)复用同一 i18n key `card.detail.delete`="软删除",两 modal 同框时出现两个"软删除"按钮,易点错。
4. **画布无建卡入口**:双击空白只 `doubleClickArrowAt`(no-op),无右键菜单,无 N/C 建卡键。空状态文案"双击创建"是错误承诺。
5. **空状态缺 motif**:archive/trash/inbox 空状态有 Bauhaus overlap 装饰,canvas 空状态是裸米色,不对称。

核对时排除的 2 条误判:① "双击空白跳 /inbox" 实为点中 cv-empty 的 CTA link,双击空白本身 no-op;② "0 键不复位" 实为 0 键有 fit 效果(空画布下即复位 100%)。

## 决策汇总(brainstorming 阶段)

| 项 | 决策 |
|---|---|
| 范围 | 全 5 条一次性 |
| 建卡入口交互 | 右键菜单 → 弹小输入框(只标题) |
| 右键菜单项 | 在此处建卡 / 粘贴 DSL / 适配视图 |
| BUG-A 内容 | DSL create 建空卡(标题空)+ 落几何 |
| BUG-B 反馈 | 放宽 looksLikeDsl(any `[` 行)+ 0 ops 给反馈 |
| 软删文案 | 外层"删除…" + 内层"移入回收站" |
| 空状态 motif | A+B 对齐版(演示三件套 + 指引卡,左对齐,SVG) |

## 设计

### 第 1 节 — BUG-A:applyLayout 回调注入(核心)

**约束**:`packages/canvas-engine` 零业务依赖(铁律),不能 import `@cys-stift/domain`。建卡必须调 `service.create()`(domain 层)。因此引擎层通过**回调**把"建卡"动作交回 web 层,不破坏零依赖。

**选型**(三方案对比):

- 方案 1(采用):`applyLayout` 增加可选 `onCardCreate` 回调。create 分支先调回调(web 层 service.create + 落坐标),再 `host.upsert` 几何。引擎零依赖不破,paste/dialog 复用同一回调,undo 走 host.batch。
- 方案 2(弃):web 层预扫描 ops,先 service.create 再 applyLayout。双重写入 + undo 语义混乱(预建卡不在 batch 内)。
- 方案 3(弃):移除 create 分支,DSL 不能建卡。与已定"建空卡"决策冲突。

**API 变更**(`apply-layout.ts`):

```ts
export function applyLayout(
  host: CanvasHost,
  ops: DslOp[],
  appliedHashes?: Set<string>,
  onCardCreate?: (params: {
    cardId: string; x: number; y: number; w: number; h: number; color?: string
  }) => void,
): ApplyResult
```

`applyCardOp` create 分支改为:

```ts
if (!op.create) return false
if (onCardCreate) {
  onCardCreate({
    cardId: String(op.cardId),
    x: finiteRound(op.x, 0), y: finiteRound(op.y, 0),
    w: op.w ?? 240, h: op.h ?? 120, color: op.color,
  })
}
host.upsert({ id: String(op.cardId), kind: 'card', x, y, w, h, rotation: 0, color: op.color ?? 'white' })
return true
```

无回调(InMemoryCanvasHost 单测)→ 退化只 upsert,保持原行为不崩。

**web 层回调实现**(`canvas/page.tsx` paste handler 与 `dsl-dialog.tsx` 共用):

```ts
const onCardCreate = ({ cardId, x, y, w, h }) => {
  // id 冲突:已存在则降级为 update(只更新几何),不重建不抛错。
  if (service.get(cardId as CardId)) {
    service.moveToCanvas(cardId as CardId, { canvasId: activeCanvasId, x, y, w, h, z: 0, rotation: 0 })
    return
  }
  service.create({
    id: cardId as CardId, title: '', body: '', type: 'note',
    canvasPosition: { canvasId: activeCanvasId, x, y, w, h, z: 0, rotation: 0 },
  })
  // host.upsert 已在 batch 内加几何;DB 已有此卡 → syncCardsToEditor 不会当 orphan 删。
}
```

**边界**:
1. **id 冲突**:`service.create` 前查重,已存在降级 update(只更几何),不抛错不重复。
2. **批量 z 序**:多张 create 卡 z:0,堆叠由 host 数组序决定(后建在上),与 inbox→move 一致,可接受。
3. **undo**:host.batch 包整个 applyLayout,undo 撤几何(卡元素消失),但 DB 已 create。与现有"Delete 键擦卡 = removeFromCanvas 回 inbox"语义一致——undo 后卡回 inbox 不丢数据。`reconcileHistory` 已处理(host 有卡元素但 DB canvasPosition 在本画布则幂等 no-op;DB 有卡 host 无 → undo 恢复元素后 reconcile move 回画布)。**不丢数据,符合既有模型**。
4. **InMemoryCanvasHost 单测**:不传回调,退化只 upsert,现有契约测试不破。

**测试**:
- `apply-layout.test.ts`:`[card #x create]` + 传 onCardCreate → 回调被调用且参数正确;不传 → 只 upsert 不崩。
- e2e(puppeteer):paste `[card #c1 create] @pos(100,100)` → localStorage `cys-stift.cards.v1` 含 c1 + canvasPosition → F5 后卡仍在。

### 第 2 节 — BUG-B:放宽检测 + 反馈

`canvas/page.tsx:457-460` 改为:

```ts
// 放宽:任何含「[」开头的行都当疑似 DSL(不再限定 5 种 kind)。
const looksLikeDsl = text.split('\n').some((ln) => /^\s*\[/.test(ln))
if (!looksLikeDsl) return  // 纯文本(无 [ 行)不打扰,保持现状

const { ops, errors } = parseDslWithDiagnostics(text)
if (ops.length === 0) {
  pushToast({ kind: 'info', message: t('canvas.pasteDslNoneParsed', { errors: String(errors.length) }) })
  return
}
const adapter = handle.current.adapter
if (!adapter) return
const { applied, skipped } = applyLayout(adapter, ops, undefined, onCardCreate)
// 现有三分支 toast 保留(pasteDslNone / pasteDslPartial / pasteDslApplied)
```

**抽公共函数** `applyDslFromText(text: string)`:把 paste 监听和右键菜单"粘贴 DSL"项的 parse + apply + toast 逻辑合一,单一实现。

**新 i18n key**:
```
'canvas.pasteDslNoneParsed': {
  zh: '看起来像 DSL,但 {errors} 行未能解析(打开 DSL 面板看行级诊断)',
  en: 'Looks like DSL, but {errors} line(s) failed to parse (open DSL panel for line diagnostics)'
}
```

**边界**:
1. 纯文本(无 `[` 行)→ `looksLikeDsl` false → return 无 toast,避免误报。
2. 混合粘贴(好行+坏行)走现有 `pasteDslPartial` 分支(applied>0 且 errors>0),不变。
3. 右键菜单"粘贴 DSL"复用 `applyDslFromText`,服务第 4 节。

**测试**:
- e2e:粘 `[unknown_kind #foo]` → toast 出现 `pasteDslNoneParsed`;粘普通文字 → 无 toast。

### 第 3 节 — 软删双按钮文案

`card-detail-modal.tsx` 拆成两个 i18n key:

- 外层触发按钮(`:271`):`card.detail.delete` → `zh: '删除…'` / `en: 'Delete…'`(省略号暗示弹确认)。
- 内层确认按钮(`:299`):新 key `card.detail.deleteConfirmAction` → `zh: '移入回收站'` / `en: 'Move to Trash'`(准确描述软删可恢复后果)。
- 标题 `deleteConfirmTitle` 保持"删除这张卡片?"。

三处文案分明:触发"删除…" → 标题"删除这张卡片?" → 确认"移入回收站",不再两个同名按钮同框。

**边界**:只动 CardDetailModal。archive 页批量软删(`archive.batchDelete*`)是另一组 key,文案不同,不在本次范围,避免误伤。

**测试**:e2e 打开卡 → 点"删除…" → 确认 modal 显示"移入回收站",无第二个"删除…"。现有 CardDetailModal 快照/文案断言需同步更新。

### 第 4 节 — 画布右键菜单 + 建卡小输入框

新增组件 `apps/web/src/features/canvas/canvas-context-menu.tsx`。

**触发**:画布 `<canvas>` 的 `onContextMenu` → `preventDefault` → 在右键坐标(screen)打开菜单。所有工具(select/freedraw/eraser/text/connect)都生效(右键是元操作,不被工具拦截)。

**菜单三项**(Bauhaus 风格,白底黑边硬阴影,对齐 `cv-rail__menu`):
- 在此处建卡 — 右键坐标建卡
- 粘贴 DSL — `navigator.clipboard.readText()` → `applyDslFromText`
- 适配视图 — `zoomBy('fit')`

**「在此处建卡」流程**:
1. 点该项 → 关菜单 → 在右键坐标(screen)弹内联小输入框(只标题),复用 `cinput` 样式。
2. `autofocus`,Enter 提交 / Esc 取消 / blur 取消。
3. 提交:`createCardOnCanvas(service, host, canvasId, { title, x, y })` 建卡(service.create + 落 canvasPosition + addCardShape 几何)。坐标 x/y = `screenToPage(view, sx, sy)`(右键点哪建哪)。
4. 空 title 提交 → 不建卡(取消),避免空标题残留。
5. 建卡后 `setSelectedIds([newId])` 便于立即编辑。

**共用函数** `createCardOnCanvas(service, host, canvasId, { title, x, y, w?, h? })`:封装 service.create + canvasPosition + addCardShape。右键建卡(title 来自输入)与 BUG-A 回调(title 恒空)各调各的,同源逻辑。

**菜单定位**:screen 坐标,`position: fixed`,溢出视口翻转到左/上。复用 `cv-rail__menu` 的 portal-to-body + backdrop 点外关闭。

**边界**:
1. 右键命中已有卡:菜单仍出现,"在此处建卡"在该坐标建新卡(可能重叠,用户可拖开)。卡级右键菜单是 YAGNI,留待将来。本次保持简单。
2. eraser/connect 模式下右键 → 仍弹菜单(右键不触发擦除/连接,那些是左键 pointerdown),安全。
3. 小输入框 z 序高于菜单(modal 级 z:100)。
4. 复制第 1 节 onCardCreate 的 id 冲突查重逻辑(createCardOnCanvas 内统一)。

**测试**:
- 单测:`createCardOnCanvas`(service mock)→ create 调用参数正确(canvasPosition 含坐标)。
- e2e:右键空白 → 菜单出现 → 点"在此处建卡" → 输入标题 Enter → 卡出现在右键坐标 + localStorage 含此卡 + F5 仍在。

### 第 5 节 — 空状态 motif(A+B 对齐版)

新增组件 `apps/web/src/features/canvas/canvas-empty-motif.tsx`(纯展示 SVG),替换现有 cv-empty 内容。

**结构**(对应定稿 mockup):
- 上半(演示三件套):白卡(空) —箭头→ 黄卡;下方蓝手绘曲线。
- 下半(指引,与上半左对齐):虚线卡 + 红点 + 文案「右键建卡 · 双击打开」。
- 最下:保留现有 CTA「去收件箱 →」。

**实现要点**:
1. SVG 而非 DOM 卡片:单个 `<svg>` 画三件套(对齐 `elements-to-svg.ts` 视觉语言),硬阴影、箭头三角、手绘贝塞尔曲线都在 SVG 内,缩放/响应式不散。
2. 对齐:上半演示组与下半指引卡共用左基线(SVG viewBox 内比例定位,响应式自动对齐)。
3. 颜色走 token:`--color-white/black/yellow/blue/red`,不写死 hex(铁律)。
4. 文案走 i18n 新 key `canvas.emptyMotifHint`(zh: '右键建卡 · 双击打开', en: 'Right-click to create · Double-click to open')。
5. `pointer-events: none`:整个 motif 不挡右键/双击(现有 cv-empty 已 none,CTA link 单独 auto)。**关键**——画布现有右键菜单和双击开卡,motif 不能拦截。
6. 显示条件不变:`onCanvas === 0 && !hasFreeform`(无卡且无 freeform 才显示)。有 freeform 时不显示(用户画线中途不该被打断),沿用现有逻辑。

**与入口的承诺一致性**:motif 文案"右键建卡 · 双击打开"对应第 4 节落地的入口——承诺与行为一致(修了 UX 走查的"双击创建误导")。双击打开是现有行为(命中卡开 modal),右键建卡是新增。空状态下双击空白仍 no-op(不跳页),右键可建卡,承诺成立。

**测试**:
- 视觉:e2e 截图比对(canvas 空 → motif 渲染 SVG 存在;有卡 → motif 消失)。
- 交互:e2e 右键 motif 区域 → 菜单仍出现(pointer-events:none 验证)。

## 涉及文件总览

| 节 | 文件 | 变更 |
|---|---|---|
| 1 | `apps/web/src/features/canvas/apply-layout.ts` | applyLayout 增 onCardCreate 参数,applyCardOp create 分支调回调 |
| 1 | `apps/web/src/app/canvas/page.tsx` | paste handler 传 onCardCreate |
| 1 | `apps/web/src/features/canvas/dsl-dialog.tsx` | apply 调用传 onCardCreate |
| 2 | `apps/web/src/app/canvas/page.tsx` | 放宽 looksLikeDsl + 抽 applyDslFromText |
| 2 | `apps/web/src/lib/i18n/messages.ts` | 新 key pasteDslNoneParsed |
| 3 | `apps/web/src/features/canvas/card-detail-modal.tsx` | 外层用 card.detail.delete,内层用 deleteConfirmAction |
| 3 | `apps/web/src/lib/i18n/messages.ts` | card.detail.delete 改文案 + 新 deleteConfirmAction |
| 4 | `apps/web/src/features/canvas/canvas-context-menu.tsx` | 新组件:右键菜单 + 建卡小输入框 |
| 4 | `apps/web/src/features/canvas/canvas-binding.ts`(或新 util) | 新函数 createCardOnCanvas |
| 4 | `apps/web/src/app/canvas/page.tsx` | 接 onContextMenu + 渲染菜单 |
| 5 | `apps/web/src/features/canvas/canvas-empty-motif.tsx` | 新组件:SVG motif |
| 5 | `apps/web/src/app/canvas/page.tsx` | cv-empty 替换为 motif 组件 |
| 5 | `apps/web/src/lib/i18n/messages.ts` | 新 key emptyMotifHint |

## 验收

- `pnpm -r test` 全绿(domain / db / canvas-engine / web)。
- `pnpm -r lint` 零新增错误(canvas-engine 必须零错)。
- `pnpm --filter web build` exit 0。
- e2e(上述各节)覆盖:DSL create 不丢卡、坏 DSL 有反馈、软删无同名按钮、右键建卡落库、motif 渲染且不挡交互。
- 无 `'use server'` / API routes / 动态路由段(静态导出铁律)。

## YAGNI 边界(本次不做)

- 卡级右键菜单(右键命中卡时的专属菜单)。
- DSL create 携带标题(本次建空卡,`# "注释"` 当标题留待将来)。
- onboarding tour。
- `?` 键全局触发快捷键面板(UX 走查提到,本次不修)。
- archive 批量软删文案调整(本次只动 CardDetailModal)。
