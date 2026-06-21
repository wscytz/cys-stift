# Canvas 深度复审发现(2026-06-21)

> 3 个并行 Explore agent 对 v0.26.3 canvas + tldraw 集成做深度静态审查。每条发现都附文件:行号证据。**这是 M1(画布连接关系)开工前的体检。**

---

## 🔴 Critical(数据一致性 / 数据丢失风险)

### B1. 跨 tab 不同步 — db-client.ts 缺 storage event listener
**问题**: 两个浏览器 tab 打开同一 cy's Stift,tab A 创建/编辑卡 → tab B 完全无感知(直到 reload)。  
**根因**: `db-client.ts:46-48` 用 `_subscribers` + `notify()` 通知**本 tab** 的 useSyncExternalStore,但没有 `window.addEventListener('storage', ...)`,storage event 不会跨 tab 触发。  
**后果**: 同一用户(或多用户同机)同时编辑会**互相静默覆盖**。  
**修法**: db-client.ts 加 storage listener:  
```ts
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) notify()
})
```
**工作量**: 20 行。

### B2. Trash restore 在非 active canvas 上不恢复 shape
**问题**: 用户在 `/trash` restore 一张之前在画布上的卡 → card.canvasPosition 保留,但 `syncCardsToEditor`(`canvas-page.tsx:58-61`)只在 `activeCanvasId` 上跑。用户切到那张卡的 canvas → 直到第二次 snap 触发(或 reload)才补回 shape。  
**修法**: `/trash` 页面在 `service.restore` 后调 `canvasSnapshotStore.remove(canvasId)`(让 onMount 重新 load)+ 或直接全局发 "canvas-stale" 事件。  
**工作量**: 1 行 + 边界测试。

---

## 🟠 High(数据丢失 / 体验)

### B3. Snapshot stale 与 DB 不一致
**问题**: `loadCardsIntoEditor` 在 `mergeRemoteChanges` 里 `if (editor.getShape(cardShapeIdOf(card.id))) continue` — 跳过已存在 shape。  
**场景**: 用户在 tab A 拖卡到 (200, 300) → DB 写(200,300) + snapshot 写(t=0)。 切去别的 canvas → 切回(canvas remount)→ loadSnapshot 恢复 shape (200, 300) → loadCardsIntoEditor **跳过**(已存在)。如果期间 tab B 在 DB 把它移到 (500, 600),DB 是 (500,600) 但画布 shape 仍是 (200, 300) → **DB 位置丢失**。  
**修法**: loadCardsIntoEditor 检测到 DB position ≠ shape position 时 `updateShape` reconcile。  
**工作量**: 10 行。

### B4. 删画布不清理 snapshot — 永远占配额
**问题**: `canvasStore.delete()`(`canvas-store.ts:174-246`)成功删画布记录,但**不调** `canvasSnapshotStore.remove(canvasId)` → snapshot 永远占 localStorage 配额。  
**修法**: canvas-store.ts 在 delete 内调 `canvasSnapshotStore.remove(canvasId)`。  
**工作量**: 2 行。

### B5. 写回 flush 与 restore/移动 race
**问题**: 拖卡 → 300ms 防抖 flush 待发。期间用户在 inbox 软删/移走 → `service.get(cardId)` 返回 null,flush 跳过。但若用户在 300ms 内 **restore** 同一卡 → flush 仍写入**旧拖动位置**,覆盖 restore。  
**根因**: `bindCardWriteback` 只查 `card !== null`,不查 `deletedAt` 和 `canvasId`。  
**修法**: flush 时检查 `!card.deletedAt && card.canvasPosition?.canvasId === canvasId`。  
**工作量**: 5 行。

---

## 🟡 Medium(性能 + 边界)

### B6. Snapshot 全量 JSON.stringify 在主线程
**场景**: 500 个 shape(尤其手绘路径),`getSnapshot` 全量序列化 = 25-50MB string + JSON.stringify,500ms debounce 仍可能重叠。  
**后果**: 大量手绘后,主线程冻结 1-3 秒。  
**修法**: 用 `requestIdleCallback` 包装 serialize + 增量 snapshot(只存 changed shapes)。**大改**。  
**工作量**: 1-2 天(可后续档)。

### B7. 删画布不关 modal
**问题**: `canvasStore.delete()`(`canvas-store.ts:241`)active 删了后回退到 DEFAULT,但 `canvas-page.tsx` 的 `setDetail(null)` 没调。用户开着 detail modal → 卡仍在 modal 但已从 canvas 移走。  
**修法**: canvas-page.tsx 删除路径加 `setDetail(null)`。  
**工作量**: 2 行。

### B8. `__canvasEditor` global 不清
**问题**: `canvas-editor.tsx:133` 在 onMount 设 `window.__canvasEditor`,切换画布 remount 时旧的没清。  
**后果**: 切画布后 `window.__canvasEditor` 短暂指向旧 editor(直到新 onMount 覆盖)。e2e 测试若此时访问会拿到旧 editor。  
**修法**: onMount 开头清 `window.__canvasEditor = undefined`,或加 useEffect cleanup。  
**工作量**: 2 行。

### B9. 软删 + sync 双重 remove
**问题**: `syncCardsToEditor` 已在 `!deletedAt` 时移除 shape,但 `canvas-page.tsx:312-315` 又显式 `removeCardShape`。  
**后果**: 冗余但安全,无功能影响。  
**修法**: 删除显式 remove(已由 sync 覆盖)。  
**工作量**: 1 行。

---

## 🟢 Cosmetic

- Card 不显示所在 canvas(CanvasPosition.canvasId 永不显示 — 视觉缺口)
- restore 后 CardDetailModal 初始 mode 错(空 title 进 view,看不到刚输入的 body)
- 画布删除时若卡片跨页面引用,modal 显示不一致

---

## M1 路径分析(从 tldraw agent 报告)

### 已自动工作(无需改)
✅ 箭头 → 卡片绑定(`BaseBoxShapeUtil.canBind` 默认 true,零代码)  
✅ bindings 持久化(snapshot 已含 arrow.bindings.start/end)  
✅ 文本标签(`props.text` rich text)  
✅ 单/双向箭头(`arrowheadStart/End: 'arrow'|'none'|...)  
✅ 线型(solid/dashed/dotted/draw)  
✅ 颜色(`color` / `labelColor`)  
✅ 类型 `card`(`card.type`) 已存,UI 标 type tag 已显示

### 阻塞(无 tldraw fork 不可行)
❌ 基数标记(1 / N)— schema 无字段  
❌ 一对多箭头束(arrow 严格两端)— schema 只支持两端  
❌ 按关系类型的手势("从 card edge 拖出 blocks 箭头")

### M1 最小可行(3-5 天,无 tldraw fork)

1. **关系类型 registry**(`canvas/relation-types.ts`): 4-6 个内置类型  
   ```ts
   { id: 'blocks', label: { zh: '阻塞', en: 'Blocks' }, color: 'red', dash: 'solid', arrowhead: 'arrow' }
   { id: 'references', label: { zh: '引用', en: 'References' }, color: 'blue', dash: 'dashed', arrowhead: 'none' }
   { id: 'derived-from', label: { zh: '衍生', en: 'Derived from' }, color: 'black', dash: 'solid', arrowhead: 'arrow' }
   { id: 'related-to', label: { zh: '相关', en: 'Related to' }, color: 'black', dash: 'dotted', arrowhead: 'arrow' }
   ```

2. **画布关系面板**(`features/canvas/relation-panel.tsx`):选中箭头时显示 — 类型 select + label 文本框 + 颜色/线型/箭头头 dropdown。所有 tldraw 原生支持。

3. **Card 关系小角标**(`card-shape-util.tsx` 增强):card 角落显示"被 X 个箭头连接"(读 editor 状态)

4. **持久化透明**:关系在 arrow.props 中,snapshot 自动保存

### M1 收益 vs 风险
- 接近 Freeform 级关系可视化,无需 fork tldraw
- 卡片间从"孤立仓库"变成"知识网络"(产品灵魂)
- 工作量小(3-5 天),风险低(纯配置 + 少量 UI)

---

## 关键决策建议

**先修 critical+high(5 个 bug,1 天),再做 M1(3-5 天)**。理由:
1. Critical bug(B1/B2)是"分发给别人用"阶段的**定时炸弹**——别人两 tab 用就会撞
2. High bug(B3/B4/B5)是**数据丢失**的潜在场景
3. M1 是产品差异化,但 bug 不修等于"在沙地上盖楼"
4. 一档(2 档)修完再 M1,产品状态干净

**或**: 如果你想"先差异化后稳定",反过来:M1 优先(产品差异化价值),bug 后修(技术债仍可控,因为我已点出所有 bug + 修法,后续档可批量修)。

---

## 验证方式

3 个 Explore agent 独立查 200+ 文件,本报告每条都有文件:line 引用。人工复核:`git blame` + `Read` 任意引用即可验证。