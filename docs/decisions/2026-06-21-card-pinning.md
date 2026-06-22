# 2026-06-21 · v0.24.0-card-pinning

> Phase A(快速完善)。`Card.pinned` domain 字段接 UI。

## 来源

backlog 排序后,Phase A = "低成本高价值快速赢"。AppMenu 搜索入口经复核**已存在**(app-menu.tsx:26),从 backlog 删除。Phase A 收敛为 Card.pinned UI——domain Phase 2 就有字段但无 UI,1-2 小时可完成。

## 修复明细

### A1 — i18n keys

`messages.ts` 加 `card.detail.pin`(固定/Pin)+ `card.detail.unpin`(取消固定/Unpin)。

### A2 — inbox CardTile pin + 排序

`app/inbox/page.tsx`

- CardTile 从单个 `<button>` 重构为 `<div class=tile> > [<button class=tile__pin>] + [<button class=tile__main>]`。**原因**:HTML 规范禁止 button 嵌套 button,pin 按钮必须独立。
- ★ 按钮:absolute 右上角,pinned 黄填充 / 未 pinned 灰轮廓。`stopPropagation` 不触发 tile open。
- pinned 视觉:`.tile--pinned` 边框转 `--color-yellow` + `.tile__bar`(原红)转黄。
- 排序:模块级 `pinFirst()` helper,用 `filter` 分区(pinned / rest)再拼接。**不用 sort()**:sort 跨 JS 引擎不稳定,分区保证 pinned 组内 / rest 组内各自保序。

### A3 — ArchiveCardTile + archive page pin

`features/archive/archive-card-tile.tsx` + `app/archive/page.tsx`

- ArchiveCardTile 加**可选** `onTogglePin` prop:传了才渲染 ★。
  - /archive grid:传 → 显示 ★
  - /trash:`disabled` 模式 → 不渲染(L3 的 disabled 已禁用交互)
  - /search:不传 → 不渲染(search 是临时查询,pin 意义低)
  - Timeline 视图:不传 → 不渲染(保持现状)
- /archive cards memo:在原 `updatedAt desc` 排序基础上,pinned 分区前置。

### A4 — card-detail modal Pin action

`features/card/card-detail.tsx` + 三个 caller

- `CardDetailAction` 联合类型加 `'pin'`。
- `CardDetailModalProps` 加 `onTogglePin?: () => void`。
- view toolbar:若 `showPin`(actions 含 'pin' 且 onTogglePin 存在),渲染 Pin/Unpin toggle(文字依 `card.pinned`)。
- inbox/archive/search 三个 caller:`actions` 数组加 `'pin'`,传 `onTogglePin` 调 `service.update`。

## 关键决策

### 为什么不加 domain pin/unpin 方法

domain `update(id, { pinned })` 第 121 行已支持。加 `setPinned(id, boolean)` 是语法糖,不增加表达力,反而增加 API 面(YAGNI)。toggle 语义在 caller 端(`!card.pinned`)清晰。

### 为什么排序用 filter 分区而非 sort

`sort()` 在不同 JS 引擎(V8 / JavaScriptCore / SpiderMonkey)稳定性不保证。pinned 前置但同组内保序的需求,`filter` 分区天然稳定:
```
const pinned = cards.filter(c => c.pinned)
const rest = cards.filter(c => !c.pinned)
return [...pinned, ...rest]
```

### 为什么 canvas 卡片不加 pin

- canvas 的本质是自由摆放,重要性通过**位置 + z-index** 表达,不需要 pin 概念
- canvas 的 card-detail-modal 是独立 Phase 4 MVP 组件(title + body only),与共享 `features/card/card-detail.tsx` 分离(见 archive-detail decision 的注释)
- 加 pin 需要改 canvas-modal + canvas shape 渲染,scope 蔓延,留后续

### 为什么用 ★/☆ 而非 SVG 图标

- Unicode 星号零依赖,字体栈(JetBrains Mono / system)都支持
- ★(U+2605)填充 + ☆(U+2606)轮廓,语义清晰
- 颜色走 token(灰→黄),符合 ui 包"颜色只在 token"铁律
- YAGNI:SVG 图标增加资源管理成本,星号够用

### 为什么 ArchiveCardTile 的 pin 是可选 prop

- /trash(disabled)和 /search(不传)都不应显示 pin
- 可选 prop + 条件渲染比"总是渲染再隐藏"更干净
- 向后兼容:现有 caller(trash/timeline)不传则无 pin 按钮,零破坏

## 不修复的发现(明确 defer)

- ⏸️ canvas 卡片 pin — 用位置/z 表达,canvas modal 独立保持 MVP
- ⏸️ Modal focus trap(Phase B)
- ⏸️ Tauri 全局快捷键(Phase C,战略级 2-3 天)
- ⏸️ paste/drag-drop 媒体入口(用户搁置)
- ⏸️ OPFS 媒体层(用户搁置)
- ⏸️ canvas body preview / Card.color / rotation / dedup / workspaceId async / 签名公证 / Intel 构建

## 验收

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件 / +235 -31 行 / 1 个 commit
- pinned 持久(reload 后仍在),i18n 中英切换正确

## 已知遗留(明确 out of scope)

无 — Phase A 全部闭合,后续 Phase(Backlog)明确列出。