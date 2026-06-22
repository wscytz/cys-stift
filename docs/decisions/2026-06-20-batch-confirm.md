# Phase batch-confirm · archive 批量软删二次确认(2026-06-20)

> 承接 `docs/decisions/2026-06-19-review-findings.md` §🟠 UX 洞 #3:"archive 批量 soft-delete 无二次确认"。
> Plan:[`docs/plans/2026-06-20-batch-soft-delete-confirm.md`](../../plans/2026-06-20-batch-soft-delete-confirm.md)
> Tag:**v0.13.0-batch-confirm**

## 背景

archive 页(`apps/web/src/app/archive/page.tsx`)的 floater 软删按钮一行代码就批量软删 N 张卡,误点风险高:
```tsx
const handleSoftDeleteSelected = () => {
  for (const id of selected) service.softDelete(id)   // ← 无任何确认
  clearSelected()
}
```

架构上不一致:
- **inbox 单卡软删**:`CardDetailModal.onConfirmDelete`(内置 confirm Modal)— 有确认
- **trash 单卡 hardDelete**:page-level confirm Modal — 有确认
- **archive 批量软删**:**无确认** — 唯一缺

批量是高破坏力操作(一次点掉 N 张),确认需求最强。

## 决策

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 入口位置 | floater 按钮前 / **`handleSoftDeleteSelected` 内弹 Modal** | **函数内弹 Modal** | 用户体感一致(floater 按钮一次点击仍开始"软删流程",只是流程多了确认一步);不需要改 floater 行为。 |
| state 形态 | `boolean` / **`CardId[] \| null`** | **数组/null** | null = 隐藏;数组 = "show confirm for these ids"。可以直接保留 selected 引用,无需重新查询。 |
| Modal 命名空间 | `confirm__*` (trash) / **`cd__*` (shared CardDetailModal)** / 新 `bcf__*` | **`confirm__*`** | archive 是 page-level confirm,与 trash 同级(都是 page 自己的 confirm);shared `cd__*` 是组件内嵌 confirm。延续 trash 命名空间避免新词汇。 |
| Cancel 行为 | 清空 selected / **保留 selected** | **保留** | 用户误触 Modal 后可以重新决定,不必重新 tick N 个 checkbox。`clearSelected()` 只在确认软删后才调。 |
| 文案 | 新写 / **复用 trash 链接文案** | **复用** | 单卡软删确认 + trash hardDelete 已承诺"can restore from Trash";本 modal 同样承诺,跨页面一致。 |
| Title 数字格式 | 单数:1 card / **复数:N cards** | **单复数 + 真实数** | "Soft-delete 3 cards?" 自然;单卡时变成 "Soft-delete 1 card?"(虽然批量场景下不太会出现 1,但处理一下)。 |
| 列表 N 大时 | 全列 / **前 5 + "+N more"** | **前 5 + overflow** | N=3 全列;N=50 不会被撑爆,用户仍知道总数。 |
| Danger 按钮 label | `Soft-delete` / **`Soft-delete N`** | **带数量** | 最后一次视觉确认"删几卡"。 |

## 改动清单(1 文件 + 1 e2e + 4 决策档)

### `apps/web/src/app/archive/page.tsx`(~268 → ~310 行,+42 行)

- import 加 `Modal` from `@cys-stift/ui`
- 新 state `confirmBatchDelete: CardId[] | null`
- 改 `handleSoftDeleteSelected`:不再直接软删,改 `setConfirmBatchDelete([...selected])`
- 新 `handleConfirmBatchSoftDelete`:对数组每个 id 调 `service.softDelete`;清空 selected;`setConfirmBatchDelete(null)`
- 新 `handleCancelBatchSoftDelete`:只 `setConfirmBatchDelete(null)`,**保留 selected**
- floater "Soft-delete" 按钮 onClick 不变(仍调 `handleSoftDeleteSelected`,但函数现在弹 Modal)
- 新 `<Modal>` 块(在 floater 之后,detail Modal 之前):
  - `title` = `"Soft-delete N card(s)?"`(单复数)
  - body 1:`"N cards: title1, title2, ... (+ M more)."`
  - body 2:`"These cards will be hidden from the archive. You can restore them from Trash later."` + `<Link href="/trash">`
  - actions:Cancel(ghost)+ `"Soft-delete N"`(danger)
- styles 字符串加 3 段(`.confirm__body` / `.confirm__link` / `.confirm__actions`)

### `scripts/batch-soft-delete-confirm-shots.cjs`(新,~120 行)

- seed 3 归档卡(每卡不同 title)
- /archive → Select → tick 3 → floater "3 selected"
- 点 floater "Soft-delete" → Modal 出现(M1)
  - 断言:modalOpen=true / title 含 "3 cards" / body 列 3 个 title / body 含 `/trash` 链接
- 截图 01-confirm-modal-open
- 点 Cancel → Modal 关闭 / 3 卡仍在 / selected 保留
- 截图 02-after-cancel
- 再次点 floater "Soft-delete" → Modal 重新出现
- 点 danger "Soft-delete 3" → /archive 空 / /trash 3 项
- 截图 03 + 04
- 15 断言全过

### p7-shots.cjs(0 改动)

p7 测 unarchive 不测批量软删,不受影响。

## 验证(实跑 exit code)

```
pnpm --filter domain test                  → 15 passed(回归)
pnpm --filter db test                      →  7 passed(回归)
pnpm --filter web build                    → exit 0, 14 静态页
                                            /archive 3.27 → 3.63 kB(+360 Modal)
node scripts/p7-shots.cjs                              → ✓ ALL ASSERTIONS PASS
node scripts/p6.5b-shots.cjs                           → ✓ ALL ASSERTIONS PASS
node scripts/trash-shots.cjs                           → PASS ✓ 7/7
node scripts/archive-detail-shots.cjs                  → PASS ✓ 15/15
node scripts/batch-soft-delete-confirm-shots.cjs       → PASS ✓ 15/15(新)
```

## 关键工程决策(总结)

- **复用 trash `confirm__*` 命名空间**:避免新词汇;archive 与 trash 都是 page-level confirm,语义同级。
- **复用 inbox/trash 已有 trash 链接文案**:跨 3 个 confirm modal(单卡软删 / 单卡 hardDelete / 批量软删)一致承诺"restore from Trash"。
- **Cancel 保留 selected**:用户误触 Modal 后可重新决定,UX 摩擦最小。
- **列出前 5 + overflow**:N 大时不撑爆。
- **Danger 按钮带数量**:最后一次视觉确认"删几卡"。

## 显式留后(YAGNI)

- 批量 Unarchive 加确认(非破坏性,review 没要求)
- 输入卡名 "delete" 才确认(高强度确认,信任 Modal 拦截,匹配现有 confirm 风格)
- 把 batch confirm 抽到 features/card 共享组件(archive 是唯一批量场景,提前抽象 YAGNI)
- 批量 select 自动全选按钮(纯 UX 改进)
- **UX #2 send-to-canvas 反向动作**(review 唯一剩余 UX 洞)

## 纪律遵守

- ❌ 没改 spec · 没重新选型 · 没加依赖 · 没破坏 domain 零依赖
- ✅ 实跑 exit code:`pnpm --filter web build` exit 0;5 个 e2e 全过
- ✅ 静态导出 14 页不变
- ✅ 沿用 trash `confirm__*` 命名空间,不引入新词汇
- ✅ commit + tag;Conventional Commits
- ✅ closeout 四件套

## 关键文件位置

| 想知道什么 | 看哪里 |
|---|---|
| 本 phase plan | `docs/plans/2026-06-20-batch-soft-delete-confirm.md` |
| 主改动 | `apps/web/src/app/archive/page.tsx`(+42 行) |
| e2e | `scripts/batch-soft-delete-confirm-shots.cjs` |
| 截图 | `docs/design/screenshots/phase-batch-confirm/` |