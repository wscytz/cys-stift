# Phase archive-detail · archive tile 接 detail Modal(2026-06-20)

> 承接 `docs/memory/decisions/2026-06-19-review-findings.md` §🟠 UX 洞 #4:"archive tile 点击 no-op"。
> 入口已定:**archive 接入 Modal,顺手抽 inbox CardDetail 成共享组件**。
> Plan:[`docs/superpowers/plans/2026-06-20-archive-detail.md`](../../superpowers/plans/2026-06-20-archive-detail.md)
> Tag:**v0.12.0-archive-detail**

## 背景

archive 页有完整多选 + 软删 floater,但**单卡点开 no-op**(`archive/page.tsx:110` 注释明说 "Phase 7 Lean: no detail modal in archive")。P6.5b 已把完整版 CardDetail 留在 inbox 内,**没接 archive**。UX 缺口:用户归档后想再编辑/查看,只能去 inbox unarchive 来回折腾。archive 是产品的核心视图之一,这种摩擦属于 P0 UX 修复。

## 决策

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 入口 | 仅 archive 接 detail / **archive 接 + 顺手抽共享组件** | **抽共享** | inbox 已有完整版 CardDetail(P6.5b),与其在 archive 复制,不如抽 `features/card/card-detail.tsx`(与 `editors.tsx` 同层),inbox + archive 双消费,**inbox 体积 8.44 → 5.08 kB(-3.4 kB)**。 |
| shared 放哪 | `features/card/` / `app/inbox/` / `components/` | **features/card/** | P6.5b `editors.tsx` 同层;`features/` 是面向功能的切片,共享 UI 在这里合适;`app/` 是路由私有。 |
| confirm Modal 归属 | consumer page 内置 / **CardDetailModal 内置** | **内置** | 旧 inbox 实现 confirm 在 page(`confirmDelete` state + page-level `<Modal>`),语义分散。共享组件内置 confirm + `onConfirmDelete` 回调,**inbox 净减 ~50 行**且未来 archive 不必再写一遍 confirm UI。 |
| canvas `CardDetailModal` 怎么办 | 同步升级到共享版本 / **保持原样** | **保持原样** | canvas 用的是 Phase 4 简化版(title + body only),已能用;触碰 tagged Phase 4 风险,且 P6.5b 的多媒介编辑不需要出现在 canvas 上下文。 |
| `actions` prop 形态 | boolean flags / **字符串数组** | **字符串数组** | `actions={['unarchive','softDelete']}` 直观;组件按 `actions.includes()` 决定渲染哪个按钮;archive 不需要 `archive`(已是 archived),inbox 不需要传 archive 上下文开关(按 `card.archived` 自路由)。 |

## 改动清单(3 文件新增/重构 + 2 文件更新 + 1 e2e + 4 决策档)

### `apps/web/src/features/card/card-detail.tsx`(新,~360 行)

- 默认 view mode;`initialMode` 可选(view / edit)用于 canvas dblclick 新建空卡路径
- view 模式渲染:type tag + capture time + Markdown body + media + links + code + quotes
- edit 模式渲染:title input + body textarea + media 上传 + ListEditor / CodeEditor / QuoteEditor(P6.5b 复用)
- view mode 工具栏按 `actions` 决定按钮:
  - `archive` + `card.archived === false` → Archive
  - `unarchive` + `card.archived === true` → Unarchive
  - `sendToCanvas` + `!card.canvasPosition` + `onSendToCanvas` 传了 → Send to canvas(primary) / 否则 on canvas tag
  - `softDelete` → Soft-delete(danger),点击打开内置 confirm Modal
- confirm Modal 内置:`cd__confirm` + `cd__confirm-actions`,链接 `/trash`(沿用 inbox 文案)
- `cd__*` 命名空间(从 inbox 原 `detail__*` / `media-list` / `link-list` / `code-block` 收敛)
- escape key 在主 Modal 关主,在 confirm Modal 关 confirm
- styles 自包含 ~150 行

### `apps/web/src/app/archive/page.tsx`

- 新 state `detail: { card } | null`
- `openDetail(id)` helper:`cards.find(x => x.id === id)`
- grid 模式 `onClick={openDetail(card.id)}`(原 no-op 注释删除)
- Timeline 模式 `onOpen={openDetail}`(原 `() => {}` 删除)
- `{detail && <CardDetailModal actions=['unarchive','softDelete'] ...>}`:
  - `onSave`:`service.update` + `setDetail({ card: updated })`
  - `onUnarchive`:`service.unarchive` + `setDetail(null)`
  - `onConfirmDelete`:`service.softDelete` + `setDetail(null)`
  - 不传 `onSendToCanvas`(actions 不含),所以 archive Modal 不显示 "Send to canvas"

### `apps/web/src/app/inbox/page.tsx`(~720 → ~360 行,-360 行)

- 删:本地 CardDetail(~310 行)、DetailState interface、page-level `confirmDelete` state、page-level confirm Modal(3 行 styles)
- 改:`DetailState | null` → `Card | null`(简化 detail state,因为 view/edit 切换现在 Modal 内置)
- 改:`setDetail({ card, mode: 'view' })` → `setDetail(card)`
- 改:`<CardDetail>` → `<CardDetailModal actions=['archive','unarchive','sendToCanvas','softDelete']>`,onArchive / onUnarchive / onSendToCanvas / onConfirmDelete 直接调 service
- 删:`CodeBlock` / `LinkPreview` / `MediaRef` / `Quote` / `MarkdownBody` / `CodeEditor` / `ListEditor` / `QuoteEditor` / `editorStyles` / `DraftCode` / `DraftLink` / `DraftQuote` / `draftCodesToPayload` / `draftLinksToPayload` / `draftQuotesToPayload` / `Input` / `Modal` / `useTransition` / `useRef` 等 13 个 import(全部移到共享组件)
- 净减 ~360 行

### `scripts/archive-detail-shots.cjs`(新)

- seed 1 archived rich card(links + code + quotes)
- grid 点 tile → Modal 打开(view 模式;3 sections 全在)
- Edit → 3 editor panels → 改 title → Save → 持久化断言
- Escape 关 Modal
- Timeline 模式点行 → Modal 打开
- Modal 内 Soft-delete → 内置 confirm Modal → 确认 → /archive 空 + /trash 1
- 15 断言全过

### `scripts/p6.5b-shots.cjs`(更新 selector)

- `.link-list` / `.code-block` / `.detail__quote` / `.detail__hint` → `.cd__links` / `.cd__code` / `.cd__quote` / `.cd__hint`
- 行为不变,功能断言全过

### `scripts/trash-shots.cjs`(更新 selector)

- inbox 软删流程(`clickConfirmSoftDelete`):`.confirm__body` → `.cd__confirm`(共享组件)
- trash 页 hard-delete 流程:**仍用** `.confirm__body`(trash page 没动,仍是原 class)
- 用 sed 全文替换后,只对硬删流程改回去

### canvas `card-detail-modal.tsx`(0 改动)

Phase 4 简化版独立存在,共享组件不替代(避免触碰 tagged Phase 4)。

## 验证(端到端,实跑 exit code)

```
pnpm --filter domain test  → 15 passed(回归)
pnpm --filter db test      →  7 passed(回归)
pnpm --filter web build    → exit 0, 14 静态页
                            /inbox 8.44 → 5.08 kB(-3.4 kB 共享组件提取)
                            /archive 3.15 → 3.27 kB(+120 共享 Modal 引入)

node scripts/p7-shots.cjs                → ✓ ALL ASSERTIONS PASS
node scripts/p6.5b-shots.cjs             → ✓ ALL ASSERTIONS PASS
node scripts/trash-shots.cjs             → PASS ✓ 7/7
node scripts/archive-detail-shots.cjs    → PASS ✓ 15/15(新)
```

## 关键工程决策(总结)

- **共享组件提取** = 把"修 #4"放大成"修 #4 + inbox 净减肥",一举多得
- **confirm Modal 内置** = 内聚更好 + archive 不必重写 confirm UI + inbox page 净减 50 行
- **`actions` 数组 prop** = 比 boolean flags 直观,组件按 `actions.includes()` 渲染
- **`cd__*` class 命名空间** = 共享组件独立于 inbox page 的样式,被多 consumer 共用不污染
- **canvas `CardDetailModal` 不动** = 触碰 tagged Phase 4 风险 > 共享化收益

## 显式留后(YAGNI)

- 批量 soft-delete 二次确认(review §🟠 UX #3 — 误删可 trash 恢复)
- send-to-canvas 反向动作(卡上画布后无"拿回 inbox"按钮)
- archive 内筛选 / 搜索
- archive tile 长按多选(touch UX)
- canvas `CardDetailModal` 升级到共享组件(功能等价但需回归测)
- inbox page dead styles 清理(`.link-list` / `.code-block` / `.media-list` 等无 JSX 引用,留后)
- Phase 8 Tauri build + 签名公证

## 纪律遵守

- ❌ 没改 spec · 没重新选型 · 没加依赖 · 没破坏 domain 零依赖
- ✅ 实跑 exit code:`pnpm --filter web build` exit 0;4 个 e2e 全过
- ✅ 静态导出 14 页不变
- ✅ 抽组件不放 `inbox/`,放 `features/card/`(P6.5b `editors.tsx` 同层)
- ✅ canvas 独立组件不动,触碰 tagged Phase 4 风险 > 共享化收益
- ✅ commit + tag;Conventional Commits
- ✅ closeout 四件套

## 关键文件位置

| 想知道什么 | 看哪里 |
|---|---|
| 本 phase plan | `docs/superpowers/plans/2026-06-20-archive-detail.md` |
| 共享组件 | `apps/web/src/features/card/card-detail.tsx`(新) |
| archive 接入 | `apps/web/src/app/archive/page.tsx` |
| inbox 改用 | `apps/web/src/app/inbox/page.tsx` |
| 新 e2e | `scripts/archive-detail-shots.cjs` |
| 截图 | `docs/design/screenshots/phase-archive-detail/` |