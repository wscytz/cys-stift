# 2026-06-21 · v0.23.2-hardening

> Review 驱动的 robustness 改动,1 个 commit 闭合 4 个非 i18n 类 bug。

## 来源

承接 v0.23.1 review 报告里 defer 的 4 项:B7-B10。3 个并行 Explore subagent 跑出来,本档集中处理。

## 修复明细

### B7 — mediaStore attach() 并发 race

`lib/media-store.ts:76-101`

**Before**: `attach()` 有 2 个 await(readAsDataURL + crypto.subtle.digest),期间其他 `attach()` 调用进入,各自 `loadAssets()` 拿同一旧 map,后 `saveAssets()` 互相覆盖 → **静默丢数据**。

**After**: 新增模块级 `_writeQueue` promise chain + `enqueueWrite(fn)`,所有写入(load → mutate → save)原子化串行。新增 `removeAsync()` 镜像 `attach()` 走队列(`remove()` 同步版保留向后兼容)。

**为什么用 promise chain 而不是 mutex flag**:flag 实现要 try/finally,容易忘;promise chain 利用 `.then(fn, fn)` 串行,失败的写不会污染后续 caller(`.catch(() => undefined)` 吞掉 queue 的 reject)。

### B8 — importFromJson schema 校验

`lib/export-service.ts:124-205`

**Before**: 只校验顶层 shape(`Array.isArray(payload.cards)` + `version === 1`),per-card 结构无校验。无 id 的卡 / 非字符串 title 直接入库,下次读时 DB schema 崩。

**After**: 加 `for` 循环逐卡字段检查:
- `id` 必填 + 非空字符串
- `title` / `body` 必为字符串
- `createdAt` / `updatedAt` 必为字符串或 undefined

第一个坏卡就 reject 整个 import,err 消息带 `cards[i]` 索引方便用户定位。

### B9 — mini-input Enter 用 e.target 替代 placeholder 检测

`features/capture/mini-input.tsx:105-115`

**Before**: `document.activeElement.placeholder === t('capture.miniTitle')`。locale 切换后 placeholder 字符串变,但 activeElement 持有旧值 → Enter 不展开 body。

**After**: `(e.target as HTMLElement).tagName === 'INPUT'`。tagName 是 DOM 属性与 locale 无关,dialog 内唯一 input 就是 title input,稳定正确。

**为什么不改 ui 包 Input 加 forwardRef**:那是 latent issue(scope 大,需要让所有 UI 组件 forwardRef),B9 是 hotfix 用更小方案,future 单独 commit 处理。

### B10 — search-shortcut ⌘K → ⌘/

`components/search-shortcut.tsx:14-23`

**Before**: Cmd/Ctrl+K 全局搜,在 Windows Edge 触发浏览器搜索栏(双触发冲突)。

**After**: Cmd/Ctrl+/(斜杠)。Linear / Notion / GitHub / VS Code 都用这个绑定,所有主流浏览器未占用。无 UI 提示文案需要改(项目里没有 ⌘K 提示)。

## 关键决策

### 为什么 B7 用 promise chain 而非 mutex flag

- flag 实现:let lock = false; fn() { if (lock) { ... }; lock = true; try { ... } finally { lock = false } }。每次加 try/finally,容易忘。
- promise chain:`_writeQueue = _writeQueue.then(fn, fn)`,**递归串行**天然原子。
- queue 自身的 reject 用 `.catch(() => undefined)` 吞掉,避免一个失败污染后续 caller。每个 caller 通过自己收到的 promise 看到自己的错误。

### 为什么 B9 用 tagName 而不是 ref

- 改 ui 包 Input 加 forwardRef:动 1 个文件 + 需要让其他组件(button/modal/card)也 forwardRef(scope 蔓延)
- tagName === 'INPUT':dialog 内 input 是 title input 唯一,语义清晰,locale 稳定
- 选了后者,B9 scope 最小

### 为什么 B10 不留 K 也加

可以同时绑定 `K` 和 `/`,给用户两种选择。但 K 在 Edge 冲突 → 给用户 K 反而误导。统一改 `/` 简单清晰。

### 不修复的 review 发现(明确 defer)

- ⏸️ tauri conf.json `targets: "all"` 不明确 — 当前打包 OK,留待签名档
- ⏸️ next/react/tailwind 版本 pin — 构建 OK 不动
- ⏸️ ui 包组件缺 forwardRef — 隐性 lint 警告,不在 review 报告里,后续可单独 commit
- ⏸️ 旧 v0.14 canvas view 数据升级时静默丢弃 — 数据迁移,scope 大
- ⏸️ workspaceId / Repository async / OPFS / Tauri fs — 战略性大改,defer

## 验收

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 4 个文件 / +123 -15 行 / 1 个 commit

## 已知遗留(明确 out of scope)

无 — 全部 B7-B10 闭合,defer 项明确列在本档。