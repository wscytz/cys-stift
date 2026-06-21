# 高自由画布 F1(持久化 + card 瘦化 + body preview)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。checkbox 跟踪。
>
> ⚠️ **这是 reset 灾难重灾区(canvas-editor / canvas-binding / card-shape-util)**。每步 `pnpm --filter web build` 验证,小步提交,绝不批量改。备份用 `git stash --include-untracked`,不手动 mv。

**Goal**: 画布全元素持久化(灵感卡 + 自由元素)+ card 内容单一数据源(渲染查 CardService)+ body preview,为 F2 工具栏铺地基。

**Architecture**: card shape 瘦化(props `{w,h}` + shape.id 反查 cardId),component 经 React Context 查 CardService 渲染 title/body/type/pinned。每画布 snapshot(`getSnapshot`/`loadSnapshot`)存 localStorage,自由元素靠 snapshot 持久,card 几何双写(snapshot + CardService.canvasPosition)。

**Tech Stack**: tldraw v3 + React 19 Context + localStorage。

---

## Global Constraints(继承根 CLAUDE.md + spec)

- ❌ 不改 spec / domain / db / 不加依赖
- ❌ 颜色走 token,card-shape-util 保持 hex-free
- ❌ 不破坏 ui 包 6 原色铁律
- ✅ 每步 `pnpm --filter web build` exit 0
- ✅ card 内容单一数据源(CardService),shape 不冗余
- ✅ 旧画布数据可清(用户已确认,开发阶段数据少)

## File Structure(F1 改动)

| 文件 | 改动 |
|---|---|
| `apps/web/src/features/canvas/card-service-context.tsx` | **新建** CardServiceContext + useCardService hook |
| `apps/web/src/features/canvas/card-shape-util.tsx` | props 瘦化 `{w,h}`;component useContext 查 service 渲染(title + body preview + type tag + pinned 星) |
| `apps/web/src/features/canvas/canvas-binding.ts` | cardToShape/writeCardToShape 去 title/kind |
| `apps/web/src/lib/canvas-snapshot-store.ts` | **新建** per-canvas getSnapshot/loadSnapshot + 防抖存 |
| `apps/web/src/features/canvas/canvas-editor.tsx` | `<CardServiceContext.Provider>` 包 `<Tldraw>`;onMount loadSnapshot + 兜底 loadCardsIntoEditor;自由元素写回 listener |

---

## F1.1 — CardServiceContext + Provider

**Files:** Create `card-service-context.tsx`;Modify `canvas-editor.tsx`(Provider 包 Tldraw)

- [ ] 新建 `card-service-context.tsx`:React Context 持 `CardService | null` + `useCardService()` hook(null 时抛错或返回 null)
- [ ] `canvas-editor.tsx`:`<CardServiceContext.Provider value={service}>` 包 `<Tldraw>`,让 shape component 可达
- [ ] build 验证 exit 0(此步无行为变化,只是铺 context)
- [ ] commit `feat(canvas): CardServiceContext for shape rendering`

## F1.2 — card component 查 service 渲染(body preview + pinned)

**Files:** Modify `card-shape-util.tsx`

- [ ] component 内:`const service = useCardService()`,`const cardId = cardIdFromShapeId(String(shape.id))`,`const card = service?.get(cardId)`
- [ ] 渲染:从 card 读 title/body/type/pinned(body 截断 2-3 行预览);card 不存在时(已删)渲染占位/空。**props.title/kind 仍保留**(F1.3 才瘦化,此步兼容)
- [ ] 视觉:加 pinned ★ 角标(黄)+ body preview 灰色小字。包豪斯,token 颜色
- [ ] build 验证 + 视觉:画布 card 现在显示 body 预览 + pinned 星
- [ ] commit `feat(canvas): card shape renders body preview + pinned from CardService`

## F1.3 — card props 瘦化 + binding 去 title/kind

**Files:** Modify `card-shape-util.tsx`(props)+ `canvas-binding.ts`(cardToShape/writeCardToShape)

- [ ] `CardShape` props 类型:`{w, h}`(去 title/kind);`static props` 去 title/kind;getDefaultProps `{w:240,h:120}`
- [ ] `canvas-binding.ts`:cardToShape/writeCardToShape props 只 `{w,h}`(去 title/kind)。writeCardToShape 现在只更新尺寸(位置由 tldraw 几何 x/y 管,内容由 service 管)
- [ ] build 验证(此步后旧 localStorage card shape 含 title/kind 可能不兼容 —— F1.6 清)
- [ ] commit `refactor(canvas): slim card shape props to {w,h}, content via CardService`

## F1.4 — canvas-snapshot-store

**Files:** Create `lib/canvas-snapshot-store.ts`

- [ ] per-canvas key:`cys-stift.canvas.<canvasId>.v1`
- [ ] `load(canvasId)` → parsed snapshot | null(localStorage 读 + JSON.parse + 容错)
- [ ] `save(canvasId, snapshot)` → JSON.stringify 存(quota 容错 catch)
- [ ] 纯函数,无 React(类似 canvas-store 模式)
- [ ] build 验证(此步只是 store,未接入)
- [ ] commit `feat(canvas): per-canvas snapshot store`

## F1.5 — onMount loadSnapshot + 兜底 + 自由元素写回

**Files:** Modify `canvas-editor.tsx` + 用 `canvas-snapshot-store`

- [ ] onMount 顺序:① `loadSnapshot(editor.store, snapshotStore.load(canvasId))`(恢复全部 shape 含自由元素)② 兜底:对 CardService 有但 snapshot 没有的 card,`addCardShape`(新卡首次上画布)③ 对 snapshot 里的 card shape,revalidate 内容(component 已查 service,无需额外)④ 现有 view 设置(camera/snap)保留
- [ ] 自由元素写回:`editor.store.listen`(scope document,source user)→ 防抖 500ms → `snapshotStore.save(canvasId, getSnapshot(editor.store))`。**含 card shape**(几何双写,内容以 CardService 为准)
- [ ] 去重:loadSnapshot 后 loadCardsIntoEditor 改为"补漏"(只 add snapshot 没有的 card),避免双创建
- [ ] build 验证
- [ ] commit `feat(canvas): full-canvas snapshot persistence + freeform element saveback`

## F1.6 — 清旧数据 + 全验证

- [ ] 清旧 localStorage card shape 数据(手动 DevTools 清 `cys-stift.*` 或代码 migration 检测旧 schema 清除)。开发阶段数据少,接受清空
- [ ] 端到端验证(手动,因无 GUI 自动测):
  - 画布加便签/文本/矩形(tldraw 默认 dblclick 工具?或等 F2 工具栏 —— F1 阶段用 tldraw dev 临时测)→ 刷新仍在
  - inbox 改 card title/body → 画布 card 实时更新
  - card 显示 body preview + pinned 星
  - card 拖动 → 位置持久(reload 后)
- [ ] commit `chore(canvas): clear legacy shape data for slim schema`

## F1.7 — changelog + decision record

- [ ] changelog v0.26.0 + decision record(架构决策 + 风险 + F2 预告)

---

## Self-Review

- **Spec coverage**:持久化✓(F1.4/1.5)、card 瘦化✓(F1.3)、body preview✓(F1.2)、单一数据源✓(F1.1/1.2)、清旧数据✓(F1.6)
- **Placeholder**:无 TBD;每步有文件+改动+验证
- **Type consistency**:CardShape props 全程 `{w,h}` 一致;cardId 经 shape.id 反查一致
- **风险控制**:每步独立 commit + build,可回退;F1.3 破坏性隔离在单 commit

## 完成标准

- domain 26/26 + db 7/7 + web build exit 0
- 画布自由元素持久 + card body preview + inbox→画布实时同步
- 7 个 commit(F1.1-F1.7),每个可独立回退
- F2(工具栏)在此基础上接,不动持久化层