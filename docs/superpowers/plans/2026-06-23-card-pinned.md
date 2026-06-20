# Card.pinned UI Implementation Plan (Phase A)

**Goal:** 给 Card.pinned 字段(domain 已现成)接上 UI — tile 星标 + 列表置顶排序 + detail modal Pin 按钮。

**Architecture:** 纯 web 层 + i18n。domain `Card.pinned` / `UpdateCardPatch.pinned` / `update()` 第 121 行已支持,**domain 零改动**。toggle 走 `service.update(id, { pinned: !card.pinned })`,不加新 domain 方法(YAGNI)。

**Tech Stack:** Next.js 15 + React 19 + CSS-in-style-tag。

---

## 改动文件

| 文件 | 改动 |
|---|---|
| `apps/web/src/lib/i18n/messages.ts` | 加 `card.detail.pin` / `card.detail.unpin` |
| `apps/web/src/app/inbox/page.tsx` | CardTile 加 ★ 按钮 + inbox/archived 列表 pinned 前置排序 |
| `apps/web/src/features/archive/archive-card-tile.tsx` | 加 `onTogglePin` prop + ★ 按钮 + pinned 视觉态 |
| `apps/web/src/app/archive/page.tsx` | 传 `onTogglePin` + 列表 pinned 前置排序 |
| `apps/web/src/features/card/card-detail.tsx` | `CardDetailAction` 加 `'pin'` + `onTogglePin` prop + view toolbar Pin/Unpin 按钮 |

不动 domain / db / ui 包组件库 / spec / dependencies。

---

## 设计

### 视觉
- tile 右上角 ★ 按钮(absolute 定位),`stopPropagation` 不触发 tile open
- 未 pinned:灰色 ★ (`--color-gray`)
- pinned:黄色 ★ (`--color-yellow`,包豪斯强调色,与 inbox 红 / archive 蓝区分)
- pinned 卡 tile 加 `tile--pinned` class,左边框加粗成黄色条(复用现有 `.tile__bar`,pinned 时背景改黄)

### 排序
每个列表:pinned 前置,同 pinned 内保持原序(capturedAt / updatedAt desc)。inline sort comparator:
```
(a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : by(b) - by(a))
```

### detail modal
- `CardDetailAction` 联合类型加 `'pin'`
- props 加 `onTogglePin?: () => void`
- view toolbar:若 `actions` 含 `'pin'`,渲染 Pin/Unpin toggle 按钮(文字依 `card.pinned`),调 `onTogglePin`

### i18n keys
- `card.detail.pin`: 固定 / Pin
- `card.detail.unpin`: 取消固定 / Unpin

---

## 任务

### A1: i18n keys
messages.ts 加 2 个 key。

### A2: inbox CardTile + 排序
- CardTile 接 `onTogglePin` prop,右上角 ★ 按钮
- inbox/page.tsx 的 `inbox` / `archived` 列表 sort 加 pinned 前置
- pinned tile 视觉(黄左边条 + 填充 ★)

### A3: ArchiveCardTile + archive page
- ArchiveCardTile 加 `onTogglePin` prop(默认 undefined 时不渲染按钮,向后兼容)
- ★ 按钮 + pinned 视觉
- archive/page.tsx 传 `onTogglePin={() => service.update(card.id, { pinned: !card.pinned })}` + 排序 pinned 前置

### A4: card-detail modal Pin action
- `CardDetailAction` 加 `'pin'`
- `CardDetailModalProps` 加 `onTogglePin?: () => void`
- view toolbar 渲染 Pin/Unpin 按钮
- 三个 caller(inbox/archive/search)传 `onTogglePin` + actions 数组加 `'pin'`

### A5: build + commit
`pnpm --filter web build` exit 0 → 单 commit。

### A6: changelog + decision record

---

## 验收
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- inbox 点 ★ → 卡置顶 + 黄条;再点 → 还原
- archive 同理
- detail modal Pin 按钮 toggle,关闭重开状态保持
- pinned 状态持久(reload 后仍在)
- i18n:zh 显示"固定/取消固定",en 显示"Pin/Unpin"