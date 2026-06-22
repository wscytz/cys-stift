# Plan · Phase batch-soft-delete-confirm · 批量软删二次确认(2026-06-20)

> 承接 `docs/decisions/2026-06-19-review-findings.md` §🟠 UX 洞 #3:"批量 soft-delete 无二次确认"。
> 入口:archive floater 的 Soft-delete 按钮前弹 Modal(沿用 inbox/trash 已有 confirm 文案风格)。
> 本档是实施计划;执行者(主模型 Claude)照此推进 + 自审。

## 背景(为什么)

archive 页(`apps/web/src/app/archive/page.tsx:55-60`)的 `handleSoftDeleteSelected` 直接 `for (id of selected) service.softDelete(id)` —— **无任何确认**。floater 按钮一行代码就批量软删,误点风险高。review §🟠 UX 洞 #3。

inbox 单卡软删走共享 `CardDetailModal.onConfirmDelete`(内置 confirm),单卡 trash hardDelete 走 page-level confirm Modal(`apps/web/src/app/trash/page.tsx`)—— **单卡路径全有确认,批量路径唯一没有**。架构上不一致,且批量是高破坏力操作(一次点掉 N 张卡),确认需求最强。

## 探索结论(已确认,别重造)

- **`Modal` 已在 archive imports 缺**(当前只 import Button/UICard/Tag/Toolbar),需加 `Modal`。
- **inbox 软删 confirm 文案已存在**(`features/card/card-detail.tsx:280-285`):`"The card is hidden and marked as deleted. You can restore it from Trash later."` + `<a href="/trash">`。复用这个文案风格,只把"card"改成"N cards"。
- **trash hardDelete confirm 文案**(`apps/web/src/app/trash/page.tsx:84-87`):显示卡名 + `"will be removed permanently. This cannot be undone."` —— **更狠**。批量软删的破坏力介于单卡软删(可恢复)与 hardDelete(不可逆)之间,文案应说明"可从 Trash 恢复"而非"不可撤销"。
- **selected state 是 `Set<CardId>`**(`page.tsx:19`):Modal 需要拿到这 N 张卡的 title 显示给用户;`cards` 已 memo 出来,过滤 `selected` 即可。
- **archive 已存在的 local Modal styles**:`trash/page.tsx` 用 `.confirm__body` + `.confirm__actions`,inbox 共享组件用 `.cd__confirm` + `.cd__confirm-actions`。**新 Modal 复用 trash 的 `.confirm__*`** —— 避免引入新 class 命名空间(trash 仍在用 `confirm__*`)。
- **CSS 已有**:trash/page.tsx 的 `.confirm__body`/`.confirm__actions` 写在 trash/page.tsx styles 字符串里,不能跨文件复用;archive 自己的 styles 字符串里需要重新声明这两段。

## 范围

### ✅ 做

**`apps/web/src/app/archive/page.tsx`**:
- import 加 `Modal` from `@cys-stift/ui`
- 新 state `confirmBatchDelete: CardId[] | null`(null = 不显示;数组 = 显示)
- 改 `handleSoftDeleteSelected`:不再直接软删,改 `setConfirmBatchDelete([...selected])` 弹 Modal
- 新 `handleConfirmBatchSoftDelete`:对 `confirmBatchDelete` 数组每个 id 调 `service.softDelete`;清空 selected;setConfirmBatchDelete(null)
- 新 `handleCancelBatchSoftDelete`:只 `setConfirmBatchDelete(null)`,保留 selected
- floater 的 Soft-delete 按钮 onClick 改 → `handleSoftDeleteSelected`(弹 Modal)
- 新增 `<Modal>`(在 `selectMode && selected.size > 0` floater 之后,detail Modal 之前):
  - title: `"Soft-delete N card(s)?"`(单复数处理)
  - body: 显示前 5 个 title(避免 N=50 时撑爆 modal),其余用 `"+N more"`
  - 副本:"These cards will be hidden from the archive. You can restore them from Trash later."
  - 链 `<Link href="/trash">Open Trash →</Link>`
  - actions: Cancel(ghost) + "Soft-delete N"(danger)
- styles 字符串加 `.confirm__body` + `.confirm__actions` 两段(trash 同款;ColorToken 全用 var)

**e2e `scripts/batch-soft-delete-confirm-shots.cjs`(新)**:
- seed 3 归档卡(每卡不同 title 便于确认)
- 进 /archive,点 Select,选 3 张 → floater 出现 "3 selected"
- 点 floater "Soft-delete" → **Modal 出现**(断言 modalOpen,3 个 title 可见)
- 截图 1(确认 modal)
- 点 Cancel → Modal 关闭,3 卡仍在 archive(selected 保留)
- 再次点 floater "Soft-delete" → Modal 再次出现
- 点 "Soft-delete 3" → `/archive` 空 + `/trash` 3 项
- 截图 2(空 archive)
- 0 page error
- 5 断言全过

**回归**:`p7-shots.cjs`(原 archive 批量测试)— 当前脚本会测多选 + floater,但**不测二次确认**。需要更新:在 `handleSoftDeleteSelected` 触发后,等 confirm Modal 出现,再点确认的 "Soft-delete" 按钮(原来是直接点 floater "Soft-delete" 就批量软删)。

**closeout 四件套**:`changelog` / `decisions/2026-06-20-batch-confirm.md` / `MEMORY.md` / 根 `CLAUDE.md` / `current-session.md` + tag **`v0.13.0-batch-confirm`**。

### ❌ 不做(留后)

- 批量 Unarchive 加确认(非破坏性,review 没要求,YAGNI)
- 批量 select 自动全选按钮(纯 UX 改进,YAGNI)
- 输入卡名 "delete" 才确认的高强度确认(信任 Modal 拦截,匹配 inbox/trash 现有 confirm 风格)
- 批量 soft-delete + 跳到 trash 一步(用户可在 toast/链接点跳转,自动跳太激进)
- 把 batch confirm 也抽到 features/card 共享组件(archive 是唯一批量场景,提前抽象 YAGNI)

## 关键代码形态

**archive/page.tsx 改动**:

```tsx
// 新 state
const [confirmBatchDelete, setConfirmBatchDelete] = useState<CardId[] | null>(null)

// 改
const handleSoftDeleteSelected = () => {
  // 不要直接软删 —— 弹 Modal 二次确认(review §🟠 UX #3)
  setConfirmBatchDelete([...selected])
}

const handleConfirmBatchSoftDelete = () => {
  if (!confirmBatchDelete) return
  for (const id of confirmBatchDelete) {
    service.softDelete(id)
  }
  setConfirmBatchDelete(null)
  clearSelected()
}

const handleCancelBatchSoftDelete = () => {
  setConfirmBatchDelete(null)
  // 保留 selected,user 可能想重新决定
}

// floater Soft-delete 按钮
<Button variant="danger" onClick={handleSoftDeleteSelected}>
  Soft-delete
</Button>

// 新 Modal(放 detail Modal 之前)
{confirmBatchDelete && (
  <Modal
    open
    onClose={handleCancelBatchSoftDelete}
    title={`Soft-delete ${confirmBatchDelete.length} card${
      confirmBatchDelete.length === 1 ? '' : 's'
    }?`}
  >
    <p className="confirm__body">
      {(() => {
        const titles = confirmBatchDelete
          .map((id) => cards.find((c) => c.id === id)?.title || '(untitled)')
          .slice(0, 5)
        const overflow = confirmBatchDelete.length - titles.length
        return (
          <>
            <strong>{titles.length} card{confirmBatchDelete.length === 1 ? '' : 's'}:</strong>{' '}
            {titles.join(', ')}
            {overflow > 0 && `, and ${overflow} more`}.
          </>
        )
      })()}
    </p>
    <p className="confirm__body">
      These cards will be hidden from the archive. You can{' '}
      <Link href="/trash" className="confirm__link">
        restore them from Trash
      </Link>{' '}
      later.
    </p>
    <div className="confirm__actions">
      <Button variant="ghost" onClick={handleCancelBatchSoftDelete}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleConfirmBatchSoftDelete}>
        Soft-delete {confirmBatchDelete.length}
      </Button>
    </div>
  </Modal>
)}
```

**styles 字符串加**:
```css
.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
```

## 纪律(执行时)

- ❌ 不改 spec · 不重新选型 · 不加未要求依赖 · 组件层不写死 hex(全 token) · 不破坏 domain 零依赖
- ✅ 静态导出:`/archive` 是静态路由,本次只加 state + Modal,无新路由
- ✅ 实跑 exit code,不假装通过
- ✅ 文案风格复用 trash page(同 `confirm__*` class 命名空间)
- ✅ 用 `@cys-stift/ui` 的 `Modal`,不引第三方

## 验证(端到端)

```bash
pnpm --filter domain test     # 15 passed(本次未改 domain)
pnpm --filter db test         #  7 passed
pnpm --filter web build       # exit 0,14 静态页(不变)

# e2e
pnpm --filter web dev --port 3016 &
node scripts/batch-soft-delete-confirm-shots.cjs    # 新功能
node scripts/p7-shots.cjs                          # 回归(需要更新以适应新 confirm)
node scripts/archive-detail-shots.cjs              # archive 单卡 detail 回归
node scripts/p6.5b-shots.cjs                       # inbox 详情编辑回归
node scripts/trash-shots.cjs                       # trash 软删/恢复回归
```

断言要点:Modal 出现 + 3 个 title 可见 + Cancel 保留 selected + 再次确认软删 + /archive 空 + /trash 3 + 0 page error。