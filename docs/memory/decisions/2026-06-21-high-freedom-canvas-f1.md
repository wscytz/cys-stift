# 2026-06-21 · v0.26.0-high-freedom-canvas-f1

> 高自由画布 Phase F1(地基)。spec: [`docs/superpowers/specs/2026-06-21-high-freedom-canvas.md`](../../superpowers/specs/2026-06-21-high-freedom-canvas.md)。plan: [`docs/superpowers/plans/2026-06-21-high-freedom-canvas-f1.md`](../../superpowers/plans/2026-06-21-high-freedom-canvas-f1.md)。

## 背景

用户方向:以"整理笔记"为基线,参考苹果无边记(Freeform)做高自由画布——灵感卡 + 自由元素(便签/文本/形状/箭头/手绘)共存。当前画布 `hideUi` 只能 dblclick 建卡,自由元素无持久化,卡只显 title。F1 解决地基:持久化 + card 内容单一数据源 + body preview。

## 实现明细

### F1.1 CardServiceContext
`features/canvas/card-service-context.tsx`(新)。tldraw ShapeUtil.component 只收 shape,不收 app state。用 React Context 让 card component 能查 CardService。canvas-editor `<CardServiceContext.Provider value={service}>` 包 `<Tldraw>`。

### F1.2 card 渲染查 service(body preview + pinned)
`card-shape-util.tsx` component 改:`useCardService()` + `cardIdFromShapeId(shape.id)` + `service.get(cardId)` → 渲染 title + body(3 行截断)+ 类型标签 + pinned ★。card 不存在 → 占位。inbox 编辑 card → CardService 变 → component 重渲染查 DB → **实时同步**。

### F1.3 card props 瘦化
`CardShape` props `{w,h} ← {w,h,title,kind}`。`cardToShape/writeCardToShape` 去 title/kind。内容不在 tldraw store,单一数据源 = CardService。

### F1.4 snapshot store
`lib/canvas-snapshot-store.ts`(新)。per-canvas key `cys-stift.canvas.<id>.v1`,load/save/remove `{document, session}`。SSR-safe,corrupt-JSON 容错,quota 错误 console.warn 不抛。

### F1.5 onMount loadSnapshot + 写回
onMount:① `loadSnapshot`(document only,session/camera 仍 canvasViewStore)② `loadCardsIntoEditor`(幂等补漏,跳过已恢复)③ view 设置 ④ bindCardWriteback ⑤ 新增 `store.listen`(user/document)→ 防抖 500ms → `getSnapshot` → save。自由元素靠此持久化。

## 关键决策

### 为什么 card 内容单一数据源(查 CardService)而非存 shape props
- 之前 card shape 存 title,但 inbox 编辑 title 后画布 stale(直到 reload)
- 改为渲染查 CardService:inbox/archive/search 任何编辑 → CardService 变 → 画布 component 重渲染 → 实时同步
- body preview 自然(渲染查 body),pinned 星自然,无额外同步逻辑
- shape 只存几何 + cardId(shape.id 编码),snapshot 不冗余内容

### 为什么用 localStorage snapshot 而非 tldraw 原生 IndexedDB persistence
- tldraw 原生 persistence 让整个 document 进 IndexedDB,但灵感卡会脱离 CardService(不能在 inbox/archive/search 统一管理)
- snapshot 方案:我们控制 key + 与 CardService 协调(card 几何双写:snapshot + CardService.canvasPosition;内容只 CardService)
- localStorage 是 placeholder(spec §4.5 / Phase 2.5 的 OPFS/Tauri fs 替换),public surface(load/save)不变

### 为什么 snapshot 只恢复 document 不恢复 session
- session 含 camera,但 camera 持久化已由 canvasViewStore 管(Phase 6.5d,per-canvas)
- 恢复 session 会与 canvasViewStore 冲突(两个 camera 源)
- 只恢复 document(shapes),camera 单一源 canvasViewStore,清晰

### 为什么 F1 拆 5 步而非一次
- canvas-editor / canvas-binding / card-shape-util 是 reset 灾难重灾区(上次 `git reset --hard` 在此丢代码)
- 每步独立 commit + build 验证,可精确回退
- F1.1(无行为)→ F1.2(可见 body preview)→ F1.3(瘦化)→ F1.4(store)→ F1.5(接入),风险递增,每步可验证

## F1.6 legacy data 评估

无 migration 需要:
- F1.5 之前无持久化 snapshot(card shape 只在内存,每次从 CardService load)
- F1.3 瘦化的旧 schema(title/kind props)从未持久化
- F1.5 首次存 snapshot 即新 schema `{w,h}`
- cards.v1(CardService)不受影响

## 验收

- domain 26/26 + db 7/7 + web build exit 0
- GUI 可见:card body preview + pinned 星 + inbox→画布实时同步
- 自由元素持久化已就位,**待 F2 工具栏才能创建验证**(F1 阶段 hideUi 未放工具)

## 不修复 / defer

- ⏸️ F2 包豪斯工具栏(下一档,放开多元素创建)
- ⏸️ OPFS / Tauri fs(snapshot 后端升级,Phase 2.5)
- ⏸️ snapshot 体积管理(大画布手绘路径多 → localStorage 超,目前 console.warn,F2 后视情况加导出提醒)
- ⏸️ 卡片 color/rotation UI(F2 之后)

## 已知遗留

无 — F1 地基闭合,F2 在此基础上接工具栏,不动持久化层。