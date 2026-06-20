# 当前会话交接(2026-06-20 · ▶ 下一步 = 执行 trash 回收/恢复视图 plan)

> **新会话/新模型先读此档**,再读根 `CLAUDE.md` + `docs/development/roadmap.md`。
> clear 后上下文全丢,这里是不丢的全部。
>
> **▶ 下一步(compact 后立即执行):soft-delete 回收/恢复视图(findings #2)。** 入口已定 = **新 `/trash` 路由**(活跃 inbox / 归档 archive / 删除 trash 三分离)。完整 plan 见 [`docs/superpowers/plans/2026-06-20-trash-recovery.md`](../../superpowers/plans/2026-06-20-trash-recovery.md) —— domain 加 `restore`/`hardDelete`(repo.delete 已就绪)+ `/trash` 页 + AppMenu Trash 入口 + inbox 软删文案指向 Trash + e2e + closeout 四件套,tag `v0.10.0-trash`。**先读 plan 再动手。**

---

## 一句话现状

**spec §8 路线图 13 个 phase 已完成**(Phase 0-7 + P6.5a-h + P9 + P9.1)。**Phase 8 Tauri:Rust 本就已装(2026-06-20 纠正——根因是 PATH 未配不是未安装,`cargo check` 已通过),待 `pnpm tauri build` + 签名**。self-review 发现的 **#1 import 原子性 + #3 sink 注册竞态已于 2026-06-20 修(v0.9.2)**;**剩 #2 soft-delete 无恢复入口(产品决策)+ #4 #5 canvas-editor 脆弱点(动 canvas 时修),仍 open**。等用户下一步诉求。

---

## 🔴 剩余 open(findings 里 #1 #3 已修,2026-06-20)

**完整原始清单见 [`docs/memory/decisions/2026-06-19-review-findings.md`](../decisions/2026-06-19-review-findings.md),已修记录见 [`docs/memory/decisions/2026-06-20-review-bugfixes.md`](../decisions/2026-06-20-review-bugfixes.md)**。摘要:

- ✅ **#1 Import 部分失败** — 已修:`export-service.ts` `importFromJson` 改 snapshot + 全量回滚(序列化前置 + 写入失败逐条回滚)。
- ✅ **#3 sink 注册竞态** — 已修:`inbox/page.tsx` + `capture-host.tsx` effect 加 `cancelled` flag。
- ⬜ **#2 soft-delete 无恢复入口** — 全局 gap(软删后 UI 无处看/恢复)。**产品决策**:要做"已删除/回收站"视图(domain 需新增 `restore`/`hardDelete`,现状只有 `softDelete`)+ archive/inbox 多处文案承诺了恢复。
- ⬜ **#4 `editor.dispose` 猴补丁脆弱** — `canvas-editor.tsx:96-101`(留到动 canvas 时重构成 useEffect)。
- ⬜ **#5 `editor.store.listen` 无 filter** — `canvas-editor.tsx:78`(同上)。

**建议**:#2 等用户明确要做(工作量中等:domain 加方法 + 新 tab/route + restore/hardDelete);#4 #5 留到下次动 canvas 一起。

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
| P8 | Tauri 打包 | 🟢 Rust 就绪 | Rust 本已装(cargo 1.96),根因 PATH 已修,`cargo check` 通过;待 `pnpm tauri build`/签名 |
| P9 | JSON 导出 + 文档 | v0.9.0 | export-service + `docs/user/README.md` |
| P9.1 | JSON 反向 import | v0.9.1 | importFromJson + capture race fallback |
| Review | bugfix #1+#3 | v0.9.2 | import 原子性(snapshot+回滚)+ sink 注册竞态(cancelled flag) |

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

## Phase 8 Tauri — Rust 就绪(2026-06-20 纠正,原"STUCK 需 Rust"是误判)

Rust **本就已装**(cargo/rustc 1.96,6/19 装),根因是 PATH 未 source `~/.cargo/env` → 交互 shell `command not found` 被误判。已修:`~/.zshrc` 加 `source "$HOME/.cargo/env"`。**`cargo check` exit 0,0 warning/error**,Phase 0 骨架完整,`tauri.conf.json` 正确指向 `../web/out`。接下来:

1. `cd apps/desktop/src-tauri && cargo check` ✅(已验证)
2. `pnpm tauri build` → mac 出本地未签名 `.app`/`.dmg`(Gatekeeper 提示右键打开即可)
3. 按需加 `tauri-plugin-global-shortcut` + JS 侧 `TauriCaptureSink` → `registry.register('tauri', ...)`
4. 签名 + 公证(需 Apple Developer 证书 $99/年;不签本地也能用)

详见 `docs/memory/decisions/2026-06-19-phase-8-stuck.md`(顶部有 2026-06-20 纠正块)。

---

## 下一步候选(trash 执行完后排)

- **canvas-editor 脆弱点**(findings #4 #5,下次动 canvas 一起重构成 useEffect)
- 暗色模式 / 多画布 UI / 标签全文搜索 / OPFS 真实落盘(P2.5)/ canvas dblclick 走 registry / archive tile 接 detail / 录屏
- Phase 8 Tauri build(本地未签名可直接出;Rust 就绪)+ 签名公证(需 Apple 证书)
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