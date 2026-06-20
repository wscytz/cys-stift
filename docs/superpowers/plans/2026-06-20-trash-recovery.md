# Plan · Phase trash · soft-delete 回收/恢复视图(2026-06-20)

> 承接 `docs/memory/decisions/2026-06-19-review-findings.md` 的 #2(产品决策)。
> 入口已定:**新 `/trash` 路由**(活跃 inbox / 归档 archive / 删除 trash 三分离)。
> 本档是 compact 前落盘的实施计划;执行者(主模型 Claude)照此推进 + 自审。

## 背景(为什么)

软删(`softDelete` 设 `deletedAt`)后,**整个 UI 没有任何地方看得到/恢复已删卡** —— inbox 与 archive 都过滤 `!deletedAt`,软删成了事实上的永久删除。但 inbox 软删弹窗文案承诺了 `"you can recover it later from the database"`(见 `apps/web/src/app/inbox/page.tsx` Modal body)—— 承诺了却没实现,是产品完整性 + 诚实性缺口。本 phase 补上恢复入口。

## 探索结论(已确认,别重造)

- **`CardRepository` 已有 `delete(id)`**(`packages/domain/src/services/card-service.ts:26`)→ `hardDelete` 存储层就绪。
- domain 现有 `softDelete`(`:168`),**缺 `restore` + `hardDelete`**(纯逻辑,几行)。
- `Card.deletedAt?: Date`(`types.ts:85`)是独立字段;**restore 只清 `deletedAt`,不动 `archived`/`canvasPosition` → 自然回原位**(inbox/archive/canvas)。
- AppMenu `entries` 数组(`apps/web/src/components/app-menu.tsx`)加一项即可;`activeKey` 用 `pathname.startsWith` 不冲突。
- Toolbar `region` 联合(`packages/ui/src/components/toolbar.tsx`)需加 `'trash'`;`regionColorForStripe` 的 default 已返回 `gray`,**trash 自动灰**。

---

## 范围

### ✅ 做

**domain**(纯逻辑,保零依赖):
- `card-service.ts` 加 `restore(id)`(清 `deletedAt`,bump `updatedAt`)和 `hardDelete(id)`(调 `repo.delete(id)`)。
- `__tests__/card-service.test.ts` 加覆盖:① softDelete→restore 后 `deletedAt` 为 undefined 且 `archived`/`canvasPosition` 保留;② hardDelete 后 `getById` 返回 null、`listAll` 不含。

**ui**:
- `packages/ui/src/components/toolbar.tsx`:`region` 联合加 `'trash'`(颜色落 gray,无需改 `regionColorForStripe`)。

**web**:
- `apps/web/src/app/trash/page.tsx`(新):第 14 个静态路由。`service.listAll().filter(c => c.deletedAt)` 按 `deletedAt` desc 排;复用 `ArchiveCardTile`(`features/archive/archive-card-tile`)的 tile 视觉 + 每卡 **Restore**(清 deletedAt)/**Delete forever**(hardDelete,`Modal` 二次确认,不可逆)按钮;empty state。`<Toolbar region="trash">`。
- `apps/web/src/components/app-menu.tsx`:`entries` 加 `{ href: '/trash', label: 'Trash', key: 'trash' }`。
- `apps/web/src/app/inbox/page.tsx`:软删 Modal body 文案 `"…recover it later from the database"` → `"…restore it from Trash"`(可加 `<Link href="/trash">`)。

**e2e**:
- `scripts/trash-shots.cjs`(新):softDelete 一卡 → `/trash` 出现 → restore → 回 inbox 且 `deletedAt` 清 → 再 softDelete → hardDelete(二次确认)→ `listAll` 不含 + `/trash` 空。截图 + 断言。

**closeout 四件套**:`changelog` / `decisions/2026-06-20-trash.md` / `MEMORY.md` / `current-session.md` + 根 `CLAUDE.md` + tag **`v0.10.0-trash`**。

### ❌ 不做(留后)

- **批量 restore/hardDelete**(archive 已有批量模式,可后续复用;MVP 单卡)。
- **media gc**:hardDelete 只删 card 记录,关联 media assets(`media-store`)留孤儿,Phase 2.5 OPFS 时统一 gc。
- 自动定期清空 trash(保留期)—— 未要求,YAGNI。
- #4 #5 canvas-editor + 其余 UX 洞 —— 不在本 phase。

---

## 关键代码形态

**domain `restore` / `hardDelete`**(对照现有 `softDelete`/`archive` 写法):

```ts
restore(id: CardId): void {
  const card = this.repo.getById(id)
  if (!card) return
  this.repo.update({ ...card, deletedAt: undefined, updatedAt: new Date() })
}

hardDelete(id: CardId): void {
  this.repo.delete(id)  // repo 接口已有 delete(id): void
}
```

> ⚠️ db 层 `delete` 是否真物理删 + 是否处理 `deletedAt` 列,执行时读 `packages/db` 的 repository 实现确认(SQLite `DELETE` vs 标记)。domain 只调 `repo.delete`,存储语义归 db 包。

**/trash 页数据**:`const trashed = service.listAll().filter(c => c.deletedAt).sort((a,b) => +b.deletedAt! - +a.deletedAt!)`。

**文案**(inbox Modal body):`"The card is hidden and marked as deleted. You can restore it from Trash."` + 可选 `<Link href="/trash">Open Trash →</Link>`。

---

## 纪律(执行时)

- ❌ 不改 spec · 不重新选型 · 不加未要求依赖 · 组件层不写死 hex(全 token) · 不破坏 domain 零依赖
- ✅ 静态导出:`/trash` 是静态路由(非 `[param]`),OK
- ✅ 实跑 exit code,不假装通过

## 验证(端到端)

```bash
pnpm --filter domain test     # 含新增 restore/hardDelete 测试,全绿
pnpm --filter db test         # 回归(若 db delete 语义有改,重点看)
pnpm --filter web build       # 静态导出 exit 0,14 页(新增 /trash)
# e2e:
pnpm --filter web dev --port 3016 &
node scripts/trash-shots.cjs
```

断言要点:restore 后卡回原视图(inbox/archive/canvas 之一)且 `deletedAt===undefined`;hardDelete 后 `listAll()` 不含该 id 且 `/trash` 列空;inbox 文案已指向 Trash。
