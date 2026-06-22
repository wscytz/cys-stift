# 2026-06-21 · v0.23.1-i18n-hardening

> Review 驱动的 i18n hardening,1 个 commit 闭合 6 处硬编码英文 + 1 个 dev 调试辅助。

## 来源

由 3 个并行 Explore subagent 全代码 review(lib + services / pages + features / Tauri + build)出 18 + 13 + 11 = 42 项发现。本档只取 **6 处 i18n 硬编码 + 1 处 dev 调试**,其余 35 项要么是误报(3 条),要么是 latent(归档 defer),要么是更大改动(签名 / OPFS / 数据迁移)。

## 修复明细

### B1 — archive floater + 批量删除 confirm modal 全 i18n

`app/archive/page.tsx:166-176,184-220`

**Before**: floater 显示 `5 selected` / 按钮 `Unarchive` / `Soft-delete` / `Clear`,confirm modal 标题 `Soft-delete 5 cards?`、body `These cards will be hidden...`、按钮 `Cancel` / `Soft-delete 5`,标题 fallback `(untitled)` 全硬编码英文。

**After**: 全部走 `t()`,新增 8 个 i18n key。中文下:"已选 5 项 / 取消归档 / 软删除 / 清除 / 软删除 5 张卡片? / 这些卡片将从归档中隐藏。你可以稍后从回收站恢复。 / 取消 / 软删除 5 张"。

**额外发现**:`archive/page.tsx:126` 的 select 按钮复用了 `t('archive.viewGrid')` → 中英文都显示 "网格/Grid",用户根本看不懂这是干嘛。**新建 `archive.select` 修这个潜在 UX bug**。

### B2 — card-detail Send to canvas 按钮 i18n

`features/card/card-detail.tsx:393,397` — "on canvas" Tag + "Send to canvas" 按钮硬编码。

→ 新 key `card.detail.sendToCanvas` / `card.detail.onCanvas`。

### B3 — inbox `(untitled)` i18n

`app/inbox/page.tsx:184` — 卡片无标题时显示英文 `(untitled)`。

### B4 — trash `(untitled)` / Cancel / Restore i18n

`app/trash/page.tsx:83,90,130` — 软删除 confirm body 用 `(untitled)`,按钮 `Cancel`(注意:**已经**用 `t('common.cancel')`,review agent 误报)。

实际只有第 83 行的 `(untitled)` 是真 bug。Restore / Delete forever 按钮**已 i18n**(用 `t('trash.restore')` / `t('trash.deleteForever')`)。

### B5 — settings labelFor() 键名 i18n

`app/settings/page.tsx:46-51` — 键名 `'Space' / 'Comma' / 'Period'` 硬编码英文。

→ 新 key `settings.key.{space,comma,period}`。其他键(KeyA / Digit1 等)走 `code.slice(3)` / `code.slice(5)` 直接显示字母/数字,无翻译必要。

### B6 — t() 缺失 key 时 dev-mode 警告

`lib/i18n/index.tsx:64-75` — `t('card.detail.sav')` typo 时静默返回原始 key 字符串,生产环境用户看到 `card.detail.sav`,开发者毫不知情。

**修复**:dev-mode 下 `console.warn('[i18n] missing key: ...')`,生产保持静默(避免 console 污染)。

## 关键决策

### 为什么 1 个 commit 而不是 6 个

- 所有改动都是 i18n hardening,集中改效率更高,review 更省事
- commit message 一次性说清楚 B1-B6 各自修复内容
- 单 commit 回退等于整组回退(语义清晰)
- 后续 dev-mode 警告 + 新 key 加进 messages.ts 自然在一个 diff

### 为什么 B5 不全 i18n 所有键名

- `KeyA` / `Digit1` 等字母数字键 → `code.slice(3)` / `code.slice(5)` 直接显示,语义无需翻译
- `Space` / `Comma` / `Period` 是英文 → 中文应该是"空格"/"逗号"/"句号",这才需要翻译
- 其他未知键 `return code` 兜底,极少见,不做翻译

### 为什么 B6 warn 一次而不是每次

`useCallback` 闭包里 `messages[key]?.[locale]` 是同步 lookup,缺失 key 会在每次 re-render 重复触发。React 在并发模式下会反复 render,console 会刷屏。考虑过 `useRef` 去重,但增加复杂度。当前 dev 模式 console 本来就是开发者主动打开,刷屏问题可接受。**未来如果影响 dev 体验,再加 ref 去重**。

### 不修复的 review 发现(明确 defer)

- ❌ canvas delete orphan(误报,实际有 removeFromCanvas)
- ❌ softDelete 不 bump updatedAt(误报,实际有)
- ❌ i18n hydration mismatch(误报,已修)
- ⏸️ mediaStore attach 并发 race(B7)— 数据层,需要更大改动,下档
- ⏸️ importFromJson 不校验 schema(B8)— 数据层,需要补 schema check
- ⏸️ mini-input Enter 展开用 placeholder 检测(B9)— 改用 ref,小改动但单独 commit 更清晰
- ⏸️ search-shortcut Ctrl+K 与 Windows Edge 冲突(B10)— 改用 Ctrl+Shift+K,小改动
- ⏸️ tauri conf.json targets="all" 不明确 — 验证过打包正常,暂不动
- ⏸️ next/react/tailwind 版本 pin — 当前构建 OK,不动

## 验收

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件改动 / +48 -29 行 / 1 个 commit
- 15 个新 i18n key
- i18n 硬编码英文:从 6 处 → 0 处(下一档仍要扫)

## 已知遗留(明确 out of scope)

无 — 全部 B1-B6 闭合,defer 项明确列在本档。