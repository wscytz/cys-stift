# 当前会话交接(2026-06-19 末 · 待用户给诉求)

> **新会话/新模型先读此档**,再读根 `CLAUDE.md` + `docs/development/roadmap.md`。
> clear 后上下文全丢,这里是不丢的全部。

---

## 一句话现状

**spec §8 路线图 13 个 phase 已完成**(Phase 0-7 + P6.5a-h + P9 + P9.1),Phase 8 Tauri 因本机无 Rust STUCK。刚做完一轮 self-review,**发现 3 个真 bug + 2 个风险,尚未修**。用户 review 完,正要给下一步诉求。

---

## 🔴 必读:刚发现的 open bug(未修)

**完整清单见 [`docs/memory/decisions/2026-06-19-review-findings.md`](../decisions/2026-06-19-review-findings.md)**。摘要:

1. **Import 部分失败不一致** — `export-service.ts:133-163`(cards 写成功 media 抛错 → 状态半旧半新,无回滚)
2. **soft-delete 无恢复入口** — 全局 gap(软删后 UI 无处看/恢复,文案承诺了恢复但没实现)
3. **sink 注册竞态** — `inbox/page.tsx:50-57` + `capture-host.tsx:89-103`(unmount 后 import 才 resolve → phantom sink)
4. `editor.dispose` 猴补丁脆弱 — `canvas-editor.tsx:96-101`
5. `editor.store.listen` 无 filter — `canvas-editor.tsx:78`

**建议**:#1 #3 先修(几行,低风险);#2 是产品决策(要做"已删除"视图);#4 #5 留到动 canvas 时一起。

---

## 已完成清单(13 phase,全 tag)

| # | Phase | tag | 交付 |
|---|---|---|---|
| - | roadmap | v0.7.1-roadmap | 30 轮路线图 |
| P7 | Archive | v0.8.0 | /archive 网格/时间轴 + 多选批量 |
| 6.5a | 草稿自动保存 | v0.8.1 | draft-store + 500ms 防抖 |
| 6.5b | Inbox 多媒介编辑 | v0.8.2 | editors 抽 features/card + 详情 Modal 暴露 |
| 6.5c | Inbox→Canvas Send | v0.8.3 | "Send to canvas" + moveToCanvas 复用 |
| 6.5d | 画布视图持久化 | v0.8.4 | canvas-view-store + tldraw 监听 |
| 6.5e | 统一手动 capture | v0.8.5 | CreateCardForm 走 WebCaptureSink |
| 6.5f | 图片上传 | v0.8.6 | media-store(base64 占位)+ 详情 Modal |
| 6.5g | 菜单栏 + registry | v0.8.7 | AppMenu + CaptureSinkRegistry + MenuCaptureSink |
| 6.5h | 快捷键自定义 | v0.8.8 | /settings + settings-store |
| P8 | Tauri 打包 | 🟡 STUCK | 无 Rust(`rustc`/`cargo` 未装);骨架在 `apps/desktop/src-tauri/` |
| P9 | JSON 导出 + 文档 | v0.9.0 | export-service + `docs/user/README.md` |
| P9.1 | JSON 反向 import | v0.9.1 | importFromJson + capture race fallback |

**全部 0 新依赖;domain 11 tests + db 7 tests 全绿;web build exit 0(13 静态页);git 干净。**

详见 `docs/development/changelog.md`(每 phase 一段)+ `docs/development/roadmap.md` §5 进度表。

---

## 架构速览(接手别重造)

### 5 个 web-local store(同一模式:模块单例 + `useSyncExternalStore` + snapshot 稳定 + `hydrateOnce`)
- `cys-stift.cards.v1` — `lib/db-client.ts`(Phase 2,db-client + useDb hook)
- `cys-stift.drafts.v1` — `lib/draft-store.ts`(P6.5a)
- `cys-stift.media.v1` — `lib/media-store.ts`(P6.5f,base64 占位)
- `cys-stift.canvas-view.v1` — `lib/canvas-view-store.ts`(P6.5d)
- `cys-stift.settings.v1` — `lib/settings-store.ts`(P6.5h)

**Phase 8 Tauri 替换 Tauri fs 时,公共 API 不变。**

### Capture 统一抽象
- `features/capture/capture-sink.ts` — `captureSinkRegistry`(register/submit/has)+ `setFallbackService`(race 兜底)+ `WebCaptureSink`
- `features/capture/menu-capture-sink.ts` — `MenuCaptureSink`(`source.kind='menubar'`)
- `features/capture/capture-host.tsx` — 全局快捷键 + CustomEvent 监听 + `openKind` 区分 source;root layout 挂载
- `features/capture/mini-input.tsx` — Mini Input(spec §5.5 视觉 + 草稿)
- 3 入口(快捷键 / AppMenu Capture / inbox 表单)全走 registry

### 共享切片
- `features/card/editors.tsx` — ListEditor/CodeEditor/QuoteEditor + editorStyles + draft→payload 转换(CreateCardForm + CardDetail 双消费)
- `features/archive/` — archive-card-tile(tile+row 双 variant)+ timeline
- `features/canvas/` — tldraw-canvas + canvas-editor + card-shape-util + canvas-binding + card-detail-modal + canvas-overrides + default-canvas
- `components/app-menu.tsx` — 全局菜单栏(Inbox/Canvas/Archive/Settings + Capture)

### 静态页(13)
`/` `/inbox` `/canvas` `/archive` `/settings` `/design` `/dev/db` `/dev/min` `/dev/tldraw` + `_not-found`

---

## 怎么验证(改完代码就跑)

```bash
pnpm --filter domain test     # 11 tests(纯逻辑,快)
pnpm --filter db test         # 7 tests(SQLite 集成)
pnpm --filter web build       # 静态导出 exit 0
# 交互验证:dev server + puppeteer
pnpm --filter web dev --port 3016 &
node scripts/p<N>-shots.cjs   # N = 6.5a/b/c/d/e/f/g/h, 7, 9, 9.1
```

**铁律:不许假装 build/test 通过,必须实际跑看 exit code。**

---

## Phase 8 Tauri STUCK(需用户介入)

本机无 `rustc`/`cargo`。骨架已在 `apps/desktop/src-tauri/`(Phase 0 搭)。装 Rust 后:
1. `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. `cd apps/desktop/src-tauri && cargo check`
3. 加 `tauri-plugin-global-shortcut` + JS 侧 `TauriCaptureSink` → `registry.register('tauri', ...)`
4. `pnpm tauri build`(mac .dmg / win .msi)+ 签名公证

详见 `docs/memory/decisions/2026-06-19-phase-8-stuck.md`。**不阻断**:Phase 9 导出不依赖 Tauri。

---

## 下一步候选(等用户诉求决定优先级)

- **修 review 发现的 bug**(见上方 🔴,#1 #3 优先)
- **soft-delete 恢复视图**(产品决策,工作量中等)
- 暗色模式 / 多画布 UI / 标签全文搜索 / OPFS 真实落盘(P2.5)/ canvas dblclick 走 registry / archive tile 接 detail / 录屏
- Phase 8 Tauri(需 Rust)
- 云同步 / CRDT(spec §4.10 前瞻,需 server)

---

## 纪律(任何时候、任何模型)

- ❌ 不改 `docs/superpowers/specs/2026-06-19-cys-stift-design.md`(五轮定稿)
- ❌ 不重新选型 / 不加未要求依赖(YAGNI)
- ❌ 组件层不写死 hex/像素(全 token)
- ❌ 不破坏 `packages/domain` 零依赖
- ❌ 不假装 build/test 通过 / 不输出假 `<promise>`
- ✅ 静态导出:no SSR / no API routes / no Server Actions / no `[param]` 路由
- ✅ snapshot 引用稳定(`useSyncExternalStore`)
- ✅ commit 到 main + tag;Conventional Commits
- ✅ plan 写 `docs/superpowers/plans/`;closeout 四件套(changelog / decisions / MEMORY / tag + 根 CLAUDE.md)

---

## 关键文件位置

| 想知道什么 | 看哪里 |
|---|---|
| 项目锚点 + 当前状态 | 根 `CLAUDE.md` |
| 30 轮路线图 + 进度表 | `docs/development/roadmap.md` |
| 每 phase 详细变更 | `docs/development/changelog.md` |
| **open bug 清单(未修)** | `docs/memory/decisions/2026-06-19-review-findings.md` |
| 用户使用指南 | `docs/user/README.md` |
| 设计 spec(不可改) | `docs/superpowers/specs/2026-06-19-cys-stift-design.md` |
| 各 phase plan | `docs/superpowers/plans/` |
| 长期决策索引 | `docs/memory/MEMORY.md` |