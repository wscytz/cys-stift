# 当前会话交接(2026-06-20 · ▶ 下一步 = 等用户诉求)

> **新会话/新模型先读此档**,再读根 `CLAUDE.md` + `docs/development/roadmap.md`。
> clear 后上下文全丢,这里是不丢的全部。
>
> **▶ 下一步:等用户诉求。** review findings **全部 5 项关闭** + UX 洞 #2 #3 #4(archive tile 接 Modal + 批量软删二次确认 + send-back 反向)**全部已修**;**产品 0 个 open review 项**。Phase 8 Tauri build(Rust 就绪)按需触发。候选:多画布 UI(spec §4.9) / 暗色模式 / 标签搜索 / OPFS(Phase 2.5) / inbox dead styles 清理 / 录屏 / Phase 8 tauri build + 签名公证。

---

## 一句话现状

**spec §8 路线图 13 个 phase 全部完成 + review 全部 5 项关闭 + UX 洞 #2 #3 #4 关闭 + canvas dblclick 走 capture registry**(Phase 0-7 + P6.5a-h + P8 + P9 + P9.1 + bugfix v0.9.2 + trash v0.10.0 + canvas-refactor v0.11.0 + archive-detail v0.12.0 + batch-confirm v0.13.0 + **send-back v0.14.0** + **refactor 9d7aa24**)。Phase 8 Tauri:Rust 本就已装(cargo 1.96),`cargo check` 通过,待 `pnpm tauri build` + 签名。等用户下一步诉求。

---

## 🔴 review findings(全部 5 项关闭,2026-06-20)+ UX 洞 #2 #3 #4 关闭

**完整原始清单见 [`docs/memory/decisions/2026-06-19-review-findings.md`](../decisions/2026-06-19-review-findings.md);已修记录见 06-20 七档**。

- ✅ **#1 Import 部分失败** — 已修(v0.9.2)
- ✅ **#3 sink 注册竞态** — 已修(v0.9.2)
- ✅ **#2 soft-delete 无恢复入口** — 已修(v0.10.0-trash)
- ✅ **#4 `editor.dispose` 猴补丁脆弱** — 已修(v0.11.0-canvas-refactor)
- ✅ **#5 `editor.store.listen` 无 filter** — 已修(v0.11.0-canvas-refactor)
- ✅ **UX #4 archive tile no-op** — 已修(v0.12.0-archive-detail)
- ✅ **UX #3 批量 soft-delete 无二次确认** — 已修(v0.13.0-batch-confirm)
- ✅ **UX #2 send-to-canvas 反向动作** — 已修(v0.14.0-send-back)

**结论**:**所有 review 5 项 + UX 洞 4 项全部关闭,产品 0 个 open review 项**。

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
| trash | soft-delete 回收/恢复 | v0.10.0-trash | /trash 路由 + domain restore/hardDelete + AppMenu Trash + inbox 文案兑现 |
| canvas-refactor | useEffect 驱动 canvas-editor | v0.11.0-canvas-refactor | useValue 替代 listen 无 filter + useEffect bridge 替代 dispose 猴补丁,关闭 #4 #5 |
| archive-detail | archive tile 接 Modal + 共享组件 | v0.12.0-archive-detail | 抽 features/card/card-detail.tsx,inbox+archive 双消费;关闭 UX #4 |
| batch-confirm | archive 批量软删二次确认 | v0.13.0-batch-confirm | floater Soft-delete 弹 Modal + Cancel 保留 selected;关闭 UX #3 |
| send-back | canvas 卡反向回 inbox | v0.14.0-send-back | domain removeFromCanvas + canvas Modal 按钮;关闭 UX #2 |
| refactor 9d7aa24 | canvas dblclick 走 capture registry | (no tag) | 统一所有 capture 入口(inbox/menubar/shortcut/canvas) |

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

## 下一步候选(等用户诉求)

- **多画布 UI**(spec §4.9 schema 已支持 — 留后很久)
- 暗色模式 / 标签全文搜索 / OPFS 真实落盘(P2.5)/ 录屏 / inbox page dead styles 清理
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