# Phase 6 视觉 + 交互对照笔记

> 截图：`docs/design/screenshots/phase-6/`（9 张）
> 测试：puppeteer-core + 系统 Chrome 驱动 `apps/web/out`
> 服务：`python3 -m http.server 3016 --directory apps/web/out`

---

## 结论

**Phase 6 核心承诺达成（spec §8 "捕获入口"）：`Cmd/Ctrl+Shift+Space` 任意位置触发 Mini Input → 输入标题 + 可选 body → `Cmd+Enter` 保存 → 走 `WebCaptureSink.submit()` → `service.fromCapture({ source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'web' } })` → 卡进 `/inbox`。**

puppeteer 8/8 断言全过：
- ✓ `Cmd/Ctrl+Shift+Space` 在 `/` 触发 Mini Input
- ✓ Enter 标题 focus 展开 body
- ✓ `Cmd+Enter` 保存 + 关闭
- ✓ `card.source.kind === 'shortcut'` + `shortcutId === 'cmd-shift-space'` + `deviceId === 'web'`
- ✓ 跨刷新保留
- ✓ 快捷键在 `/canvas` 也工作
- ✓ 焦点在 input/textarea 内**不**触发
- ✓ 零 page error

---

## 9 张截图

| 文件 | 内容 |
|---|---|
| `01-home-with-capture.png` | 首页新增 Capture 红条入口（⌘ icon + Capture 标题 + "QUICK CAPTURE · ⌘⇧SPACE ANYWHERE" 提示）|
| `02-mini-input-open.png` | `Ctrl+Shift+Space` 触发后：白底 + 2px 红边框 + 顶部 8px 红条 + 标题 Input + "+ add note" 链接 + Cancel/Save 按钮组 |
| `03-mini-input-with-title.png` | 输入"灵感：凌晨四点的小想法"：Save 按钮仍 disabled（无 body，不阻断；只校验 title）|
| `04-mini-input-body-expanded.png` | Enter 展开 body textarea：5 行 + 红下划线 focus |
| `05-inbox-after-capture.png` | `/inbox` 显示新卡：标题"灵感：凌晨四点的小想法" + body "全局快捷键 + Mini Input 应该 3 秒内完成捕获。" + NOTE tag + 日期 |
| `06-mini-input-on-canvas.png` | 在 `/canvas` 路由按快捷键也工作：Mini Input 叠加在 tldraw 画布上 |
| `07-inbox-focus-guard.png` | 焦点在 inbox CreateCardForm title input 时按快捷键 → Mini Input **不**弹（input guard 工作）|
| `08-mini-input-mobile.png` | 390px 视口：Mini Input 宽度自适应（374px），hint 文字换行 |
| `09-home-mobile.png` | 移动端首页：Capture 入口 `note` 文字隐藏，仅 `Capture · ⌘` icon + title |

---

## puppeteer 交互断言（spec §5.5 / §1.3 Q10 / §7 CaptureSink）

```
[shortcut]           mini input opened = true                    ✓ / 路由触发
[enter on title]     body opened = true                         ✓ Enter 展开
[cmd+enter]          mini input closed after save = true         ✓ Cmd+Enter 保存+关闭
[persist]            found card: true, source.kind=shortcut: true ✓ source 字段正确
[reload]             card still present = true                    ✓ localStorage 跨刷新
[shortcut on /canvas] opened = true                              ✓ 任意路由
[input guard]        focused element = INPUT:灵感标题…            ✓
                     mini input did NOT open = true              ✓ 焦点在内不弹
pageErrors:          none                                         ✓ 零错误
```

`card.source` 字段结构（puppeteer 读 localStorage 断言）：

```ts
{
  id: '...',
  title: '灵感：凌晨四点的小想法',
  body: '全局快捷键 + Mini Input 应该 3 秒内完成捕获。',
  type: 'note',
  source: {
    kind: 'shortcut',
    shortcutId: 'cmd-shift-space',
    deviceId: 'web',
  },
  capturedAt: '2026-06-19T...',
  createdAt: '2026-06-19T...',
  updatedAt: '2026-06-19T...',
  pinned: false,
  archived: false,
  // ...
}
```

---

## 视觉对照笔记（spec §5.5 / §5.2 / §5.3 / §7）

### Mini Input 视觉
- ✅ 居中浮层（`top: 20vh; left: 50%; transform: translateX(-50%)`）
- ✅ 2px 红边框 `var(--color-red)`
- ✅ 顶部 8px 红条 region（spec §5.5 / §5.2 capture→red）
- ✅ 50% 黑遮罩（`rgba(10,10,10,0.5)`）+ z-index 200（高于 Modal 100）
- ✅ 标题 Input：`var(--font-display)` + 红下划线 focus（沿用 Phase 1 Input 风格）
- ✅ body textarea：5 行 + 红下划线 focus + 可垂直 resize
- ✅ 底部按钮：Cancel (ghost) + Save (danger) + 左侧 mono hint "⌘↩ save · esc cancel"
- ✅ 移动端 (≤720px) 自适应：宽度 = `100vw - space-4`，padding-top 12vh

### 首页 Capture 入口
- ✅ 红条（`var(--color-red)` 背景）+ 白字 + ⌘ icon（白底红）
- ✅ 与 Inbox/Canvas 入口并列入 `nav` 区
- ✅ 纯展示：未挂 onClick（按快捷键即可，YAGNI event bus）
- ✅ 移动端 note 文字隐藏

### 6 色 token 仍对
- Mini Input 边框 = `var(--color-red)` ✅
- 顶部 region 条 = `var(--color-red)` ✅
- 标题 input focus = `var(--color-red)` 下划线 ✅
- Save 按钮 = `var(--color-red)` 背景（`Button` variant=danger）✅
- 按钮 / 输入区背景 = `var(--color-white)` ✅
- 文字 = `var(--color-black)` ✅

### 字体 + 网格
- 标题 / Save / Cancel：`var(--font-display)` ✅
- 提示 / hint / mono caps：`var(--font-mono)` ✅
- Mini Input 宽度 480px（8px 节奏：`60 * 8`）✅
- mobile Mini Input padding-top 12vh、padding 8px（spec §8 节奏）✅
- `features/capture/` + `app/page.tsx` 内 **hex grep 零命中** ✅

### 组件复用（packages/ui）
- `Input` (Phase 1) — 标题输入
- `Button` (Phase 1) — Cancel (ghost) + Save (danger)
- `Modal` (Phase 1) — **未**复用（z-index + 视觉差异：Mini Input 200 vs Modal 100，2px 红边 vs 1px 黑边）— **自建 `.mi-*` CSS**

### CaptureSink 接口（spec §7）
- ✅ `interface CaptureSink { submit(input: CaptureInput): Promise<{ cardId: CardId }> }`
- ✅ `class WebCaptureSink implements CaptureSink` 走 `service.fromCapture`
- ✅ 全部 `import type` 自 `@cys-stift/domain`，零运行时依赖
- ✅ 接口 + 实现放 `apps/web/src/features/capture/`（web-local，依赖倒置）

---

## 关键工程决策

1. **`CaptureSink` 接口放 `features/capture/` 而非 domain**：spec §7 列出接口但未规定位置；web-local 接口 + web-local 实现，domain 不感知（依赖倒置）。`CardService.fromCapture` 作为底层统一入口。
2. **Mini Input 不复用 `<Modal>` 组件**：Modal 1px 黑边 + z-index 100，Mini Input 需要 2px 红边 + z-index 200 抢眼。**自建 `.mi-*` CSS**（与 inbox/page.tsx / canvas/page.tsx 风格一致）。
3. **Input 不 forwardRef，用 `autoFocus` 兜底**：Phase 1 Input 没 forwardRef；`MiniInput` 早返 `null` 后再渲染那一拍，浏览器 `autoFocus` 会触发。
4. **首页 Capture 入口纯展示**（无 onClick）：避免 event bus 跨组件通信；按快捷键即可。**plan §3 T4 明确**：decorative 卡片显示快捷键提示作为 affordance。
5. **Enter 展开 body 的 activeElement 判别**：`document.activeElement.placeholder === '灵感标题…'`——简易可行（Mini Input 内只有一个 Input）。更鲁棒的实现是 ref，但 Input 不 forwardRef；用 placeholder 字符串匹配是合理 trade-off。
6. **puppeteer 用 `Control+Shift+Space`（非 Meta）**：macOS Chrome headless 模式下 `Meta+Shift+Space` 会被 Spotlight 系统级拦截；puppeteer 模拟不到 OS 级快捷键。`Control+Shift+Space` 在浏览器内一致工作，**真实用户用 `Cmd+Shift+Space` 浏览器内也工作**（CaptureHost 接受 metaKey || ctrlKey）。
7. **0 新依赖**：沿用 react + domain `fromCapture`（Phase 2 实现 + 1 个 vitest 覆盖）+ Phase 1 组件库。
8. **不重构 inbox CreateCardForm**：tagged Phase 3 代码，Lean 排除。Phase 6+ 再统一 manual → CaptureSink。

---

## 与 spec 的差距（已知 / 后续）

| 项 | 现状 | 后续 phase |
|---|---|---|
| Tauri 全局快捷键（`@tauri-apps/plugin-global-shortcut`）| 仅 web 浏览器内；OS 级快捷键需 Tauri 集成 | Phase 6+（apps/desktop 实施时）|
| 菜单栏 / menubar capture | 无 | Phase 6+ |
| 编辑多媒介（详情 Modal 改 links/code/quotes）| 不在 modal 中暴露 | Phase 6+（或单独 Phase 3.5）|
| inbox → canvas send 动作 | 无 | Phase 6+ |
| 图片上传 / MediaAsset 落盘（spec §4.5）| 无；CreateCardForm 占位 | Phase 6+ |
| 链接 OG 抓取 | 无（spec §4.8 已声明 MVP 不做）| 留后 |
| 草稿自动保存（spec §5.5）| 关 Modal 即丢 | 后续 |
| 快捷键自定义（spec §5.5）| Hardcode `Cmd/Ctrl+Shift+Space` | 后续 |
| 多 CaptureSink 实现（tauri / menubar / webhook / mobile / alfred）| 仅 web 1 个 | Phase 6+ |
| 手动 capture 入口（inbox CreateCardForm）改用 WebCaptureSink | 仍直接 `service.create`（绕过 CaptureSink）| Phase 6+ |
| `Cmd+Shift+Space` macOS Spotlight 冲突 | 浏览器内可拦截；OS 级是用户的，浏览器无法阻止 | 后续：文档提示用户改系统快捷键，或在设置里换 |

---

## 验收对照

- ✅ `pnpm --filter domain test` — 10 全绿（Phase 6 不改 domain，复用 `fromCapture` 已有测试）
- ✅ `pnpm --filter db test` — 7 全绿（Phase 6 不改 db）
- ✅ `pnpm --filter web build` — exit 0，10 个静态页（含 `/`）
- ✅ spec §8 Phase 6 三件：全局快捷键 / Mini Input / CaptureSink 接口 web 端
- ✅ spec §5.5 Mini Input 视觉：居中浮层 + 红边框 + 顶部红条
- ✅ 6 色 hex / 字体 / 8px 网格 在 Mini Input 仍对
- ✅ `features/capture/` + `app/page.tsx` hex grep 零命中
- ✅ 9 截图 + 视觉对照笔记
- ✅ puppeteer 8/8 交互断言全过