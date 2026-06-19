# 路线图 · Phase 7 起 30 轮执行计划

> **用途**:在 spec §8 路线图基础上,补齐 Phase 6 closeout 列出的"已知/后续",排出 Phase 7 → Phase 9+ 的 30 轮可执行队列。
>
> **生效日期**:2026-06-19
> **执行模式**:主 agent(Claude)按本路线图 + 每个 phase 的 plan 手动执行 + 自审;Ralph 自动循环**不再使用**(见根 `CLAUDE.md` "Ralph 状态")。
> **预算**:本路线图预计覆盖 18-22 个 phase task 单元,30 轮是硬上限(一轮 = 一次完整的 phase 实现+验收循环)。
> **总目标**:交付一个**符合 spec** 的 `cy's Stift` —— 本地优先灵感画布 + Tauri 桌面壳 + 完整捕获/编辑/画布/归档闭环 + 数据可导出 + 可分发安装包。

---

## 1. 路线图总览(按依赖排序)

> ⚠️ 编号仅是执行顺序。**spec §8** 的官方编号(7 / 8 / 9)优先级最高;Phase 7-1 / 7-2 这种是 Phase 7 内部的子步骤,放在 spec 表的 Phase 7 行之后展开。

| # | 名称 | 对应 spec | 主要工作 | 预估轮数 | 阻断依赖 |
|---|---|---|---|---|---|
| **P7** | **Archive(归档视图)** | spec §8 Phase 7 | `/archive` 路由 + 网格视图 + 时间轴视图 + 多选批量操作 | 5-7 | Phase 3 (inbox) ✅ |
| **P6.5a** | **草稿自动保存** | spec §5.5 | Mini Input + CreateCardForm 草稿 → SQLite(关闭重开恢复) | 1-2 | Phase 6 ✅ |
| **P6.5b** | **inbox 多媒介编辑** | Phase 3 已知/后续 + spec §4.8 | 详情 Modal 改 links/codeSnippets/quotes | 2-3 | Phase 3 ✅ |
| **P6.5c** | **inbox → canvas send** | Phase 3/4 已知/后续 | inbox 卡片"发送到画布"动作 + 副本入画布 | 2-3 | Phase 4 (canvas) ✅ + Phase 3 |
| **P6.5d** | **画布视图持久化** | Phase 5 已知/后续 + spec §4.9 `viewJson` | zoom/pan/gridMode 写 `canvases.viewJson`,刷新回放 | 2-3 | Phase 5 ✅ |
| **P6.5e** | **手动 capture 改用 WebCaptureSink** | Phase 6 已知/后续 | inbox CreateCardForm 改走 `WebCaptureSink.submit` | 1 | Phase 6 ✅ |
| **P6.5f** | **图片上传 / MediaAsset 落盘** | spec §4.5 | file input + 浏览器 IndexedDB / Tauri fs | 3-4 | P6.5e + Phase 2 ✅ |
| **P6.5g** | **菜单栏 / 多 CaptureSink 注册** | spec §5.5 + §7 | menubar UI + CaptureSinkRegistry 抽象 | 2-3 | Phase 6 ✅ |
| **P6.5h** | **快捷键自定义** | spec §5.5 | 设置页 + localStorage 配置 + 注册逻辑读配置 | 2-3 | P6.5g |
| **P8** | **Tauri 打包(可分发安装包)** | spec §8 Phase 8 | macOS .app/.dmg + Windows .msi + 签名 + 公证 + 自动更新骨架 | 8-10 | P6.5a-h(尽量全)、Phase 0 ✅ |
| **P9** | **JSON 导出 + 用户文档 + 录屏** | spec §8 Phase 9 + §1.2 信念4 | 导出按钮 + 导出格式 + 文档站 + 录屏 + 更新日志页 | 2-3 | Phase 2 (schema 稳定) ✅ |

**30 轮硬上限**:超出会强制收尾,写到 `docs/memory/decisions/YYYY-MM-DD-roadmap-stuck.md` 说明哪些 phase 没做、为什么。

---

## 2. 每阶段详细范围与验收锚点

> 每阶段开工前都会写 `docs/superpowers/plans/YYYY-MM-DD-phase-N-<slug>.md`(沿用 P0-P6 模板),含:范围 / 任务清单 / 验收清单 / 审核标准 / 风险 / 完成信号。
> 本节只列**路线图层面**的范围与验收锚点,避免和 plan 文件重复。

### Phase 7 · Archive(spec §8)

**为什么先做**:spec §8 显式排在 Phase 7,且依赖最少(Phase 3 inbox 数据已稳)。价值高(用户能看到积累),工作量中等。

**范围**:
- `/archive` 路由(`apps/web/src/app/archive/page.tsx`,`'use client'`,静态导出)
- 两种视图:
  - **网格视图**:卡片墙,6px gap,白底黑边 1px + 8px 圆角(与 Phase 4 Card Shape 视觉一致)
  - **时间轴视图**:按 `archivedAt` 倒序分组,组间 24px 分隔,组内单列
- 视图切换 Tab(网格/时间轴),风格与 inbox toolbar 一致
- 多选:checkbox + 顶部浮动工具条(还原 / 永久删除 / 导出选中)
- 还原:走 `CardService.unarchive(id)`
- 永久删除:走 `CardService.hardDelete(id)`(如已有)或新增 `softDelete → hardDelete` 流程,需二次确认
- 数据来源:`CardService.list({ view: 'archived' })`(Phase 2 已有)
- 导出选中 JSON(spec §1.2 信念4 的先期准备):P9 完整实现,本阶段先占位接口

**验收锚点**:
- [ ] `pnpm --filter domain test` 全绿(`unarchive` 新增 1-2 vitest)
- [ ] `pnpm --filter web build` exit 0,11 静态页
- [ ] 网格 + 时间轴 两种视图切换正常(截图 + puppeteer)
- [ ] 多选 + 还原 + 永久删除 走 service 不绕开
- [ ] 6 色 token / 字体 / 网格 仍对
- [ ] changelog + memory + context + commit + tag 齐

**Lean 排除**(明确不做):
- 标签筛选 / 全文搜索(spec §6.x 后期)
- 按日期 / 媒介类型分组的更复杂筛选
- Archive 卡片进入画布(P6.5c 范围)

---

### P6.5a · 草稿自动保存

**为什么补**:spec §5.5 "输入即保存草稿到 SQLite"。Mini Input 当前关闭即丢,不符 spec。

**范围**:
- `DraftService` 新增到 `packages/domain`(零依赖,只新增 1 个 service + 1 个表)
- `drafts` SQLite 表:`id / kind: 'capture' | 'manual' / payload: text(json) / updatedAt`
- Mini Input 改动:title/body 变更防抖 500ms → `DraftService.upsert({kind:'capture', payload:{title,body}})`
- 打开 Mini Input 时:先查 `DraftService.get({kind:'capture'})`,有则填回
- 提交成功或显式 `Cmd+Shift+Backspace` 清除草稿 → `DraftService.delete`
- inbox CreateCardForm 同结构改造

**验收锚点**:
- [ ] domain 12+ tests 全绿
- [ ] db 8+ tests 全绿(新增 `drafts` 表迁移测试)
- [ ] Mini Input 输入 → 关闭 → 重开 → 草稿恢复(puppeteer 断言)
- [ ] 提交成功后草稿清除

---

### P6.5b · inbox 多媒介编辑

**为什么补**:Phase 3 closeout 已列,详情 Modal 只暴露 title + body。spec §4.8 `links / codeSnippets / quotes` 不可编辑违反 MVP。

**范围**:
- 抽 `ListEditor` / `CodeEditor` / `QuoteEditor` 从 `inbox/page.tsx` 到 `apps/web/src/features/card/`
- 详情 Modal 编辑模式暴露 3 个 editor
- 提交走 `CardService.update(id, {links, codeSnippets, quotes})`(需扩 `update` 白名单,domain 零改动只增字段白名单)

**验收锚点**:
- [ ] domain 测试:update 接受 links/codeSnippets/quotes
- [ ] 详情 Modal 编辑 3 类媒介后保存 → `/inbox` 卡片渲染更新

---

### P6.5c · inbox → canvas send

**为什么补**:spec §6.3 描述的从 inbox 选卡发到画布的核心动作,Phase 4 closeout 留待。

**范围**:
- 详情 Modal 加 "Send to canvas" 按钮(走 `CanvasService.sendToCanvas(cardId)`)
- 新建 service:`CanvasService.sendToCanvas(cardId, canvasId = DEFAULT_CANVAS_ID)`:复制 card 到 canvases(同 cardId? 或新 id? — spec 倾向同 cardId,canvas 通过 `listOnCanvas` 拉;但需区分 "在画布" vs "在 inbox" 用新字段 `inCanvas: boolean` 或 `canvasId` nullable 外键)
- 决策:**用 `canvasId` nullable 外键**(schema 已在 §4.9 canvases 表留好);`CardService.create` 默认 null,inbox→canvas 时设 `canvasId`
- inbox 卡片详情 Modal 区分 "已送画布" 状态:badge "On canvas" + 跳画布按钮
- 画布已有同一 cardId 则跳过(service 校验)

**验收锚点**:
- [ ] domain `Card.canvasId` 字段(可能已存在,核对 spec §4.2)
- [ ] puppeteer:inbox 卡 → send → 出现在 `/canvas`

---

### P6.5d · 画布视图持久化

**为什么补**:Phase 5 closeout 已知/后续。zoom/pan/gridMode 刷新后丢失。

**范围**:
- `CanvasService.updateView(canvasId, viewJson)` 新增(domain 补 service)
- `CanvasRepository.update` 新增(db 层)
- tldraw `onMount`:加载后 `editor.store.listen` 监听相机 + gridMode 变化,防抖 500ms → `CanvasService.updateView`
- onMount 加载前:`CanvasService.getView(canvasId)` → `editor.setCamera` + `editor.updateDocumentSettings({isGridMode, gridSize})`
- 跨刷新断言(puppeteer)

**验收锚点**:
- [ ] domain 补 `updateView` 测试
- [ ] db 补 update 测试
- [ ] puppeteer:zoom to 200% → reload → 仍 200%

---

### P6.5e · 手动 capture 改用 WebCaptureSink

**为什么补**:Phase 6 closeout 列。两路 capture 入口(create 手动 + shortcut)走不同路径违反单一抽象。

**范围**:
- inbox CreateCardForm onSubmit 改走 `new WebCaptureSink(service).submit({source:{kind:'manual',...}, ...})`
- `CaptureSource` 加 `kind: 'manual'`(已有则免)
- 删除 `CardService.create` 中重复链路,统一用 `fromCapture`

**验收锚点**:
- [ ] domain `fromCapture` 测试覆盖 manual source
- [ ] inbox CreateCardForm 创建 → `card.source.kind === 'manual'`

---

### P6.5f · 图片上传 / MediaAsset 落盘

**为什么补**:spec §4.5 已声明需落盘基础设施;inbox 多媒介编辑不发图片没意义。

**范围**:
- `MediaAsset` schema 已存在(spec §4.7),核对 db schema
- `MediaService` 新增(domain,零依赖)
- `MediaRepository` 新增(db):存 `id / kind / mime / sizeBytes / blob / createdAt`
- 浏览器端:`<input type=file>` → 读 ArrayBuffer → 写入 IndexedDB(后续替换 OPFS)+ 注册到 `media_assets` 表 + 返回 assetId
- Tauri 端:`@tauri-apps/plugin-fs` 写 `app_data_dir/media/`
- 卡片加 `media: MediaAssetRef[]` 字段
- inbox CreateCardForm + 详情 Modal 暴露图片上传

**验收锚点**:
- [ ] domain `MediaService` 测试
- [ ] db `media_assets` 表迁移测试
- [ ] 上传 1 张图 → 详情页显示 → 跨刷新保留

**已知风险**:浏览器 IndexedDB 大小限制;后续 P2.5(wa-sqlite + OPFS)替换。

---

### P6.5g · 菜单栏 / 多 CaptureSink 注册

**为什么补**:spec §5.5 + §7。菜单栏入口是 spec 显式要求。

**范围**:
- 新建 `apps/web/src/features/capture/capture-sink-registry.tsx`:`CaptureSinkRegistry` 上下文,注册多个 sink
- `<CaptureHost />` 改用 registry(单 sink 简化版)
- 顶部菜单栏 UI(不在 tldraw 内,自建):`Capture / Inbox / Canvas / Archive` 四个链接
- 菜单栏 Capture 入口走 WebCaptureSink.source.kind = 'menu'
- spec §7 列的 tauri/menubar/webhook/mobile/alfred 5 个 sink,本阶段实现 web + menu 2 个

**验收锚点**:
- [ ] puppeteer:菜单栏 → Capture → Mini Input 弹出 + source.kind='menu'

---

### P6.5h · 快捷键自定义

**为什么补**:spec §5.5 "可在设置改"。

**范围**:
- `/settings` 路由(新)
- `SettingsService`(domain 零依赖,存 localStorage)
- 暴露:全局快捷键 / canvas 快捷键 / inbox 快捷键 / archive 快捷键 的可改配置
- `CaptureHost` 读配置而非硬编码 `Cmd+Shift+Space`

**验收锚点**:
- [ ] `/settings` 改快捷键 → 立即生效(刷新后也生效,因持久化)

---

### Phase 8 · Tauri 打包(可分发安装包)

**为什么后做**:spec §8 明示。需要 Rust 工具链 + 前面 phase 的桌面端集成(Tauri 全局快捷键 / 菜单栏 / MediaAsset 落盘)。

**范围**:
- `apps/desktop/src-tauri/Cargo.toml` 完整依赖
- `tauri.conf.json`:bundle 配置(mac .dmg + win .msi)
- 代码签名:mac `codesign` + `notarytool` 骨架 + 文档(用户填 teamId)
- 自动更新骨架:`@tauri-apps/plugin-updater` + manifest
- 图标 + 安装器 UI(本地化)
- CI:GitHub Actions 矩阵(macos-latest / windows-latest)打包 + 上传 release

**验收锚点**:
- [ ] `pnpm tauri build` exit 0,产物 .dmg / .msi 生成
- [ ] 安装后能跑 + 数据在 `~/Library/Application Support` / `%APPDATA%`
- [ ] CI 工作流跑通

**已知风险**:代码签名证书需用户申请,本阶段留环境变量 + 文档。

---

### Phase 9 · JSON 导出 + 文档 + 录屏

**范围**:
- `/settings` 加 Export 按钮:`ExportService.exportJson()` → 下载 .json
- 导出格式:`{version: 1, exportedAt, cards: [...], canvases: [...], mediaAssets: [...]}`
- 反向导入(可选):`ExportService.importJson()`(MVP 不做,留后)
- 用户文档:`docs/user/README.md` + 关键功能 GIF/录屏
- 更新日志页:把 changelog 转成用户可见的 `/changelog`
- 录屏:用 `nircmd` / `screencapture` 录 3 个核心流程

**验收锚点**:
- [ ] 导出按钮生成有效 JSON
- [ ] 文档站可读 + 录屏可播

---

## 3. 执行规则(30 轮内)

### 3.1 一轮 = 一个 phase

**定义**:从"写 plan"开始,到"验收清单全绿 + commit + tag + 文档 closeout"结束 = 1 轮。

**例外**:
- 极小 phase(纯文档、纯 bug 修复)算 0.5 轮
- 极大 phase(Phase 8 Tauri 打包)算 2-3 轮(显式拆分)

### 3.2 顺序

严格按本路线图 §1 表的 # 列顺序执行。**除非**前序 phase 验收失败 5 轮以上,转入"stuck 模式"写决策档,跳过剩余依赖该 phase 的后续 phase,先做能做的。

### 3.3 收尾六件套(每 phase 必做)

1. `pnpm --filter domain test` exit 0
2. `pnpm --filter db test` exit 0
3. `pnpm --filter web build` exit 0
4. 截图归档到 `docs/design/screenshots/phase-N/`
5. `docs/development/changelog.md` 追加
6. `docs/memory/decisions/YYYY-MM-DD-phase-N.md` + MEMORY 索引 + current-session 推进 + 根 CLAUDE.md 状态推进 + `git commit` + `git tag v0.X.0-phase-N`

### 3.4 Compact 触发

**触发条件**(任一):
- 对话超过 ~150k token
- 完成一个 phase 后
- 跨多个 phase task 单元后

**Compact Instructions**(从根 `CLAUDE.md`):
1. 保留:当前 phase 目标 + 已确认技术选型 + 不可修改文件 + 已验证无效方案 + 当前 phase 进度 + 未落地决策
2. 丢弃:早期调试日志 + 探索失败 + 已 supersede 中间方案

### 3.5 失败模式

- 测试/build 红:不输出 `<promise>`,继续迭代
- 同一失败 5 轮未解决:写到 `docs/memory/decisions/YYYY-MM-DD-<phase>-stuck.md`,说明卡在哪 + 已尝试方案 + 建议下一步
- 不允许"为通过验收而假装通过"

### 3.6 与用户的通讯

- 你睡眠期间:所有产出写到仓库 + commit;不主动打扰
- 早上起来:在终端看到一段总结(已完成的 phase 列表 + tag 列表 + 任何 stuck 决策)
- 真正需要决策的方向问题(本路线图没覆盖的):写 `docs/memory/decisions/YYYY-MM-DD-roadmap-question.md`,等你审

---

## 4. 不在本路线图(spec 范围外)

明确不做,避免范围蔓延:
- ❌ 云同步 / CRDT / 多人协作(spec §4.10 是"前瞻",不在 MVP)
- ❌ 移动端(PWA / Tauri Mobile)(spec §12 风险 #2,留后)
- ❌ 链接 OG 抓取(spec §12 风险 #11,无 server 抓不到)
- ❌ 暗色模式(spec §5.6 提到但不在 §8 MVP)
- ❌ 标签 / 全文搜索 / 复杂筛选
- ❌ wa-sqlite + OPFS(独立 phase 2.5,本路线图暂并入 P6.5f)

---

## 5. 进度追踪

> 实时更新。每完成一个 phase 在此打 ✅ + 写 tag。

| # | Phase | 状态 | tag | 完成日期 |
|---|---|---|---|---|
| P0 | 脚手架 | ✅ | v0.1.0-phase-0 | 2026-06-19 |
| P1 | 设计系统 | ✅ | v0.2.0-phase-1 | 2026-06-19 |
| P2 | 数据层 | ✅ | v0.3.0-phase-2 | 2026-06-19 |
| P3 | Inbox | ✅ | v0.4.0-phase-3 | 2026-06-19 |
| P4 | Canvas 基础 | ✅ | v0.5.0-phase-4 | 2026-06-19 |
| P5 | Canvas 完整 | ✅ | v0.6.0-phase-5 | 2026-06-19 |
| P6 | 捕获入口 | ✅ | v0.7.0-phase-6 | 2026-06-19 |
| **P7** | **Archive** | ✅ | v0.8.0-phase-7 | 2026-06-19 |
| **P6.5a** | **草稿自动保存** | ✅ | v0.8.1-phase-6.5a | 2026-06-19 |
| **P6.5b** | **inbox 多媒介编辑** | ✅ | v0.8.2-phase-6.5b | 2026-06-19 |
| **P6.5c** | **inbox → canvas send** | ✅ | v0.8.3-phase-6.5c | 2026-06-19 |
| **P6.5d** | **画布视图持久化** | ✅ | v0.8.4-phase-6.5d | 2026-06-19 |
| **P6.5e** | **手动 capture 改用 WebCaptureSink** | ✅ | v0.8.5-phase-6.5e | 2026-06-19 |
| **P6.5f** | **图片上传 / MediaAsset 落盘** | ✅ | v0.8.6-phase-6.5f | 2026-06-19 |
| **P6.5g** | **菜单栏 / 多 CaptureSink 注册** | ✅ | v0.8.7-phase-6.5g | 2026-06-19 |
| **P6.5h** | **快捷键自定义** | ✅ | v0.8.8-phase-6.5h | 2026-06-19 |
| **P8** | **Tauri 打包** | 🟡 STUCK(需 Rust) | — | 2026-06-19 stuck 决策档 |
| **P9** | **JSON 导出 + 文档 + 录屏** | 🟡 下一个 | — | — |

---

> **维护者**:Claude(主模型)
> **最后更新**:2026-06-19 启动
> **下次更新**:每完成一个 phase 在 §5 打 ✅