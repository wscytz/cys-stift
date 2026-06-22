# Plan · Phase archive-detail · archive tile 接 detail Modal

> 承接 `docs/decisions/2026-06-19-review-findings.md` §🟠 UX 洞 #4:"archive tile 点击 no-op"。
> 范围:**archive 引入 CardDetailModal(view + edit),点 tile → 打开详情**;顺手把 inbox 的本地 CardDetail 抽成共享组件,避免重复。
> 本档是实施计划;执行者(主模型 Claude)照此推进 + 自审。

## 背景(为什么)

archive 页(`apps/web/src/app/archive/page.tsx`)有完整的多选 + 软删 floater,但**单卡点开 no-op**:`page.tsx:110` 注释明说 "Phase 7 Lean: no detail modal in archive; opening is intentionally not wired"。P6.5b 已把 CardDetail 抽到 inbox 内,但没接 archive。UX 上:用户把卡归档后,想再编辑/查看,只能去 inbox unarchive 才能开,来回折腾。

## 探索结论(已确认,别重造)

- **`ArchiveCardTile.onClick` 接口已就位**(`apps/web/src/features/archive/archive-card-tile.tsx:11`):消费者传回调即可。
- **`Timeline` 也已传 `onOpen(id)`**(`features/archive/timeline.tsx:10, 52`):archive 页面已写 `onOpen={() => {}}` no-op,只缺真 handler。
- **inbox `CardDetail` 是完整版**(5 字段 patch,view + edit,view 渲染 markdown / media / links / code / quotes,edit 暴露全部 5 字段编辑器)。
- **canvas `CardDetailModal` 是简化版**(只 title + body,自带 confirm Modal,确认文案是 canvas 上下文);本 phase 不动 canvas(MVP 已能用)。
- **inbox 当前 page-level soft-delete confirm**:`page.tsx:177-201`,由 `setConfirmDelete(id)` 触发。共享组件内置 confirm modal 后,inbox 删掉这段。

## 范围

### ✅ 做

**新 `features/card/card-detail.tsx`(共享组件)**:
- 基于 inbox 当前 CardDetail,内置:
  - view mode:Markdown / media / links / code / quotes 渲染
  - edit mode:title / body / media 上传 / ListEditor / CodeEditor / QuoteEditor(P6.5b 已抽的 editors 复用)
  - view mode 工具栏:**actions 按需展示**(`actions` prop 控制)
  - 内置 **soft-delete 二次确认 Modal**(替换 inbox page-level 的)
- Props:
  ```ts
  interface CardDetailModalProps {
    card: Card
    initialMode?: 'view' | 'edit'   // 默认 'view'
    /** 可执行动作集合。consumer 按上下文决定能做什么。
     *  archive 上下文:unarchive + softDelete
     *  inbox 上下文:archive + sendToCanvas + softDelete(unarchive 只在 archived tab 显示) */
    actions: Array<'archive' | 'unarchive' | 'sendToCanvas' | 'softDelete'>
    onClose: () => void
    onSave: (patch: SavePatch) => void
    onArchive?: () => void
    onUnarchive?: () => void
    onSendToCanvas?: () => void
    onConfirmDelete: () => void
  }
  type SavePatch = {
    title: string
    body: string
    media: MediaRef[]
    links: LinkPreview[]
    codeSnippets: CodeBlock[]
    quotes: Quote[]
  }
  ```
- 所有 styles 内置(从 inbox/page.tsx 拷 `.detail` / `.media-list` / `.link-list` / `.code-block` / `.detail__quote` / `.dsec` + confirm modal styles)。

**archive/page.tsx**:
- 引入 `CardDetailModal` + `DEFAULT_CANVAS_ID`(可选,本期不接 send-to-canvas)
- state `detail: { card } | null`;grid + Timeline 的 onClick 都设为 `setDetail({ card })`
- `actions=['unarchive', 'softDelete']`(archive 上下文不能 archive——它已经是 archived)
- `onUnarchive` → `service.unarchive(id)` + `setDetail(null)`(卡从 archive 列表移除)
- `onConfirmDelete` → `service.softDelete(id)` + `setDetail(null)`
- `onSave` → `service.update(id, patch)` + 更新 detail card(让 edit 后的 view 立即显示新值)
- `onSendToCanvas` 不传 actions(`undefined` 就不显示按钮)

**inbox/page.tsx**:
- 引入共享 `CardDetailModal`
- 删本地 `CardDetail` 组件 + `DetailState` 类型 + page-level `confirmDelete` state + page-level confirm `<Modal>`
- inbox 当前能做的动作:**`archive` + `sendToCanvas` + `softDelete`**(`unarchive` 在 archived tab 自动显示,因共享组件读 `card.archived` 字段)
- 但 inbox 的 archived tab 上下文:**`unarchive` + `sendToCanvas` + `softDelete`**

实际看 inbox 现在的 CardDetail 实现:`card.archived ? <Unarchive> : <Archive>` 同一按钮根据状态切换。共享组件按这个模式走,actions 传全:`['archive','unarchive','sendToCanvas','softDelete']`,组件内部按 `card.archived` 决定渲染哪个。

**e2e `scripts/archive-detail-shots.cjs`(新)**:
- seed 1 archived 卡
- 打开 /archive → 点 tile → Modal 打开(view mode)→ 截图
- 点 Edit → edit mode 出现 → 改 title → save → 持久化断言
- 关闭 Modal,点 Timeline 模式 → 点行 tile → Modal 再次打开(view mode)→ 截图
- 软删:打开 Modal → 点 Soft-delete → confirm Modal 出现 → 确认 → /archive 列空 + /trash 出现 1

**p7 archive e2e 回归**(multi-select + floater 批量 unarchive/soft-delete):行为不变,跑一次确保不破。

**inbox e2e**:本来无独立 e2e,但 archive-detail 改 inbox → 跑现有 `scripts/p6.5b-shots.cjs`(详情 Modal 编辑)。若有 inbox 截图相关 script 也跑。

**closeout 四件套**:`changelog` / `decisions/2026-06-20-archive-detail.md` / `MEMORY.md` / 根 `CLAUDE.md` / `current-session.md` + tag **`v0.12.0-archive-detail`**。

### ❌ 不做(留后)

- canvas `CardDetailModal` 升级到共享版本(简化版已能用,触碰 tagged Phase 4 风险)
- archive 接 Send-to-canvas 反向(归档卡先 unarchive 才能上画布 — 不增加 archive 上下文价值)
- archive 接 media 上传(已通过 detail Modal 暴露,够用)
- archive tile 长按多选(touch UX,YAGNI)
- archive 内的筛选 / 搜索(纯 UI,YAGNI)

## 关键代码形态

**`features/card/card-detail.tsx` 共享组件** ~250 行,完全自包含,唯一外部依赖是 `editors` + `media-store` + `@cys-stift/ui` + `inbox/markdown`。

**archive 接入**:
```tsx
const [detail, setDetail] = useState<{ card: Card } | null>(null)
// ...
<ArchiveCardTile ... onClick={() => setDetail({ card })} />
<Timeline ... onOpen={(id) => {
  const c = cards.find(x => x.id === id)
  if (c) setDetail({ card: c })
}} />
{detail && (
  <CardDetailModal
    card={detail.card}
    actions={['unarchive', 'softDelete']}
    onClose={() => setDetail(null)}
    onSave={(patch) => {
      service.update(detail.card.id, patch)
      const updated = service.get(detail.card.id)
      if (updated) setDetail({ card: updated })
    }}
    onUnarchive={() => {
      service.unarchive(detail.card.id)
      setDetail(null)
    }}
    onConfirmDelete={() => {
      service.softDelete(detail.card.id)
      setDetail(null)
    }}
  />
)}
```

**inbox 接入**(简版):
```tsx
{detail && (
  <CardDetailModal
    card={detail.card}
    actions={['archive', 'unarchive', 'sendToCanvas', 'softDelete']}
    onClose={() => setDetail(null)}
    onSave={(patch) => {
      const updated = service.update(detail.card.id, patch)
      if (updated) setDetail({ card: updated, mode: 'view' })
    }}
    onArchive={() => { service.archive(detail.card.id); setDetail(null) }}
    onUnarchive={() => { service.unarchive(detail.card.id); setDetail(null) }}
    onSendToCanvas={() => { /* 原逻辑搬过来 */ }}
    onConfirmDelete={() => { service.softDelete(detail.card.id); setDetail(null) }}
  />
)}
// 删除 page-level confirmDelete state + confirm <Modal>
```

## 纪律(执行时)

- ❌ 不改 spec · 不重新选型 · 不加未要求依赖 · 组件层不写死 hex(全 token) · 不破坏 domain 零依赖
- ✅ 静态导出:`/archive` 是静态路由,本次只改 archive 页内容,无新路由
- ✅ 实跑 exit code,不假装通过
- ✅ 抽组件不放进 `inbox/page.tsx`(那是 inbox 私有);放 `features/card/`(P6.5b 的 `editors.tsx` 同层)
- ✅ 共享组件不动 canvas 的 `card-detail-modal.tsx`(独立组件,简化版已能用)
- ✅ `editorStyles` 在共享组件里 import(`@/features/card/editors` 已 export)

## 验证(端到端)

```bash
pnpm --filter domain test     # 15 passed(本次未改 domain)
pnpm --filter db test         #  7 passed
pnpm --filter web build       # exit 0,14 静态页
# e2e
pnpm --filter web dev --port 3016 &
node scripts/archive-detail-shots.cjs      # 新功能
node scripts/p6.5b-shots.cjs               # inbox 详情编辑回归
node scripts/p7-shots.cjs                  # archive 多选批量回归
node scripts/trash-shots.cjs               # trash 回归(softDelete flow)
```

断言要点:archive 点 tile → view 模式打开;edit → save → 持久化;timeline 行点击同样工作;softDelete confirm Modal 出现;inbox 详情仍可编辑保存;p7 多选批量不破。