# 2026-06-21 · v0.23.3-critical-and-latent

> Review 驱动第二轮。5 Critical + 5 Latent,**全 10 项现场独立核对,0 误报**。

## 来源

3 个并行 Explore subagent:
1. **v0.23 改动 review** — 找新引入的 bug
2. **全 UX walkthrough** — 8 个用户流程端到端走
3. **未完成功能 audit** — domain 类型有但 UI 无的字段

主线程独立复核每条高严重度发现(读现场代码),过滤误报。

## 修复明细

### C1 — search 详情保存不持久(critical,数据丢失)

`app/search/page.tsx:80-82`

**Before**: `onSave={(patch) => setDetail({ card: { ...detail.card, ...patch } })}` 只更新本地 state,**完全没调 `service.update()`**。关闭 Modal 后修改丢失,用户以为保存了。

**After**: `service.update(detail.card.id, patch)` → `setDetail({ card: updated })`,与 archive/inbox pattern 一致。

### C2 — trash 永久删除 type-delete 确认(safety hazard)

`app/trash/page.tsx:75-95`

**Before**: 文件头注释说"asks the user to type the word 'delete'"但实现是一次性 Cancel/Confirm Modal。**stale 注释 + 实际 one-click 永久删除**,数据 safety hazard。

**After**: 加 `deleteConfirmText` state + 输入框 + 红按钮在文本 !== 'delete' 时禁用。Modal 关闭重置文本。新增 2 个 i18n key。

### C3 — canvas 快速 dblclick 重复创建(数据重复)

`features/canvas/canvas-editor.tsx:210-258`

**Before**: `captureSinkRegistry.submit()` 微任务 resolve,`.then` 里 `getShapeAtPoint` 在第一张 shape 入库前仍返回 null → 第二击进入 handler 又创建一张。

**After**: 加 `creating` 局部 flag(闭包内),submit 期间置 true,`.finally()` 清空。第二击进入时直接 return。

### C4 — mini-input rapid ⌘↩ 重复提交(数据重复)

`features/capture/mini-input.tsx:81-87`

**Before**: `submit()` 无 in-flight flag,rapid ⌘↩ 或双击按钮,两击都进入(React 异步 setState 让第二击在 setOpen(false) 之前进入)。

**After**: 加 `submitting` state,`submit()` 早返,Save 按钮 `disabled={submitting || ...}`。

### C5 — card-detail Modal 标题硬编码 untitled(i18n 漏)

`features/card/card-detail.tsx:206`

**Before**: `title={mode === 'edit' ? t('card.detail.title') : card.title || '(untitled)'}`。view 模式 fallback 硬编码英文(zh 用户看 "(untitled)")。

**After**: `t('card.untitled')`。

### L1 — mediaStore remove bypass 队列

`lib/media-store.ts:117-122`

v0.23.2 加了 enqueueWrite 给 attach,但 `remove()` 还走同步路径。并发 attach + remove 仍 race(remove 在 attach 写入前 load 旧 map)。

**After**: `remove()` 内部 `void enqueueWrite(...)`,API 保持同步 void。

### L2 — search-shortcut 在输入框内触发

`components/search-shortcut.tsx:14-22`

⌘/ 在 input/textarea/contentEditable 内也触发,用户输入时跳走。

**After**: `e.target.tagName` 检测,INPUT/TEXTAREA/contentEditable 直接 return。

### L3 — trash tile 无效 button a11y

`app/trash/page.tsx:122` + `features/archive/archive-card-tile.tsx`

**Before**: `/trash` 的 tile 是 `<button onClick={() => {}}>` — 键盘 Tab + Enter 无反应。

**After**: ArchiveCardTile 加 `disabled` prop,disabled 时渲染 `<div aria-disabled role="img">` 非交互容器。/trash 传 disabled。

**额外修复**:同文件 3 处硬编码 `(untitled)`(checkbox aria-label / button aria-label / title)→ `t('card.untitled')`。Review agent 漏标,主线程复核时发现。

### L4 — i18n dev warn 刷屏

`lib/i18n/index.tsx:64-86`

v0.23.1 加的 `t()` missing-key warn 每次 render 都打,1 个 typo 在 React dev 模式刷屏数十次。

**After**: 模块级 `Set<string>` 按 `locale:key` 去重,每个缺失 key 只 warn 一次。

### L5 — mediaStore quota 警告刷屏

`lib/media-store.ts:84-91`

`attach()` 超过 500KB 的软警告每次都打,重拖同一文件或拖多份副本刷屏。

**After**: `Set<string>` 按 `name:size:mtime` 去重。

## 关键决策

### 为什么 C2 用 type-delete 而不是二次 Modal

- 二次 Modal 仍可一键点(用户肌肉记忆)
- type-delete 物理阻断:必须输入 "delete" 字面,误删概率接近 0
- GitHub / Linear / Vercel 删项目都用这个 pattern,用户熟悉
- 文件头注释原本就说"asks the user to type the word 'delete'"—这是 spec 意图,只是实现没跟上

### 为什么 C3 用闭包 flag 而不是 useRef

- `creating` 是 effect 内部状态,不需要跨 render 保持(useRef 也可以但 overkill)
- 闭包 flag 生命周期 = effect 生命周期,editor 变化时 effect 重跑 flag 自动重置
- useEffect cleanup 已正确处理 listener 解绑,flag 随之释放

### 为什么 L1 的 remove 保持同步 void API

- 改返回 Promise 会 break 现有 caller(card-detail.tsx:349 等)
- 同步 void + 内部 `void enqueueWrite(...)` 是最小侵入:caller 不变,并发安全由队列保证
- caller 不需要等 remove 完成(删除图片后立刻 refresh UI,store notify 会触发 re-render)

### 为什么 L3 改源头而不是 caller

- caller(trash page)加 `pointer-events: none` 也行,但破坏键盘 a11y
- 源头加 disabled prop 是组件 API 的正当扩展,其他场景可复用
- 顺手修了 3 处 `(untitled)` 硬编码(review agent 漏标)

## 不修复的发现(明确 defer)

- ⏸️ canvas delete 后 archived 卡片回到 inbox 而非 archive(UX #4)— spec gap,需 removeFromCanvas 记录 prior state,scope 大
- ⏸️ Modal 无 focus trap(a11y #12)— 需改 ui 包 Modal 组件,scope 中等
- ⏸️ archive.select plural / batchDeleteConfirmTitleN 语法 — "card(s)" 不雅但能懂,留 polish 档
- ⏸️ domain Card.pinned / Card.color / CanvasPosition.rotation 字段在 UI 无 — spec feature,大改
- ⏸️ CaptureSource.paste/drag-drop/webhook handler 无 — 等媒体层 OPFS 落地
- ⏸️ Tauri 空 setup / 无 global-shortcut / 无 fs plugin — Phase 8 roadmap,2-3 天
- ⏸️ AppMenu 无搜索按钮(只能 ⌘/)— 1 小时,留下档
- ⏸️ import mediaAssets 不 dedup — 1 天,留下档

## 验收

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 10 个文件 / +172 -46 行 / 2 个 commit

## 已知遗留(明确 out of scope)

无 — 全部 C1-C5 + L1-L5 闭合,defer 项明确列在本档。