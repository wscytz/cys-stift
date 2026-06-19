# 当前会话交接(睡眠期间 13 轮完成 — spec §8 路线图全部完成)

> 用途:spec §9.1 指定的跨会话/跨模型延续档。compact、切模型都不丢。
> 启动时由新会话/新模型先读此档。

---

## 🎉 阶段定位

**spec §8 路线图全部完成**(除 Phase 8 Tauri 因无 Rust 骨架就位待构建)。

- **已完成**:Phase 0-7 + P6.5a-h + Phase 9 + P9.1 = **13 个 phase**(路线图 0.5 + 12.5 轮)
- **STUCK**:Phase 8 Tauri 打包(本机无 `rustc`/`cargo`;骨架在 `apps/desktop/src-tauri/`)
- **产品状态**:**完整可用的 web 应用** — 捕获 / inbox(多媒介编辑)/ canvas(视图持久化)/ archive(网格+时间轴+多选)/ settings(快捷键自定义 + 导出/导入)/ 用户文档
- **状态锚点**:`/Users/jinxunuo/projects/cys-stift/CLAUDE.md` + `docs/development/roadmap.md`

---

## 睡眠期间完成清单(13 phase)

| # | Phase | tag | 主要交付 |
|---|---|---|---|
| - | roadmap | v0.7.1-roadmap | 30 轮路线图 |
| P7 | Archive | v0.8.0 | /archive + grid/timeline + 多选批量 |
| 6.5a | 草稿自动保存 | v0.8.1 | draft-store + 500ms 防抖 + 关闭重开恢复 |
| 6.5b | Inbox 多媒介编辑 | v0.8.2 | editors 抽 features/card + 详情 Modal 暴露 |
| 6.5c | Inbox→Canvas Send | v0.8.3 | "Send to canvas" + moveToCanvas 复用 |
| 6.5d | 画布视图持久化 | v0.8.4 | canvas-view-store + tldraw 监听 |
| 6.5e | 统一手动 capture | v0.8.5 | CreateCardForm 走 WebCaptureSink |
| 6.5f | 图片上传 | v0.8.6 | media-store(base64 占位)+ 详情 Modal |
| 6.5g | 菜单栏 + registry | v0.8.7 | AppMenu + CaptureSinkRegistry + MenuCaptureSink |
| 6.5h | 快捷键自定义 | v0.8.8 | /settings + settings-store |
| 8 | Tauri 打包 | STUCK | 无 Rust;骨架就位 |
| 9 | JSON 导出 + 文档 | v0.9.0 | export-service + 用户文档 |
| 9.1 | JSON 反向 import | v0.9.1 | importFromJson + capture race fix |

**全部 0 新依赖;domain 11 tests + db 7 tests 全绿;web build exit 0(13 静态页);git 干净。**

---

## 关键架构成果(跨 phase)

### Web-local 存储(5 个独立 localStorage key)
- `cys-stift.cards.v1`(db-client,Phase 2)
- `cys-stift.drafts.v1`(draft-store,P6.5a)
- `cys-stift.media.v1`(media-store,P6.5f,base64 占位)
- `cys-stift.canvas-view.v1`(canvas-view-store,P6.5d)
- `cys-stift.settings.v1`(settings-store,P6.5h)

全部同模式:模块单例 + `useSyncExternalStore` + snapshot 引用稳定 + `hydrateOnce()` 同步。**Phase 8 Tauri 替换为 Tauri fs 时,公共 API 不变。**

### Capture 统一抽象
- `captureSinkRegistry`(P6.5g)+ `setFallbackService`(P9.1 race fix)
- 3 sink:`WebCaptureSink`(shortcut/manual)/ `MenuCaptureSink`(menubar)/ TauriCaptureSink(Phase 8 待)
- 入口:全局快捷键 / AppMenu Capture 按钮 / inbox 表单 —— 全走 registry

### 共享组件切片
- `features/card/editors.tsx`(P6.5b):ListEditor + CodeEditor + QuoteEditor + editorStyles + draft→payload 转换,CreateCardForm + CardDetail 双消费
- `features/capture/`:capture-sink + menu-capture-sink + mini-input + capture-host
- `features/archive/`:archive-card-tile(tile+row 双 variant)+ timeline
- `features/canvas/`:tldraw-canvas + canvas-editor + card-shape-util + canvas-binding + card-detail-modal + canvas-overrides + default-canvas
- `components/app-menu.tsx`(P6.5g):全局菜单栏

---

## STUCK: Phase 8 Tauri(需用户介入)

**卡点**:本机无 `rustc`/`cargo`。

**已有**(Phase 0 搭好):`apps/desktop/src-tauri/` 完整骨架(Cargo.toml + tauri.conf.json + main.rs/lib.rs + icons + capabilities)。

**用户装 Rust 后的步骤**(详见 `docs/memory/decisions/2026-06-19-phase-8-stuck.md`):
1. `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. `cd apps/desktop/src-tauri && cargo check`
3. 加 `tauri-plugin-global-shortcut` + 注册 `Cmd+Shift+Space`
4. JS 侧加 `TauriCaptureSink` → `captureSinkRegistry.register('tauri', ...)`
5. `pnpm tauri build`(mac .dmg / win .msi)
6. 签名 + 公证(mac 需 Apple Developer 证书)
7. CI:GitHub Actions 矩阵

**不阻断**:Phase 9 导出不依赖 Tauri;产品已是完整 web 应用。

---

## 下一步候选(路线图外,用户决定优先级)

纯 web 可做:
- **暗色模式**(spec §5.6 提到,token 抽象已留)
- **`/changelog` 路由**(用户可见更新日志)
- **多画布 UI**(spec §4.9 schema 已支持)
- **标签 / 全文搜索**
- **OPFS 真实落盘**(Phase 2.5,替换 base64 占位)
- **canvas dblclick 建卡也走 registry**(目前 `service.create` 绕过 sink,不一致)
- **Archive tile onClick 接通详情**(Phase 7 closeout TODO)
- **录屏**(spec §13,无自动化工具)

需环境:
- **Phase 8 Tauri**(需 Rust)
- **云同步 / CRDT**(spec §4.10 前瞻,需 server)

---

## 纪律提示(任何时候)

- ❌ 不要修改 `docs/superpowers/specs/2026-06-19-cys-stift-design.md`(五轮定稿)
- ❌ 不要重新选型 / 不要加未要求依赖(YAGNI)
- ❌ 不要在组件层写死 hex/像素值(全 token)
- ❌ 不要破坏 `packages/domain` 的零依赖特性
- ❌ 不要假装 build/test 通过
- ❌ 不要输出假 `<promise>` 跳过验收
- ✅ 静态导出:no SSR / no API routes / no Server Actions / no `[param]` 路由
- ✅ `useDb()` / 各 store snapshot 引用必须稳定(`useSyncExternalStore`)
- ✅ 提交到 main + tag;Conventional Commits
- ✅ Phase plan 写到 `docs/superpowers/plans/`
- ✅ 流程:写 plan → 实现 → 四件套 closeout(changelog / decisions / MEMORY / tag + 根 CLAUDE.md 状态推进)

---

## 已通过事项(不要重新怀疑)

### Phase 0-9 + P6.5a-h + P9.1 全部通过(详见 `docs/development/changelog.md`)

### 不变量
- 6 色 token + Space Grotesk/Inter/JetBrains Mono + 8px 网格 在所有路由都对
- `features/` + `app/` + `lib/` + `components/` 各 phase hex grep 零命中
- domain 11 tests + db 7 tests 全绿
- `pnpm --filter web build` exit 0,13 个静态页(/ + /inbox + /canvas + /archive + /settings + /design + /dev/*)

---

## Ralph loop 状态

用户睡前启动了 ralph-loop(max=0=无限,complete=null)。我按 30 轮路线图推进,**13 轮完成 spec §8 全部**后主动停下 —— 继续是锦上添花,边际价值下降,context 接近极限。

**建议**:用户醒来 review `docs/development/changelog.md` + `docs/development/roadmap.md` §5 进度表,决定:
- A. 继续打磨(暗色 / 多画布 / 搜索 / OPFS)
- B. 装 Rust 做 Phase 8
- C. 接受当前状态,产品已完整

ralph loop 仍在转,需手动 `/ralph-loop:cancel-ralph` 停止(或用户直接关 session)。