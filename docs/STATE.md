# STATE — cy's Stift 当前状态(单一可信源)

> **这份文件是唯一的"当前状态"档。** 其它文档(CLAUDE.md / changelog / decisions)只引用它,不复制状态。
> 新会话 / `/clear` 后 / 新模型 — 先读本档。
> 版本表由 `scripts/gen-state.mjs` 从 `git tag` 生成,不会漂移。最后更新:v0.37.0。

> **方向迷茫时**:先读 [`docs/product-and-engine.md`](product-and-engine.md) —— 产品与引擎的定位锚点 + 优先级框架。判断"这一步是否推进核心承诺",而非"还有没有缝可修"。

## 产品一句话

**cy's Stift** — 本地优先的灵感画布,包豪斯风格 UI。灵感 3 秒记,画布上慢慢养。
(Next.js 15 静态导出 + 自研 Canvas 2D + React 19 + TS strict;桌面壳 Tauri v2;数据 localStorage + OPFS,离线可用。)

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
- **canvas**:自研 Canvas 2D 自由画布(矩形/椭圆/箭头/便签/文本/手绘)+ 多画布 CRUD + 视图持久化 + 关系箭头 + AI 排版 + 导出 SVG/PNG
- **archive**:网格/时间轴 + 多选批量 + 详情 Modal
- **trash**:软删恢复
- **search**:全文检索(title 1.5x 权重 + body 摘要 + pinned 前置)
- **settings**:快捷键自定义 + 导入/导出 + 暗色主题 + AI provider 配置
- **标签**:10 色固定调色板,卡片标签 + 过滤

## 下一步

- **画布自研 · 路线 A(Phase 0-2 全完成;tldraw 已移除)**:渐进 tldraw → 自研 Canvas 2D 渲染器**收口**;特色 = 几何元素双向文本 DSL + 手绘向量 + 关系箭头(渲染+connect+关系 panel+auto-relate)+ 文本编辑(IME)+ 选择/删除/resize/多选组移动/键盘微移/undo-redo + 导出(SVG/PNG/.cystift 全走 CanvasElement)。ADR `docs/adr/2026-06-23-remove-tldraw.md`;Phase 2 spec `docs/superpowers/specs/2026-06-23-phase2-canvas-replace-tldraw.md`;计划 `docs/plans/2026-06-22-canvas-self-build-route-a.md` + 逐步(phase0 / phase1-foundation/-freedraw/-arrow/-text/-selection/-resize/-multiselect/-connect/-keyboard / phase2-sub1/-sub2/-sub3/-sub4);调研 `docs/decisions/2026-06-22-canvas-research-drawio-archdiag-affine.md`;冒烟 `scripts/phase0-smoke.cjs` / `phase1-{,freedraw-,arrow-,text-,selection-,resize-,multiselect-,connect-,keyboard-}smoke.cjs` / `phase2-{main,sub2,sub3,sub4}-smoke.cjs`。**Phase 0**:CanvasHost + TldrawAdapter(已删),核心业务逻辑 + AI 路径上 host。**Phase 1**:SelfBuiltAdapter(Canvas 2D)功能完备。**Phase 2**:主路由切 SelfCanvas + 卡片渲染/toolbar + 导出层迁 CanvasElement + 关系层迁 host。**子5(收口,已完成)**:删 tldraw 依赖 + 11 个 tldraw 代码文件(tldraw-canvas/canvas-editor+3 bridges/canvas-toolbar/card-shape-util/card-handles/tldraw-adapter+test/dev/tldraw)+ ADR。`@tldraw/tldraw` 从 package.json 移除;零 `@tldraw` import;/canvas First Load JS **649kB→176kB**(降 ~470kB)。309 web 测试 + build exit 0 + 14 套冒烟。**spec 画布章节修订已完成(2026-06-23)**:tldraw → 自研 Canvas 2D,五轮审查通过 + 用户终审;见 `docs/decisions/2026-06-23-spec-canvas-selfbuilt-revision.md`。**子5 后 debt 收口(2026-06-23,已完成)**:① text 编辑接主路由(SelfCanvas 移植浮动 textarea 编辑会话,Text 工具点 canvas 起 textarea / IME / Ctrl+Enter 提交 / Escape 取消 / 切工具收起);② **freeform 持久化层**(新 `canvas-freeform-store` per-canvas OPFS 主+localStorage 回退,只存非 card 的 `CanvasElement[]`,card 仍走 DB 单一可信源;新 `canvas-freeform-binding` hydrate+debounce save+card 过滤+race/echo/disposed 守卫;接入 SelfCanvas;删旧 tldraw 形状孤儿 `canvas-snapshot-store`)——325 web 测试 + build exit 0 + phase2-{text-main,freeform-persist} 冒烟;③ **选区轮询 → onSelectionChange 事件**(CanvasHost 接口加 `onSelectionChange`/`setSelectedIds`/`onViewChange`;SelfBuiltAdapter + InMemoryCanvasHost 实现,选区实际变化才 emit;RelationPanel 用 selection/view/user 事件替 200ms 轮询,page auto-relate 按钮用 onSelectionChange 替 300ms 轮询;零 setInterval 残留)——331 web 测试 + build exit 0。**剩余 debt**:`--color-green`/`--color-canvas` token 未定义(readToken 回退兜底,colorOf 已不再映射 green)。〔已解决(2026-06-23,见下条引擎打磨):~~undo 粒度=每次变更 1 步~~ → undo coalescing;~~跨 card/freeform 的 z-order 不完整保留~~ → 确定性 z 序;~~拖动/缩放手绘笔画不跟随~~ → 点序列变换〕④ **关系箭头语义三维签名 + token 规范**(2026-06-23):关系箭头做出 cy's Stift 特色——每种语义关系一个固定三维视觉签名(线型 dash + 箭头形 arrowhead + 颜色),区别于 tldraw/excalidraw 的「用户手选样式几何箭头」。`CanvasElement` 加 `dash`/`arrowhead` 字段;`applyRelationType` 写完整签名;实时渲染(setLineDash + 开口V/实心三角/无箭头)+ SVG 导出(stroke-dasharray + polygon/polyline)同源几何(`dashPattern`/`arrowheadPoints` 纯函数);RelationPanel swatch 显线型;`.cystift` 往返自动携带。规范修复:删 `colorOf`/`strokeColor` 的 green 映射(违反 Bauhaus 6 原色铁律,第七色),加 grey→`--color-gray`(修 related-to 灰色被画成黑色真 bug),`ArrowColor` 联合收紧到实际用色——348 web 测试 + build exit 0 + phase2-relation-signature 冒烟。
- **画布技术路线**(原 proposal,已并入选型):tldraw 依赖评估 + 自研替代 + 文本描述语言 + 基座更换 — 见 `docs/plans/2026-06-22-canvas-strategy-tldraw-vs-self-build.md`。最低杠杆的起点是**画布抽象层**(隔离业务代码与 tldraw API)。任何换基座属"重新选型",需 ADR + spec 审查。
- **画布引擎独立化 + 打磨(2026-06-23,北极星)**:自研画布核心抽成 **`packages/canvas-engine`** —— 零业务依赖(不 import `@cys-stift/domain`/react/next)、框架无关(无 `'use client'`)、token 注入(`TokenResolver` 默认 `domTokenResolver`,解耦 cys-stift 调色板/DOM)、独立测试套(156)+ README + standalone 活证据(`InMemoryCanvasHost` + 自定义 tokenResolver 证明脱离 cys-stift 仍完整运行)。ADR `docs/adr/2026-06-23-canvas-engine-extract.md`。差异化卖点(vs tldraw/excalidraw):语义关系签名(线型+箭头形+颜色三维编码)+ 透明 `CanvasElement` 统一模型(live/SVG/PNG/.cystift/DSL 全是它的视图)。**衔接打磨**(同期收口):① undo coalescing(拖拽/resize 连续变更合并为 1 步,commit `a108c34`);② **确定性 z 序**——z 序升级为模型属性,`KIND_LAYER` 固定分层(底→顶 rect<freedraw<card<arrow<text,同 kind 保插入序),`getElements` 返回稳定排序 → 渲染/hitTest/SVG/快照/DSL/.cystift 五视图一致,reload 视觉不变(此前是 Map 插入序,card 同步先入/freeform 异步后入 → freeform 总压 card 上,reload 前后不一致;commit `ff34c3c`);③ `.cystift` 拖放几何恢复——无 host 路径(拖放建新画布)曾静默丢弃 freeform 几何,现持久化到新画布的 `canvasFreeformStore`,新 host mount 时 hydrate(commit `566bf46`)。**渲染性能基线**(2026-06-23,填未压测盲点;`packages/canvas-engine/src/__tests__/render.bench.ts`,`vitest bench --run`,jsdom/mock ctx,意义在防回归非真实帧率):renderElements 100=0.30ms / 1k=3.4ms / 5k=24ms(线性,典型 <500 元素 60fps 无压力);sortByLayer(getElements 每帧排序)100=7µs / 5k=434µs(占渲染 <2%,非热点,无需缓存);hitTest 全规模 <5µs。156 引擎 + 407 web + build exit 0。**setView 自我防御**(2026-06-23):`sanitizeView` 净化脏 view(zoom 钳 [0.1,8] + pan/zoom 非有限值兜底 + gridMode 非法兜底)——引擎独立资产不信任调用方(.cystift/localStorage/AI 可能传 zoom=0/NaN,会让 screenToPage 除 0 失真)。**手绘底座 + 语义互动**(2026-06-23,计划 `docs/plans/2026-06-23-freedraw-foundation.md`,用户三级模型 ①移动+保存 →②AI识别[暂不做,守 R2 隐私] →③本地猜+特殊互动):**修底座移动 bug**——freedraw 真身=`meta.points`(绝对坐标),drag/resize 此前只改 bbox 不变换点序列 → 拖动/缩放手绘笔画原地不动(渲染用 points;边界疏漏:freedraw phase 不管 move,move phase 只用 card 测,落两 phase 交界缝隙)。新 `translateFreedraw`/`scaleFreedrawToBox` 纯函数 + adapter drag/resize 接线(freedraw 走点序列变换,非 freedraw 维持 bbox);**交互矩阵测试**(`self-built-interaction-matrix.test.ts`,每种 kind × {drag,resize} 断言视觉真身变,自动抓 kind×操作疏漏)。**③ 猜箭头转真 arrow**:`arrowEndpoints` 扩支持自由箭头(无 from/to,bbox 编码线段端点)+ `freedrawToArrow`(首尾点→自由箭头)+ FreedrawPanel 判 arrow 高置信时「转为箭头」按钮(host.batch 单步可 undo)。206 引擎 + 427 web + build exit 0。**交互鲁棒性第二轮**(2026-06-23,计划 `docs/plans/2026-06-23-engine-interaction-hardening-2.md`):自由箭头(w/h 可负表方向)带出新缝——hitTest/handleAtPoint/选中框 按 `x..x+w` 取范围假设 w≥0,负 bbox 区间为空 → 反向自由箭头点不中/选不了/移不动(同 freedraw 移动 bug 同源:新元素形态没进既有几何假设)。`bounds.normalizeBox`(w/h<0 翻转,正 bbox 原样)接入 hitTest/handleAtPoint/drawSelectionOutlines;矩阵测试扩 hitTest + 键盘微移两列(又照出 freedraw 键盘微移只移 bbox 不移 points,一并修)。矩阵现全覆盖 card/rect/text/freedraw × drag/resize/hitTest/键盘微移。bounds.ts 补直测(此前无)。224 引擎 + 427 web + build exit 0。**手绘形状识别升级 · \$1 recognizer**(2026-06-23,计划 `docs/plans/2026-06-23-freedraw-gesture-recognizer.md`,基于 Wobbrock et al. UIST 2007):把识别从「猜类别」(classifyFreedraw 启发式 arrow/decoration)升级到「认具体形状」(圈/方/三角/对勾)。`gesture-recognizer.ts` 落地论文 Appendix A 4 步(resample N=64 / rotate-to-zero 指示角归 0 / scale-to-square + translate / GSS 黄金分割搜角最小路径距离 → {name,score[0..1]}),~100 行纯几何零依赖;`gesture-templates.ts` 内置 4 模板 + `recognizeShape`(score≥0.7 认,否则 unknown 不硬猜)。**全程本地,点序列不外发**(选 \$1 的核心原因——守 R2 隐私,不做②AI 介入手绘)。FreedrawPanel 升级:装饰类跑 \$1 → 显示「看起来像圆圈 92%」等具体形状;箭头(1D 细长)继续走启发式 + 转箭头(非均匀缩放对 1D 无意义)。诚实记论文限制:旋转/缩放/平移不变 → 无法区分朝向/比例(方vs长方、圆vs椭圆、上/下箭头)。253 引擎 + 427 web + build exit 0。**交互鲁棒性第三轮**(2026-06-24,计划 `docs/plans/2026-06-24-engine-interaction-hardening-3.md`):矩阵探照灯照出**关系箭头选不中**——关系箭头(connect 创建)bbox w=h=0(端点由 from/to 算),hitTest 按 bbox 只有单点命中 → 点不中/选不了/删不掉/改不了关系类型(RelationPanel 永不显示);marqueeSelect 同理框不中。同 freedraw 移动 bug 同源(一类零尺寸元素 × 选择,从未进矩阵,测试零覆盖)。修:`hitTest` arrow 走**线段距离命中**(arrowEndpoints 算两端,点到线段距离<6px/zoom 容差;+zoom 参数);`marqueeSelect` arrow 走**线段-框相交**(端点在内 或 线段穿框)。自由箭头(bbox 非零)也统一走线段。矩阵 +hittest +marquee 单测固化。263 引擎 + 427 web + build exit 0。**交互鲁棒性第四轮**(2026-06-24,计划 `docs/plans/2026-06-24-engine-interaction-hardening-4.md`,Explore subagent 系统扫描):无「高」级缝,修 2 中 1 低——① **undo/restore 不同步选区**(ghost selection:undo 撤元素后 id 残留 selectedIds → 后续操作取幽灵 id 静默失效)→ restore() 末尾过滤 selectedIds∩快照 id + 条件 emit;② **删端点元素→关系箭头悬空成幽灵**(arrowEndpoints 找不到端点→箭头消失但残留 this.elements,占 id/进快照/reload 仍悬空,看不见选不中删不掉)→ remove() 级联删 from===id||to===id 的 arrow(1 步 undo,drawio/tldraw 惯例);③ **删 dragId/dragOffset 死代码**(dragOffset 从未赋值、dragId 分支永不可达,纯减法)。审后不修:connect 连 arrow(低/YAGNI)、setTool 清 connecting(低/边缘)、resize 多选/arrow(设计限制)、pan 上限(sanitizeView 兜底)。272 引擎 + 427 web + build exit 0。**交互鲁棒性第五轮**(2026-06-24,计划 `docs/plans/2026-06-24-engine-interaction-hardening-5.md`,Explore subagent 扫**渲染/导出层**):矩阵探照灯扩到**导出维度**——实时渲染画对的、SVG 导出错(导出层 `elements-to-svg.ts` 是另一套独立 switch,没人保证与渲染 switch `self-built-render.ts` 对齐;此前矩阵只覆盖交互维度,导出维度是空白格子)。修 2 高 2 中 1 低:① **H1 SVG 导出 bbox 并集不归一化负 bbox**——自由箭头反向画 w/h<0,`unionBounds` 用 `x+w` 算 maxX 算反 → 尺寸为负 → 钳 1×1px,箭头导出崩/被裁(PNG 同路径);修 `boxes.map(normalizeBox)`,与 hitTest/选中框/渲染同源。② **H2 SVG text 忽略 el.color**——text 分支 fill 硬写 `c.textCol`(恒 `--color-black`),实时渲染却用 `colorOf(el.color)`;rect/freedraw/arrow 导出都用了 `colorOf` 唯独 text 漏 → 彩色 text 实时画对、导出变黑;修 `fill=colorOf`。③ **M1 SVG text 不支持多行**——单个 `<text>` 的 `\n` 不换行,render 按 `split('\n')` 逐行行高 18;修逐行 `<text>` + 纯空早退(对齐 render)。④ **M3 SVG rect 负 bbox 渲染空**——SVG 负宽高不渲染,Canvas 2D `ctx.rect` 支持负值(导入 upsert 不经 MIN_SIZE clamp 可造负 rect);修 `normalizeBox` 后正宽高。⑤ **L1 freedraw 单点不可见**——只 `moveTo` 无 `lineTo` → `stroke` 画不出 = 幽灵元素;render+svg 一致画 r=2 圆点(`arc`+`fill` ↔ `<circle>`)。不修(归别处):M2 JSON 导出几何(apps/web scope,单独议)/ M4 自由箭头 DSL 往返(归 DSL P0 缺口)/ L2-L3 text 精确对齐(SVG 无 measureText,接受差异)/ L4 borderPoint 负 bbox(仅导入可造,YAGNI)。280 引擎 + web build exit 0。**DSL 双向对称补全**(2026-06-24,计划 `docs/plans/2026-06-24-dsl-bidirectional-symmetry.md`,9 步 TDD subagent 编排):审计发现**核心卖点"转义"的基石是裂的**——存在**两套序列化器分裂**:`serializeCanvas`(自洽往返:逗号 size、带 `#id`、`@color`)只被测试引用,生产 AI 流程不调用;`formatCanvasSnapshot`(生产实际喂 AI 的)手写格式与 parser 对不上——size 用叉号 `@size(wxh)`(parser 只认逗号)、free shape(rect/text)无 `#id`(parser 要求 id 整行丢)、card color 用 `, color blue`(parser 只认 `@color()`)。更糟:prompt 教的语法(逗号+`#id`+`@color`)与喂 AI 看的现状(叉号+无 id)又不一致 → AI 模仿看到的就写出读不回的 DSL。真实链路 SN→P→A 在 rect/text 上整行读不回,rect/text 还不能 update(`applyFreeOp` 永远 `uid('free')` 丢 op.id),自由箭头(无 from/to)整元素丢失,`inferRelationType` 严格匹配 `grey` → AI 写 `gray` 反推失败。修(9 步各一 commit):① **legacy 清理**(纯减法:删 parser `[free:` 分支 + apply ellipse/note/line + snapshot ellipse/note,DslFreeOp 收敛 rect/text 判别联合);②③④ **自由箭头完整 bbox 往返**(serialize 区分关系/自由箭头输出 `@pos+@size` + SIZE_RE 支持负数 → parse 无 from/to 走自由箭头 op 带 freeArrow/x/y/w/h → apply 自由箭头 create+update 路径,w/h 可负表方向);⑤ **rect/text update-by-id**(applyFreeOp 加 update 路径,对齐 applyArrowOp,保留未提供字段;text create 不再硬编码 100×40);⑥ **统一 formatCanvasSnapshot**(复用 `serializeElement` 唯一文法源——AI 看到的=parser 能读回的三方一致;snapshotCanvas 补回 rect/text/freedraw 丢失的 id/color/w/h);⑦ **grey/gray 归一化**(inferRelationType);⑧ **prompt 修正**(对齐统一文法,说清 card update-only/自由箭头语法);⑨ **端到端往返测试**(`dsl-e2e-roundtrip.test.ts`:serialize→parse→apply→re-serialize 逐字节比对,证明真实链路对 5 个 active kind 双向无损;现有 roundtrip 只到 parse 绕过了丢 id bug)+ **生产链路自由箭头 bbox 修补**(SnapshotArrow 加 x/y/w/h,自由箭头生产链路也完整往返)。card 保持 update-only(内容来自 CardService,AI 不建孤儿卡片);freedraw 保持单向(R2 隐私,点序列不外发)。457 web 测试 + 280 引擎 + build exit 0。**核心卖点"转义"现在对所有 active kind 双向无损**(仅 freedraw 例外=设计),任何 AI 都能廉价驱动画布编辑。
- **JSON 全量备份补画布几何**(2026-06-24,数据可迁移信念4 闭合,spec P9):审计发现 JSON 备份(`export-service.ts`)只读写 4 个 localStorage key(cards/media/drafts/settings),**不含 canvas 列表和 freeform 几何** → 导入新设备画布全丢、卡片变孤儿。这是产品"数据可迁移"承诺的核心载体却裂的。修(2 步):① `ExportPayload` 加 `canvases` + `freeform` 两可选字段(复用 `CanvasFreeformSnapshot`,与 .cystift 同源 `CanvasElement[]`,三路径统一);`buildExportPayload`/`downloadExport` 改 async——读 canvases(localStorage 同步取 .snapshot)+ 遍历 canvas 读 freeform(OPFS 异步)。② `importFromJson` 改 async——写 canvases(纳入现有同步 snapshot+rollback)+ freeform(OPFS 异步,localStorage 写成功后才写,best-effort 不纳入 rollback);ImportResult 加 canvases/freeformCanvases 计数;向后兼容(旧 JSON 无字段→跳过)。round-trip 闭环:导出含画布几何→导入新设备画布完整还原+卡片不孤儿。测试:完整 round-trip 还原 + 孤儿消除(card 带 canvasPosition 指向非 default canvas,往返后仍绑定)+ 向后兼容。464 web 测试 + build exit 0 + tsc 零新增。
- **转义产品化 · DSL 模态编辑器**(2026-06-24,主线 2,核心卖点可见):转义(画布↔文字 DSL 双向)此前只在 AI layout 按钮后跑,用户完全感知不到。现在工具栏加 DSL 按钮 → 模态编辑器(`dsl-dialog.tsx`):textarea 显示当前画布文本(`serializeCanvasReadable`,card 后附 `# title:` 注释),可编辑/粘贴,应用/复制/下载。双向闭环(导出+导入一个模态),**不门控 AI**(所有用户可用,核心卖点而非 AI 附属)。复用现有 parseDsl + applyLayout + serializeCanvasReadable,零新逻辑;应用走 host.batch 单 undo 步。照 export-dialog 结构(Modal+Button+内联 token 化 style+pushToast+i18n)。commit 7020f1c/未push。471 测试 + build exit 0。**转义从"架构能力"变成用户可感知的一等公民功能**——用户能直接看到画布的文字形态、编辑它、应用回去。
- **打磨六主干**(2026-06-24,已落地功能完成度/体验/鲁棒性提升):① **DSL Apply 文本同步**(必修 bug:apply 后不重序列化 textarea,host 同引用 useEffect 不重跑→重复 Apply 对 create 类 op 造副本;修 setText 重序列化)+ **生效计数诚实反馈**(applyLayout 返回 {applied,skipped},toast 改"应用 N 条 M 条跳过",card update-only/箭头端点缺失不再静默);② **DSL 语法速查内嵌**(可折叠 details,5 kind 示例 + card 只更新约束,i18n 双语);③ **Escape 取消选区**(keyHandler 加 Escape,通用画布习惯);④ **多选 resize 一致性**(多选时禁用 resize handle 只允许组移动,避免拖角只缩一个误导;组缩放留后);⑤ **JSON 导入确认门**(选文件先弹 Modal 警告覆盖不可撤销,确认才导入)+ 导入明细加 canvases/freeform 组数。474 web + 285 引擎 + build exit 0。
- Tauri **签名公证**(P9 — 需 Apple 证书,用户提供)
- AI 找重复 / cluster / 时间线(P10)
- UX 打磨:inbox 批量 / Card markdown 双向 / minimap / undo-redo(P12)

## 已知 debt(有意 defer,非 bug)

- **颜色类型双轨制**:`ColorToken`(6 色 Bauhaus)vs `TagColor`(10 个 CSS var)未统一 — 稳定版内不做重构(风险大)。详见 v0.37.0 review D 段。
- **Tauri 未签名**:DMG 可本地构建(36MB,Apple Silicon),分发需签名公证。
- **存储配额估算**:localStorage 用 `Blob().size` 精确计字节;OPFS/IndexedDB 真实配额用 `navigator.storage.estimate()`,但 UI 仍按 5MB fallback 显示(未接 estimate)。

## 约束(不可遗忘,详见根 `CLAUDE.md`)

- spec `docs/specs/2026-06-19-cys-stift-design.md` 冻结,不改
- 技术栈不重选(Next.js / 自研 Canvas 2D / SQLite / Drizzle)
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
