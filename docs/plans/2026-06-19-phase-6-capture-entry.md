# Phase 6 实现计划 · 捕获入口（全局快捷键 + Mini Input）

> 🟡 **待执行**（主模型手动执行 + 自审，见根 `CLAUDE.md` "Ralph 状态"）。
> 这是 Ralph 停用后主模型手动执行的第四个 phase。

| 字段 | 值 |
|---|---|
| 计划 | Phase 6：捕获入口 — 全局快捷键 `Cmd+Shift+Space` + Mini Input 居中浮层 + CaptureSink 接口在 web 端落地 |
| 创建 | 2026-06-19 |
| 范围决策 | **Lean**（仅 spec §8 3 件 web 端落地；菜单栏 / Tauri 全局快捷键 / 编辑多媒介 / inbox→canvas send 留 Phase 6+） |
| 依据 spec | §1.3 MVP（Capture 入口）/ Q3（全局快捷键 → mini input → Inbox → Canvas）/ Q10（C 全局快捷键 + 菜单栏 + 接口预留）/ §2 数据模型 CaptureInput + CaptureSource / §4.4 CaptureSource 判别联合 / §4.8 CaptureInput 字段 / §5.5 Mini Input 视觉（红边居中浮层）/ §7 CaptureSink 接口 / §8（Phase 6 段） |
| 上游交付 | Phase 3（`/inbox` + `CardService.create/fromCapture` 就绪）/ Phase 5（tldraw 集成 + §6.11 数据流） |
| 下游交付 | Phase 7+（编辑多媒介 / inbox→canvas send / 菜单栏 / Tauri 全局快捷键等）前，最快路径可"灵感 3 秒记" |
| 受众 | human + 任意 LLM（claude / gpt / gemini） |

---

## 0. 目标

把"灵感 3 秒记"的核心闭环搭起来：**任何位置按 `Cmd+Shift+Space`（mac）/ `Ctrl+Shift+Space`（win）→ 屏幕中央弹 Mini Input → 输入即保存到 Inbox**。Mini Input 居中浮层、红边框强调（spec §5.5），走 `service.fromCapture({ source: { kind: 'shortcut', shortcutId, deviceId } })`。

**核心承诺**：在 `/` 或 `/inbox` 或 `/canvas` 任一生产路由按快捷键 → Mini Input 弹出 → 输入标题（+ 可选 body）→ 按回车保存 → Mini Input 关闭 → 新卡出现在 `/inbox` active tab。**3 秒内完成"灵感 → 落库"。**

**Lean 范围声明**（明确不做）：
- ❶ Tauri 全局快捷键（`@tauri-apps/plugin-global-shortcut`）→ 留 Phase 6+（Tauri 端在 apps/desktop，未实现）
- ❷ Tauri 菜单栏 / menubar capture → 留 Phase 6+
- ❸ 编辑多媒介（详情 Modal 可改 links/code/quotes）→ 留 Phase 6+
- ❹ inbox → canvas send 动作 → 留 Phase 6+
- ❺ 图片上传 / MediaAsset 真实落盘 → 留 Phase 6+（spec §4.5 已声明需落盘基础设施）
- ❻ 链接 OG 抓取 → 留 Phase 6+（无 server，CORS 不行）
- ❼ 草稿自动保存（spec §5.5 "输入即保存草稿到 SQLite"）→ 本阶段简化为内存草稿（Mini Input 关掉即丢），不落盘
- ❽ 快捷键自定义（spec §5.5 "可在设置改"）→ 留后，Hardcode spec 默认值

---

## 1. 范围

### ✅ 本阶段做

#### 1.1 全局快捷键 `Cmd/Ctrl+Shift+Space`（spec §5.5 默认）
- 新建 `apps/web/src/features/capture/global-shortcut.ts`：在 root layout 挂一个 `<CaptureHost />` 客户端组件，`useEffect` 注册 `keydown` 监听
- 修饰键：`Cmd`（mac）或 `Ctrl`（win）+ `Shift` + `Space`
- 监听位置：`window`（不是某个具体路由 DOM），保证 `/`、`/inbox`、`/canvas` 任一都生效
- 忽略条件：
  - 修饰键**不**完全匹配（如只 Shift+Space / 只 Cmd+Space）→ 跳过
  - 焦点在 input/textarea/contenteditable 内 → 跳过（不抢用户的字符输入）
  - Mini Input 已开 → 跳过（避免重复开）
- 触发：setState `open: true` → `<MiniInput>` 渲染
- **不**做快捷键自定义（❽）

#### 1.2 Mini Input 浮层（spec §5.5 视觉）
- 新建 `apps/web/src/features/capture/mini-input.tsx`：受控 Modal
  - 包豪斯红边框：`border: var(--color-red); border-width: 2px`
  - 居中：`position: fixed; top: 20%; left: 50%; transform: translateX(-50%)`
  - 宽 480px / 高度自适应（input + 可选 textarea + 按钮组）
  - z-index 高于所有现有 Modal（spec §5.5 "红边框强调"暗示它就该抢眼）
- 组件内容：
  - `<Input>` 单行标题（必填，自动 focus）
  - **可展开**的 body textarea（默认收起，点 "Add note" 展开；按 `Cmd+Enter` 也展开并 focus body）
  - 底部按钮：`Save`（红 primary）/ `Cancel`（ghost）
- 键盘交互：
  - `Enter`（标题 focus 时）→ 展开 body
  - `Cmd+Enter`（任意时）→ 保存并关闭
  - `Escape` → 关闭（不保存）
  - `Tab` → 标题 ↔ body
- 提交：调 `props.onSubmit({ title, body })`，由 host 包成 `service.fromCapture({ source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'web' }, title, body })`

#### 1.3 CaptureSink 接口在 web 端落地（spec §7 接口预留）
- 新建 `apps/web/src/features/capture/capture-sink.ts`：导出 `WebCaptureSink` 类，实现 `CaptureSink` 接口
- 接口（从 spec §7 转 TS）：
  ```ts
  export interface CaptureSink {
    submit(input: CaptureInput): Promise<{ cardId: CardId }>
  }
  ```
- 实现：
  ```ts
  export class WebCaptureSink implements CaptureSink {
    constructor(private service: CardService) {}
    submit(input: CaptureInput): Promise<{ cardId: CardId }> {
      const card = this.service.fromCapture(input)
      return Promise.resolve({ cardId: card.id })
    }
  }
  ```
- **`features/capture-manual`** 之前是"绕开 CaptureSink 直接 `service.create`"（inbox CreateCardForm）—— **本阶段不重构 manual**（YAGNI，避免触碰 tagged Phase 3 代码）。Mini Input 走新 WebCaptureSink。Phase 6+ 再统一 manual → CaptureSink。
- `CaptureSink` 接口类型定义放在 `features/capture/`（web-local），**不**放 domain（domain 零依赖 + 接口由消费方定义，spec §7 也只描述接口未规定位置）

#### 1.4 路由入口
- 在 root `apps/web/src/app/layout.tsx` 挂 `<CaptureHost />` —— 但 layout 是 server component。
- 解决：layout 留 server，新建 `apps/web/src/app/_components/capture-host.tsx`（`use client`），挂到 layout
- **不**新建 `/capture` 路由 —— Mini Input 是全局浮层，不该是路由（spec §6.12 静态导出无 `[param]`）
- 首页加一个**视觉占位**：红 region 提示 "Capture · Cmd+Shift+Space"（与 `/design` 里的一致）+ 新增 `Capture · Quick capture` 入口按钮

### ❌ 本阶段不做（明确留后）

- **Tauri 全局快捷键**（`@tauri-apps/plugin-global-shortcut`）→ 留 Phase 6+（apps/desktop 未实施）
- **菜单栏 / menubar capture** → 留 Phase 6+
- **编辑多媒介**（详情 Modal 改 links/code/quotes）→ 留 Phase 6+
- **inbox → canvas send** → 留 Phase 6+
- **图片上传 / MediaAsset 落盘**（spec §4.5）→ 留 Phase 6+
- **链接 OG 抓取** → 留 Phase 6+
- **草稿自动保存**（spec §5.5）→ 本阶段简化为内存，关闭即丢
- **快捷键自定义**（spec §5.5）→ 留后，Hardcode spec 默认
- **多 CaptureSink 实现**（spec §7 列了 tauri/menubar/webhook/mobile/alfred 5 个待实现）→ 本阶段只 web 1 个
- **手动 capture 入口改用 WebCaptureSink**（当前 inbox CreateCardForm 直接 `service.create`）→ 留 Phase 6+，避免触碰 tagged Phase 3

---

## 2. 前置（已就绪 / 已验证）

**Phase 0-5 已就绪，Phase 6 直接复用，domain / db 不动：**

- `CardService.fromCapture(input: CaptureInput): Card` —— **Phase 2 已实现**（`card-service.ts:84-98`），1 个 vitest 覆盖
- `CaptureInput` 类型 —— domain `types.ts`（spec §4.8）：`title? / body? / type? / media? / links? / codeSnippets? / quotes? / source / canvasPosition?`
- `CaptureSource` 判别联合 —— `types.ts`（spec §4.4），含 `{ kind: 'shortcut', shortcutId, deviceId }` 字段
- `useDb()` hook + localStorage 持久化 —— 卡随 `_cards` 自动持久化（`db-client.ts`）
- `<Modal>` + `<Input>` + `<Button>` —— Phase 1 组件库就绪
- 全局快捷键模式可参考：Phase 5 canvas page.tsx:68-95 的 `+ - 0 1 g` 注册（`useEffect` + `addEventListener` + cleanup + input/textarea 忽略 + modifier 过滤）

**0 新依赖**（沿用 react + react-markdown 可选）。

---

## 3. 任务清单

### P6-T1 · `CaptureSink` 接口 + `WebCaptureSink` 实现
- 新建 `apps/web/src/features/capture/capture-sink.ts`：
  - 导出 `interface CaptureSink { submit(input: CaptureInput): Promise<{ cardId: CardId }> }`
  - 导出 `class WebCaptureSink implements CaptureSink { constructor(service: CardService) {} submit(input) { card = service.fromCapture(input); return Promise.resolve({cardId: card.id}) } }`
  - `CaptureInput` / `CardId` type 全部 `import type` 自 `@cys-stift/domain`（零运行时依赖）
- **验证**：`pnpm --filter web build` exit 0；接口编译通过；不破坏其他代码

### P6-T2 · Mini Input 组件
- 新建 `apps/web/src/features/capture/mini-input.tsx`：
  - Props：`{ open: boolean; onClose: () => void; onSubmit: (input: { title: string; body?: string }) => void }`
  - State：`title` / `body` / `expanded`（body 是否展开）
  - 渲染：
    - 顶层 `<div className="mi-backdrop">` 50% 黑遮罩（与 Modal 一致，但 `z-index: 200` 高于 Modal 100）
    - 内层 `<div className="mi-frame">`：白底 + 2px 红边框 + 480px 宽 + 顶部 8px 红条 region（spec §5.5 / §5.2 capture→red）
    - 标题 `<Input>` 自动 focus（`autoFocus`）
    - body 默认隐藏，点 "Add note" 展开 `<textarea>`
    - 底部：右侧 `Cancel`（ghost）+ `Save`（danger 因为红边框语义就是 capture 域）
  - 键盘交互：
    - `Escape` → `onClose()`
    - `Enter`（title focus + body 收起）→ 展开 body
    - `Cmd/Ctrl+Enter`（任意）→ 校验 title 非空后 `onSubmit({title, body})` + `onClose()`
    - `Tab` → 标准 input 行为
  - 重置：每次 `open` 从 false → true 时清空 title/body/expanded
- 全部 inline CSS（与 inbox/page.tsx 风格一致），所有颜色/间距走 token，hex grep 零命中

### P6-T3 · 全局快捷键监听 + CaptureHost
- 新建 `apps/web/src/app/_components/capture-host.tsx`（`use client`）：
  - State：`open: boolean` + `useDb()` 拿 service
  - `useEffect` 注册 `keydown` 监听（cleanup 注销）：
    - 修饰键检测：`event.metaKey || event.ctrlKey` + `event.shiftKey` + `event.code === 'Space'`
    - 必须三者都有，缺一即跳过（让浏览器 / tldraw / 系统其他快捷键生效）
    - input/textarea/contenteditable 内 → 跳过
    - 已 open → 跳过（避免重复触发）
    - 匹配 → `event.preventDefault()` + `setOpen(true)`
  - 渲染：
    - 拿 editor 暂不需要（Phase 7+ 才需要 inbox→canvas）
    - 闭合：`<MiniInput open={open} onClose={() => setOpen(false)} onSubmit={async ({title, body}) => { await new WebCaptureSink(service).submit({ title, body, source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'web' } }); setOpen(false) }} />`
- 挂到 `apps/web/src/app/layout.tsx`（server component 包一层 `<CaptureHost />`）

### P6-T4 · 首页视觉占位 + Capture 入口
- `apps/web/src/app/page.tsx`：
  - 新增 `Capture · Quick capture` 红 region 入口（与 Inbox/Canvas 并列）
  - 点击 `onClick={() => /* can't open from client here? */}`：用 `<CaptureOpenButton />` 客户端组件，挂在 `useEffect` 里 dispatch 一个 custom event 让 CaptureHost 监听 → setOpen(true)
  - **更简单**：按钮 onClick 不做事，只显示快捷键提示（同 /design 的捕获 placeholder），避免跨组件通信
- **实际**：按钮纯展示，写死 `Capture · Cmd+Shift+Space` 文字 + 红 region + 一个 ghost button 标签 "Press Cmd+Shift+Space to capture"
- **不**做"点击按钮打开 Mini Input"（避免 event bus 复杂度；快捷键已能用）

### P6-T5 · 视觉 + 截图
- Mini Input 包豪斯：白底 + 2px 红边框 + 顶部 8px 红条 + Space Grotesk 标题输入 + mono caps 底部按钮
- 截图脚本 `scripts/p6-shots.cjs`（参考 p5-shots.cjs 模式）：
  1. 首页：3 个入口（Inbox 红 / Canvas 黑 / Capture 红占位 + 快捷键提示）
  2. 触发 Mini Input：模拟 `keydown`（mac：`meta+shift+space`；win：`control+shift+space`）→ Mini Input 出现 → 截图
  3. 输入标题 + 保存：模拟键入 "灵感 test"，`Cmd+Enter` → Mini Input 关闭 → 截图 `/inbox` 看新卡出现
  4. /inbox active tab 显示刚保存的卡（含 source.kind=shortcut meta 数据，但不暴露给 UI）
  5. 跨刷新保留：reload → 卡仍在
  6. 触发但焦点在 Input 内（inbox 标题输入框）→ Mini Input **不**弹（过滤生效）
  7. 移动端：390px 视口 Mini Input 宽度自适应
- 归档 `docs/design/screenshots/phase-6/` + README 视觉对照笔记
- 视觉契约：6 色 token 不破（红条 = `var(--color-red)`）；Space Grotesk + mono；8px 节奏

### P6-T6 · 收尾六件套
- `docs/development/changelog.md` 追加 `## 2026-06-19 · phase 6 · capture entry`
- `docs/memory/decisions/2026-06-19-phase-6.md` + `docs/memory/MEMORY.md` 索引一行
- 更新 `docs/memory/context/current-session.md`（状态推进到 Phase 7+）
- 更新根 `CLAUDE.md`（状态：Phase 6 ✅）
- `git commit`（Conventional Commits，如 `feat(capture): phase 6 — global shortcut + mini input`）
- `git tag v0.7.0-phase-6`（Phase 5 是 `v0.6.0-phase-5`，minor +1）
- `git status` 干净

---

## 4. 验收清单

- [ ] `pnpm --filter domain test` 全绿（Phase 6 不改 domain，复用 `fromCapture` 已有测试）
- [ ] `pnpm --filter db test` 全绿（Phase 6 不改 db）
- [ ] `pnpm --filter web build` exit 0
- [ ] 全局快捷键 `Cmd/Ctrl+Shift+Space` 在 `/`、`/inbox`、`/canvas` 任一都触发 Mini Input
- [ ] 修饰键**不全**匹配（如只 Shift+Space）不触发
- [ ] 焦点在 input/textarea/contenteditable 内时**不**触发
- [ ] Mini Input 已开时**不**重复触发
- [ ] Mini Input 视觉：居中 + 2px 红边框 + 顶部 8px 红条 + Space Grotesk 标题输入
- [ ] Mini Input `Enter`（标题 focus）→ 展开 body textarea
- [ ] Mini Input `Cmd/Ctrl+Enter`（任意）→ 保存 + 关闭
- [ ] Mini Input `Escape` → 关闭不保存
- [ ] 保存的卡 `card.source.kind === 'shortcut'` + `shortcutId === 'cmd-shift-space'` + `deviceId === 'web'`（puppeteer 读 localStorage 断言）
- [ ] 保存后 `/inbox` active tab 显示新卡（puppeteer 截图断言）
- [ ] 跨刷新保留（puppeteer reload + 断言卡仍存在）
- [ ] CaptureSink 接口（`CaptureSink.submit(): Promise<{cardId}>`）在 `features/capture/capture-sink.ts` 导出
- [ ] `WebCaptureSink` 实现类调用 `service.fromCapture()`（不绕开 domain）
- [ ] 首页有 Capture 入口（红 region + 快捷键提示）
- [ ] 6 色 hex / 字体 / 8px 网格 在 Mini Input 仍对
- [ ] `features/capture/` 内无写死 hex/px（grep 验证）
- [ ] 截图归档 `docs/design/screenshots/phase-6/` + README 视觉对照笔记
- [ ] changelog + memory + context + commit + tag + 根 CLAUDE.md 状态推进 六件套齐全
- [ ] `git status` 干净

---

## 5. 审核标准（主模型自审逐项查）

> 沿用 `docs/ralph/README.md` §6 归档标准。Phase 6 特别注意：

### 代码质量
- [ ] `features/capture/` 切片干净（capture-sink.ts / mini-input.tsx / global-shortcut.ts 内 host 组件），不散落到 app/inbox 或 app/canvas
- [ ] `CaptureSink` 接口 type 全部 `import type` 自 `@cys-stift/domain`，零运行时依赖
- [ ] `WebCaptureSink` 走 `service.fromCapture`，不绕开 domain
- [ ] **不**改 inbox CreateCardForm（tagged Phase 3，YAGNI 保护）
- [ ] 组件层没写死 hex / px（`grep -rE '#[0-9a-fA-F]{3,6}' apps/web/src/features/capture/` 为空）
- [ ] 快捷键 effect 有 cleanup
- [ ] 快捷键忽略 input/textarea/contenteditable（防用户字符输入被吞）

### 架构一致
- [ ] 没改 spec / 没破坏 domain 零依赖 / 没动 packages/db schema
- [ ] 不新建路由（Mini Input 是全局浮层，不是路由；spec §6.12 静态导出限制）
- [ ] 没碰已 tag 的 Phase 0-5 产物
- [ ] `WebCaptureSink` 是 `features/capture/` 内（web-local），**不**塞进 domain
- [ ] `CaptureSink` 接口 type 定义在 features（消费方定义接口，spec §7 也未规定接口位置）

### 测试 + 视觉
- [ ] domain + db 测试仍全绿
- [ ] `pnpm --filter web build` exit 0
- [ ] 截图覆盖：首页 / Mini Input 弹出 / 保存后 inbox / 移动端 / 焦点在 Input 内不触发
- [ ] 视觉契约（6 色 / 字体 / 网格）未破
- [ ] Mini Input 红边框 + 顶部 8px 红条 + 居中浮层

### 安全
- [ ] Mini Input 不渲染 Markdown（只 title + body 文本输入）→ 无 XSS 风险
- [ ] 保存走 `service.fromCapture` → 走 domain 校验链路（已有 vitest 覆盖）

### Git 卫生
- [ ] Conventional Commits
- [ ] 无 console.log 残骸 / 死代码 / TODO
- [ ] `git status` 干净才能收尾

---

## 6. 风险

| 风险 | 处理 |
|---|---|
| mac `Cmd` / win `Ctrl` 跨平台判断 | `event.metaKey \|\| event.ctrlKey`（mac: metaKey=true, ctrlKey=false；win: 反之），任一 true 即视为修饰键 |
| 浏览器默认 `Cmd+Shift+Space` 可能被输入法 / Spotlight 抢（mac） | `preventDefault()` 阻止默认行为；测试时确认 puppeteer 能触发 |
| Phase 5 canvas 全局快捷键（`+ - 0 1 g`）与本阶段 capture 快捷键冲突 | 不同组合键（`+ - 0 1` 是单独键 + `g`；本阶段 `Cmd/Ctrl+Shift+Space`），不冲突 |
| `CaptureSink` 接口放 features 而非 domain 违反 spec §7 "CaptureSink 接口" 措辞 | spec §7 列了 CaptureSink **接口** 但没说放哪；features/capture 是消费方（web），web-local 接口合理；domain 留具体服务（CardService），接口由消费方定义（依赖倒置） |
| Phase 3 inbox CreateCardForm 不走 WebCaptureSink → manual 入口和 shortcut 入口走两条路 | 显式 Lean 排除（避免触碰 tagged Phase 3）；Phase 6+ 再统一 |
| Mini Input 多次打开重叠 / z-index 与 Modal 冲突 | Mini Input z-index 200（>Modal 100）；只允许一个实例（CaptureHost 单挂载点） |
| 快捷键 `Cmd+Shift+Space` macOS Spotlight 默认冲突 | 浏览器内 `preventDefault` 仅阻止浏览器默认，不阻止系统级；用户在浏览器内可用，浏览器外被 Spotlight 接管是合理的 |
| Capture 入口按钮"点击打开 Mini Input"省了（避免 event bus） | 用户按快捷键即可；按钮纯展示（符合 spec §5.5 视觉） |
| `onSubmit` 异步 + 关闭时机：先关 Modal 还是先 await save？ | 先 await（保证 DB 写入成功再关）→ 用 `startTransition` 包；失败暂不处理（MVP 信任 in-memory + localStorage） |
| 保存后 `/inbox` 不刷新就能看到新卡？ | `useDb()` 的 snapshot 引用稳定性保证（spec §6.12 / Phase 2）；新卡触发 `_cards` 变更 → hook 重渲染 → inbox 自动显示 |

---

## 7. 产出与汇报

完成后主动给出：

1. `pnpm --filter web build` 输出 + 产物大小
2. Mini Input 截图（弹出态 + 输入态 + 移动端 + 焦点在内不弹）
3. `/inbox` 截图（保存后新卡 + 跨刷新仍在）
4. 视觉对照笔记（逐项打勾）
5. **puppeteer 交互断言**（快捷键 3 件 + Cmd+Enter 保存 + source.kind=shortcut + 跨刷新 + 焦点过滤）
6. 下一步预告：Phase 6+ 候选（Tauri 全局快捷键 / 菜单栏 / 编辑多媒介 / inbox→canvas send / 图片上传 / OG 抓取）

---

## 8. 完成信号

```xml
<promise>PHASE COMPLETE</promise>
```

**严格条件**：第 4 节验收清单全部 ✅ + 第 5 节审核标准全部满足 + `git status` 干净。任一不满足就**继续迭代，不输出假 promise**。