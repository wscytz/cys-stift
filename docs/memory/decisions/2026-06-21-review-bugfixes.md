# 2026-06-21 · v0.25.1-review-bugfixes

> Review 驱动。3 个并行 Explore agent 复核 v0.24-v0.25,6 项全修。

## 来源

3 个 agent:
1. v0.24-v0.25 代码 review(新 bug + CSS + a11y)
2. Tauri 集成专项(Rust + conf + 前端 event 链路)
3. Pin 功能逻辑深度(排序/toggle/状态/边界流程)

主线程交叉验证,过滤误报,确认 6 项(4 真 bug + 2 gap)。

## 修复明细

### R1 — Tauri listener 泄漏 race

`apps/web/src/features/capture/capture-host.tsx`

**Before**:`tauri.event.listen(...)` 返回 `Promise<unlisten>`。cleanup `unlisten?.()`。若组件在 Promise resolve 前 unmount,`unlisten` 仍 undefined → cleanup no-op → **listener 永久泄漏**(每次 mount/unmount 泄漏一个)。

**After**:cancelled flag 模式(与同文件 capture-sink 注册 effect 一致):
```ts
let cancelled = false
listen(...).then((fn) => {
  if (cancelled) { fn(); return }  // 已卸载,立即注销
  unlisten = fn
})
return () => { cancelled = true; unlisten?.() }
```

### R2 — trash pinned 黄边泄漏

`apps/web/src/features/archive/archive-card-tile.tsx`

**Before**:`cls` 里 `card.pinned ? 'tile--pinned'`。/trash 传 `disabled`(隐藏 pin 按钮),但 pinned 的软删除卡仍加 `tile--pinned` → 黄边显示,无按钮可关。

**After**:`!disabled && card.pinned ? 'tile--pinned'`。

### R3 — send-to-canvas 后 Pin 按钮仍在

`apps/web/src/features/card/card-detail.tsx`

**Before**:`showPin = has('pin') && Boolean(onTogglePin)`。inbox detail 的 actions 含 'pin',send-to-canvas 后 card 有 canvasPosition,但 Pin 按钮仍显示 → 可 pin canvas 卡,违反"canvas 不 pin"决策。

**After**:`showPin = has('pin') && Boolean(onTogglePin) && !card.canvasPosition`(与 showSendToCanvas 的 `!canvasPosition` 一致)。

### R4 — CSS border 抖动 + specificity 冲突

`apps/web/src/app/inbox/page.tsx` + `apps/web/src/features/archive/archive-card-tile.tsx`

**Before**:`.tile--pinned`/`.tile--selected` 用 `border-width:2px`。两个问题:
1. toggle pin/selected 时 border 1px→2px → grid reflow(邻居位移)
2. selected+pinned 同 specificity(border-color),源码顺序决定胜负 → pinned 黄边可能被 selected 蓝边压掉

**After**:改用 `outline:2px solid <color>; outline-offset:-1px`。
- outline 不占 box model → 无布局抖动
- 默认 1px hairline 保留,outline 叠加(视觉 2px 彩色边)
- outline 是独立属性,selected/pinned 各自声明;pinned 后声明 → 同元素两者皆有时 pinned 胜

### G1 — search pinned 排序

`apps/web/src/app/search/page.tsx`

**Before**:`results = searchCards(allCards, query)`(按 capturedAt desc),pinned 不前置,与 inbox/archive 不一致。

**After**:results memo 内 partition pinned 前置(稳定分区,保搜索排名)。

### G2 — timeline pin

`apps/web/src/features/archive/timeline.tsx` + `apps/web/src/app/archive/page.tsx`

**Before**:Timeline 不接 onTogglePin → 行不显示星;pinned 卡按日分散,不前置。

**After**:
- Timeline 加 `onTogglePin?` prop,透传给 ArchiveCardTile → 行显示星
- 每日组内 pinned 前置(稳定分区,保日组内 updatedAt 序)
- archive page 传 onTogglePin

## 关键决策

### R1 为什么用 cancelled flag 而非 AbortController

Tauri event listen 不支持 AbortSignal。cancelled flag 是 React 处理"async 操作在 unmount 后 resolve"的标准模式(同文件 capture-sink 注册已用)。简单、无依赖。

### R4 为什么用 outline 而非固定 border-width

- 固定 border-width 2px(所有 tile 默认 2px)→ 改变默认外观(原 1px hairline),且与 inbox/archive 其他 tile 不一致
- outline 不占布局 + 叠加在 hairline 上 → 默认外观不变,toggle 无抖动
- outline 是独立属性,避免 border-color specificity 战

### G2 为什么 timeline 每日组内前置而非全局 pinned 置顶组

- timeline 本质是按日浏览,全局 pinned 置顶组破坏时间轴语义
- 每日组内 pinned 前置 + 星标记 → pinned 卡在它的更新日排最前,可见可操作,保持时间序
- 与 grid 视图(全局前置)的差异是视图本质不同,可接受

## 不修复的发现(明确 defer)

- ⏸️ **pinFirst 未 memo**(inbox 每次 render 重算)—— 卡片量小,perf 可忽略;memo 需小心 deps(snap/service),收益低
- ⏸️ **register 失败无 in-app 反馈** —— 需 Rust emit 状态 + 前端 UI,scope 中等,留后续
- ⏸️ **emit 广播所有 webview** —— 当前单窗口,无影响;多窗口(未来)改 emit_to
- ⏸️ **auto-repeat 重复 emit** —— setOpen 幂等,低危;Rust 端加 is_visible guard 可选
- ⏸️ **window label 隐式 "main"** —— Tauri v2 默认 label 稳定;显式加 `"label":"main"` 是防御性,留后续

## 验收

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件 / +51 -10 行 / 1 个 commit

## 已知遗留(明确 out of scope)

无 — 6 项全修,latent 项明确 defer。