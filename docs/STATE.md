# STATE — cy's Stift 当前状态(单一可信源)

> **这份文件是唯一的"当前状态"档。** 其它文档(CLAUDE.md / changelog / decisions)只引用它,不复制状态。
> 新会话 / `/clear` 后 / 新模型 — 先读本档。
> 版本表由 `scripts/gen-state.mjs` 从 `git tag` 生成,不会漂移。最后更新:v0.37.0。

## 产品一句话

**cy's Stift** — 本地优先的灵感画布,包豪斯风格 UI。灵感 3 秒记,画布上慢慢养。
(Next.js 15 静态导出 + tldraw + React 19 + TS strict;桌面壳 Tauri v2;数据 localStorage + OPFS,离线可用。)

## 版本里程碑(从 git tag)

| 版本 | 主题 | tag |
|---|---|---|
| v0.1.0–v0.9.2 | spec §8 核心:脚手架 / 设计系统 / 数据层 / inbox / canvas / 捕获 / archive / 导出 / review bugfix | v0.1.0 … v0.9.2 |
| v0.10.0 | trash 软删恢复 | v0.10.0-trash |
| v0.11.0–v0.14.0 | canvas-refactor / archive-detail / batch-confirm / send-back | v0.11.0 … v0.14.0 |
| v0.15.0–v0.17.0 | 多画布 + view per canvas + 暗色模式 | v0.15.0 … v0.17.0 |
| v0.22.x–v0.26.4 | UI/i18n/search/storage-meter/high-freedom canvas (F1/F2) + canvas 数据丢失 bugfix | v0.22.0 … v0.26.4 |
| v0.27.0 / v0.28.0 | canvas 关系箭头(M1)+ 智能捕获/导出(M2) | v0.27.0 / v0.28.0 |
| v0.29.0 | M3 AI(3 provider + 卡片 action + auto-relate) | v0.29.0-canvas-m3-ai |
| v0.30.0 | AI 可访问性 & 隐私设计(纯文档) | v0.30.0-ai-accessibility |
| v0.31.0–v0.31.2 | 技术债:global 清零 / canvas-editor 拆分 / 测试覆盖 / B6 OPFS offload | v0.31.0 … v0.31.2 |
| v0.32.0 | 标签系统(10 色固定调色板) | v0.32.0-tags |
| v0.33.0 | 画布导出 SVG/PNG + `.cystift` 往返 | v0.33.0-canvas-export |
| v0.33.1–v0.33.2 | AI 数据上下文 + AI 排版(DSL) | v0.33.1 / v0.33.2 |
| v0.36.0 | 全文搜索增强(打分 + 摘要) | v0.36.0-search |
| **v0.37.0** | **全量加固(第二个稳定版):真 bug 修复 + tsc 门禁 + 文档重构** | **v0.37.0** |

> v0.18–v0.21 版本号在历史中跳过(从 v0.17.0 直接进 v0.22.0),非缺失。
> **v0.27.1-review-hardening 无独立 tag** — 该轮 hardening(rehydrateCards / parseCardsRaw / geometry reconcile / M1 label)的工作被折进 v0.31.0 重构(refactor v0.31.0-p1.2/p1.3,见 `docs/decisions/2026-06-21-v0.27.1-review-hardening.md`)。

### 完整 tag 清单(由 `scripts/gen-state.mjs` 从 git tag 生成)

<!-- gen-state:start -->
| tag | 最近 commit 主题 | tag |
|---|---|---|
| v0.1.0-phase-0 | chore: phase 0 scaffold | v0.1.0-phase-0 |
| v0.2.0-phase-1 | feat(ui): phase 1 design system | v0.2.0-phase-1 |
| v0.3.0-phase-2 | feat(domain,db,web): phase 2 data layer | v0.3.0-phase-2 |
| v0.4.0-phase-3 | feat(web,domain): phase 3 — inbox business | v0.4.0-phase-3 |
| v0.5.0-phase-4 | feat(canvas): phase 4 — tldraw integration + card shape | v0.5.0-phase-4 |
| v0.6.0-phase-5 | feat(canvas): phase 5 — snap/free + zoom + snap guides | v0.6.0-phase-5 |
| v0.7.0-phase-6 | feat(capture): phase 6 — global shortcut + mini input + WebCa… | v0.7.0-phase-6 |
| v0.7.1-roadmap | docs: phase 7+ roadmap — 30-轮 execution plan | v0.7.1-roadmap |
| v0.8.0-phase-7 | feat(archive): phase 7 — /archive route + grid/timeline + mul… | v0.8.0-phase-7 |
| v0.8.1-phase-6.5a | feat(drafts): phase 6.5a — draft autosave (Mini Input + Creat… | v0.8.1-phase-6.5a |
| v0.8.2-phase-6.5b | feat(card): phase 6.5b — inbox multi-media edit | v0.8.2-phase-6.5b |
| v0.8.3-phase-6.5c | feat(canvas): phase 6.5c — inbox to canvas send | v0.8.3-phase-6.5c |
| v0.8.4-phase-6.5d | feat(canvas): phase 6.5d — canvas view persistence (zoom/pan/… | v0.8.4-phase-6.5d |
| v0.8.5-phase-6.5e | feat(capture): phase 6.5e — unify manual capture (CreateCardF… | v0.8.5-phase-6.5e |
| v0.8.6-phase-6.5f | feat(media): phase 6.5f — image upload (inline base64 MVP) | v0.8.6-phase-6.5f |
| v0.8.7-phase-6.5g | feat(menu): phase 6.5g — global AppMenu + CaptureSinkRegistry… | v0.8.7-phase-6.5g |
| v0.8.8-phase-6.5h | feat(settings): phase 6.5h — keymap customisation (/settings) | v0.8.8-phase-6.5h |
| v0.9.0-phase-9 | feat(export): phase 9 — JSON export + user docs | v0.9.0-phase-9 |
| v0.9.1-phase-9.1 | feat(export): phase 9.1 — JSON reverse import + capture race fix | v0.9.1-phase-9.1 |
| v0.9.2-review-bugfixes | fix(web): import atomicity + sink registration race (review #… | v0.9.2-review-bugfixes |
| v0.10.0-trash | feat(trash): soft-delete recovery view (#2) | v0.10.0-trash |
| v0.11.0-canvas-refactor | refactor(canvas): useEffect-driven canvas-editor (review #4 #5) | v0.11.0-canvas-refactor |
| v0.12.0-archive-detail | feat(archive-detail): tile click opens shared CardDetailModal | v0.12.0-archive-detail |
| v0.13.0-batch-confirm | feat(archive): batch soft-delete confirm modal (review §🟠 UX… | v0.13.0-batch-confirm |
| v0.14.0-send-back | feat(canvas): send-back-to-inbox reverse action (review §🟠 U… | v0.14.0-send-back |
| v0.15.0-multi-canvas | feat(canvas): multi-canvas UI (spec §4.9 long-deferred) | v0.15.0-multi-canvas |
| v0.16.0-multi-canvas-polish | feat(canvas+inbox): view persistence per canvas + active-canv… | v0.16.0-multi-canvas-polish |
| v0.17.0-dark-mode | feat(settings): dark mode (spec §5.6 long-deferred) | v0.17.0-dark-mode |
| v0.22.0-ui-polish | polish(tiles): CJK break rules + grid spacing (v0.22.0-ui-pol… | v0.22.0-ui-polish |
| v0.22.0-ux-polish | fix(ux): 5 UX bugs found by deep walkthrough (v0.22.0-ux-polish) | v0.22.0-ux-polish |
| v0.22.1-ux-polish-2 | feat(web): SVG favicon via app/icon.svg (v0.22.1-ux-polish-2 #3) | v0.22.1-ux-polish-2 |
| v0.22.2-assets | feat(assets): brand icons from AppAssets (v0.22.2-assets) | v0.22.2-assets |
| v0.22.3-i18n | fix(desktop): correct frontendDist path + regen icns (v0.22.3) | v0.22.3-i18n |
| v0.22.4-cardtype | fix(nav): archive/trash/settings footnote convergence (v0.22.4) | v0.22.4-cardtype |
| v0.22.5-search | feat(search): /search route + ⌘K shortcut + AppMenu entry (v0… | v0.22.5-search |
| v0.22.6-refactor | feat(deviceid): restore getDeviceId + checksum (v0.22.6-refac… | v0.22.6-refactor |
| v0.22.7-ux-stable | fix(ux): cross-platform shortcut hints Mac⌘/Win^ (v0.22.7) | v0.22.7-ux-stable |
| v0.23.0-modal-mini-input-polish | polish(mini-input): thin frame border 2px → 1px for dark-mode… | v0.23.0-modal-mini-input-polish |
| v0.23.1-i18n-hardening | fix(i18n): close 6 hardcoded English strings + dev-mode missi… | v0.23.1-i18n-hardening |
| v0.23.2-hardening | harden(v0.23.2): concurrency, schema validation, locale-safe … | v0.23.2-hardening |
| v0.23.3-critical-and-latent | harden(v0.23.3): queue, shortcut guard, a11y, dev-warn dedupe | v0.23.3-critical-and-latent |
| v0.24.0-card-pinning | feat(v0.24.0): card pinning UI — star toggle + pinned-first sort | v0.24.0-card-pinning |
| v0.24.1-modal-focus-trap | feat(v0.24.1): Modal focus trap + Tab cycling + focus restore | v0.24.1-modal-focus-trap |
| v0.25.0-tauri-global-shortcut | feat(v0.25.0): Tauri global shortcut — capture hotkey works u… | v0.25.0-tauri-global-shortcut |
| v0.25.1-review-bugfixes | fix(v0.25.1): 6 review bugs — listener leak, pin gaps, css re… | v0.25.1-review-bugfixes |
| v0.26.0-high-freedom-canvas-f1 | feat(canvas): full-canvas snapshot persistence + freeform sav… | v0.26.0-high-freedom-canvas-f1 |
| v0.26.1-high-freedom-canvas-f2 | fix(canvas): merge tldraw default shapeUtils — F2 toolbar act… | v0.26.1-high-freedom-canvas-f2 |
| v0.26.2 | polish(canvas): SVG icons + refined toolbar + send-to-canvas … | v0.26.2 |
| v0.26.3 | feat(v0.26.3): local-storage usage meter + overflow warning | v0.26.3 |
| v0.26.4-canvas-bugfixes | fix(v0.26.4): close 4 critical/high canvas data-loss vectors | v0.26.4-canvas-bugfixes |
| v0.27.0-canvas-m1-relations | fix(repo): recover M1/M2/f2 work orphaned by stash mishap | v0.27.0-canvas-m1-relations |
| v0.28.0-canvas-m2-smart | fix(repo): recover M1/M2/f2 work orphaned by stash mishap | v0.28.0-canvas-m2-smart |
| v0.29.0-canvas-m3-ai | feat(canvas-m3.5): canvas AI auto-relate action | v0.29.0-canvas-m3-ai |
| v0.30.0-ai-accessibility | docs(v0.30.0-ai-accessibility): AI data access + privacy desi… | v0.30.0-ai-accessibility |
| v0.31.0-debt-cleanup | test(v0.31.0-p1.4): canvas-snapshot-store unit tests (9 it, b… | v0.31.0-debt-cleanup |
| v0.31.1-test-coverage | test(v0.31.1): web unit test coverage — 6 files, 69 new tests | v0.31.1-test-coverage |
| v0.31.2-snapshot-offload | perf(v0.31.2): B6 canvas snapshot save offload to OPFS | v0.31.2-snapshot-offload |
| v0.32.0-tags | feat(v0.32.0): P4 tag system — Card.tags with 10-color fixed … | v0.32.0-tags |
| v0.33.0-canvas-export | feat(v0.33.0-canvas-export): SVG/PNG export + .cystift roundtrip | v0.33.0-canvas-export |
| v0.33.1-ai-context | feat(v0.33.1): P6 AI context — allowlist + canvas snapshot + … | v0.33.1-ai-context |
| v0.33.2-ai-layout | feat(v0.33.2): P7 AI layout — canvas toolbar button + applyLa… | v0.33.2-ai-layout |
| v0.36.0-search | feat(v0.36.0): P11 search enhancement — scored search + tags … | v0.36.0-search |
<!-- gen-state:end -->

## 当前能力(用户视角)

- **捕获**:全局快捷键 + Mini Input + 文件拖拽 + `.cystift` 文件拖回恢复
- **inbox**:多媒介编辑(链接/代码/引用/媒体)+ 草稿自动保存 + 发送到画布
- **canvas**:tldraw 自由画布(矩形/椭圆/箭头/便签/文本/手绘)+ 多画布 CRUD + 视图持久化 + 关系箭头 + AI 排版 + 导出 SVG/PNG
- **archive**:网格/时间轴 + 多选批量 + 详情 Modal
- **trash**:软删恢复
- **search**:全文检索(title 1.5x 权重 + body 摘要 + pinned 前置)
- **settings**:快捷键自定义 + 导入/导出 + 暗色主题 + AI provider 配置
- **标签**:10 色固定调色板,卡片标签 + 过滤

## 下一步

- **画布自研 · 路线 A(Phase 0 + Phase 1 基础骨架 + freedraw + arrow + text + selection 完成)**:渐进 tldraw → 自研 Canvas 2D 渲染器;特色 = 几何元素双向文本 DSL + 手绘向量 + 关系箭头 + 文本编辑 + 选择/删除。计划 `docs/plans/2026-06-22-canvas-self-build-route-a.md` + 逐步计划(phase0 / phase1-foundation / `-freedraw` / `-arrow` / `-text` / `-selection`);调研 `docs/decisions/2026-06-22-canvas-research-drawio-archdiag-affine.md`;冒烟 `scripts/phase0-smoke.cjs` / `phase1-{,freedraw-,arrow-,text-,selection-}smoke.cjs`。**Phase 0**:CanvasHost + TldrawAdapter,核心业务逻辑 + AI 路径上 host。**Phase 1 基础骨架**:SelfBuiltAdapter(Canvas 2D,零 tldraw)渲染 + 拖拽 + pan/zoom + 命中。**Phase 1 freedraw/arrow/text**:手绘向量 + 关系箭头渲染 + 文本编辑(IME)。**Phase 1 selection**:选择(单选/取消)+ dashed 高亮 + Delete 键(严守卫,文本编辑时不误删)。255 web 测试 + 真实 Chrome 冒烟(6 套全绿)。**剩余 tldraw 耦合 = Phase 1 后续/Phase 2 引擎集成**:card-shape-util、`<Tldraw>` 挂载、导出层、`.cystift`、handle/快照。**下一步**:Phase 1 交互打磨(2)(resize handle / 多选 / arrow 交互创建 / 更多键盘)或 Phase 2(ADR + spec §3.4/§6.x 五轮审查 + 移除 tldraw)。已知 token gap:`--color-green`/`--color-canvas` 未定义(readToken 回退兜底,无害)。
- **画布技术路线**(原 proposal,已并入选型):tldraw 依赖评估 + 自研替代 + 文本描述语言 + 基座更换 — 见 `docs/plans/2026-06-22-canvas-strategy-tldraw-vs-self-build.md`。最低杠杆的起点是**画布抽象层**(隔离业务代码与 tldraw API)。任何换基座属"重新选型",需 ADR + spec 审查。
- Tauri **签名公证**(P9 — 需 Apple 证书,用户提供)
- AI 找重复 / cluster / 时间线(P10)
- UX 打磨:inbox 批量 / Card markdown 双向 / minimap / undo-redo(P12)

## 已知 debt(有意 defer,非 bug)

- **颜色类型双轨制**:`ColorToken`(6 色 Bauhaus)vs `TagColor`(10 个 CSS var)未统一 — 稳定版内不做重构(风险大)。详见 v0.37.0 review D 段。
- **Tauri 未签名**:DMG 可本地构建(36MB,Apple Silicon),分发需签名公证。
- **存储配额估算**:localStorage 用 `Blob().size` 精确计字节;OPFS/IndexedDB 真实配额用 `navigator.storage.estimate()`,但 UI 仍按 5MB fallback 显示(未接 estimate)。

## 约束(不可遗忘,详见根 `CLAUDE.md`)

- spec `docs/specs/2026-06-19-cys-stift-design.md` 冻结,不改
- 技术栈不重选(Next.js / tldraw / SQLite / Drizzle)
- `packages/domain` 零依赖
- 颜色/像素走 token,不写死 hex
- AI 隐私:`source.deviceId` / `media.dataUrl` / 软删除卡 永不进 prompt(allowlist 强制)

## 索引

- 历史:`docs/changelog.md`(newest-first)
- 决策:`docs/decisions/`(+ `docs/decisions/INDEX.md` 纯索引)
- 路线:`docs/development/roadmap.md`
- 用户指南:`docs/user/README.md` · 隐私:`docs/user/privacy.md`
- 开发:`docs/development/setup.md` / `dependencies.md` / `privacy-design.md`
- 验证:`pnpm --filter domain test` / `pnpm --filter db test` / `pnpm --filter web build` / `pnpm -r lint`(domain/db/ui tsc)
