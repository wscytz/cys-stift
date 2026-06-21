# 2026-06-21 · v0.26.4-canvas-bugfixes

> 来源: [`docs/reviews/2026-06-21-canvas-deep-review.md`](../../reviews/2026-06-21-canvas-deep-review.md)。3 个 Explore agent 独立审计 v0.26.3 canvas + tldraw 集成,找到 9 个问题。本档关闭其中 4 个 critical/high。剩余 B6-B9(性能/边界/cosmetic)defer。

## 修复明细

### B1 — 跨 tab 同步(db-client.ts)

**问题**: `db-client.ts:46-48` 用 `_subscribers` + `notify()` 通知本 tab 的 useSyncExternalStore,但没监听 `window.storage` event。同机两 tab 编辑 → 互相静默覆盖,直到 manual reload。

**修法**: db-client.ts 模块级 `window.addEventListener('storage', ...)`。检测 `cys-stift.cards.v1` 变化 → 重新 parse → 更新 `_cards` → `notify()` 本 tab。

**不引入跨 tab 编辑冲突解决**(那是 CRDT 范畴,Yjs/Automerge)。这只解决"别人改了,我知道"。

### B3 — DB 与 shape 位置 reconcile(canvas-binding.ts:90-108)

**问题**: `loadCardsIntoEditor` 用 `if (editor.getShape(cardId)) continue` 跳过已存在 shape。snapshot 已存 shape 几何,但 DB 可能更新了(canvasPosition 改了),跳过 → **DB 位置丢失**。

**修法**: 比较 existing shape 的 x/y/w/h/rotation vs DB canvasPosition,drift 则 `updateShape` reconcile。`mergeRemoteChanges` 标记 remote → writeback listener(source:'user')忽略,不会循环。

### B4 — 删画布清 snapshot(canvas-store.ts:234-246)

**问题**: `canvasStore.delete()` 只删 canvases 索引,**不调** `canvasSnapshotStore.remove()` → snapshot(含所有 freeform shapes + hand-draw paths)**永远占** localStorage 配额。

**修法**: delete 内调 `canvasSnapshotStore.remove(id)`,删画布同时清对应 snapshot。

### B5 — flush race guard(canvas-binding.ts:122-138)

**问题**: `bindCardWriteback` 的 300ms 防抖 flush — 期间用户在 inbox 软删/归档/移走卡 → flush 仍写旧拖动位置,覆盖。

**修法**: flush 时除 `card !== null` 外,加 3 guard:`deletedAt == null`、`!archived`、`canvasPosition?.canvasId === canvasId`。任一不满足 → skip。

## B2(被 B3 隐式修)

trash restore 后卡在不同 canvas → 切到那张卡的 canvas → onMount → loadSnapshot → loadCardsIntoEditor(B3 reconcile)→ shape 在。无需额外代码。

## 验收

- domain 26/26 + db 7/7 + web build exit 0
- e2e 17/17(原 12 + 新增 5:B1 storage dispatch / B4 sentinel write+remove / canvas snapshot exists / cards key present / B4 unit-level)

## 不修复(defer)

- B6 snapshot 全量序列化主线程阻塞(大画布) — 中等性能问题,大改,留 M1 后
- B7 删画布不关 modal — cosmetic,1 行
- B8 `__canvasEditor` global 不清 — minor leak,1 行
- B9 sync + 显式 removeCardShape 重复 — 冗余无害

## 已知遗留

无 — 4 critical/high 全修,剩余 deferred 都有明确边界 + 工作量。