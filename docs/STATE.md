# STATE — cy's Stift 当前状态(单一可信源)

> **这份文件是唯一的"当前状态"档。** 其它文档(CLAUDE.md / changelog / decisions)只引用它,不复制状态。
> 新会话 / `/clear` 后 / 新模型 — 先读本档。
> 版本表由 `scripts/gen-state.mjs` 从 `git tag` 生成,不会漂移。最后更新:v0.56.0。

> **方向迷茫时**:先读 [`docs/product-and-engine.md`](product-and-engine.md) —— 产品与引擎的定位锚点 + 优先级框架。判断"这一步是否推进核心承诺",而非"还有没有缝可修"。

## 产品一句话

**cy's Stift** — 本地优先的灵感画布,包豪斯风格 UI。你的灵感,在画布上生长。
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
| v0.37.0 | 全量加固(第二个稳定版):真 bug 修复 + tsc 门禁 + 文档重构 | v0.37.0 |
| **v0.38.0** | **知识网络(graph/块引用/全局关系/详情建关系/命令面板/标签墙/⌘C)+ 白板专业度(对齐分布/模板/AI工作流)+ 打磨批(自动布局/焦点模式/模板导入/最近编辑跳转/跨画布backlinks/frame双击重命名/vision实验室骨架)** | v0.38.0 |
| **v0.39.0** | **自审修复(minimap 拖拽 clamp / B1 孤儿卡卡死 / 模板空 DSL 误导)+ 版本号对齐 + 文档同步** | v0.39.0 |
| **v0.39.1** | **Windows 适配:字体分层(--font-content)+ JetBrains Mono 自托管 + color-scheme + native 控件(checkbox/select/number/滚动条)Bauhaus 全量自绘 + 快捷键按平台显示** | v0.39.1 |
| **v0.40.0** | **智能关系推荐(本地+AI)+ DeepSeek 思考模式适配(structuredOutput)+ AI 对话 agent /ask(Claude Code 式 DSL 提议+确认门)+ AI 实验室分层基础设施(LAB_REGISTRY+useLabEnabled+LabToggle)** | v0.40.0 |
| **v0.44.0** | **第二轮手测反馈批:卡片标题可读性(遮挡避让+timeline 2-line clamp)+ /ask 对话 reload 持久(封顶100+清空键)+ AgentConfirmCard 缩略图补关系箭头 + 图谱复位 fit-to-nodes(computeFitView)+ AI provider 多 profile + active 选择(Phase 1:profiles[]/activeProfileId/v1→v2 migration/store CRUD/面板重写)** | v0.44.0 |
| **v0.45.0** | **DSL 语法单一源 + 版本号:新建 `dsl-grammar.ts`(`DSL_VERSION=1`/`DSL_KINDS`/`DSL_COLORS`/`DSL_GRAMMAR_REFERENCE`),5 处 prompt/help 收口 import(不再各抄一份),serializer 搬 KINDS,sync 锁测试防漂移,样本记 `dslVersion`;顺带修 agent/layout prompt 漏 `white` 颜色漂移;为 (c2) prompt 加固铺路(改 REFERENCE 一处即联动)** | v0.45.0 |
| **v0.46.0** | **统一 AI 对话(/ask 全屏 + companion 打通):新建 `conversation-store.ts`(per-canvas,canvasId 为 key)+ companion 发 history(修"AI 说没上下文")+ /ask ➕新建画布(新建即出生)+ 空画布兜底清(三真空才硬删)+ 旧 companion/ask history lazy 迁移;subagent-driven 6 task,T3 响应/T5 数据安全 opus review;web 1129 测试** | v0.46.0 |
| **v0.47.0** | **手绘(freedraw)规范化转化 v1:store-time **保角 RDP** 点简化(插 `commitFreedraw`,首尾+折角锚定)+ **Catmull-Rom 贝塞尔平滑**(render/SVG 同源 `smoothBezierSegments`,五视图一致,minimap 保留折线)+ `freedrawPointsOf` 唯一 sanctioned reader(R2 加固,收敛 6 处裸 `meta.points` 直读)+ **转矩形**(`freedrawToRect`,chooser 扩 [转箭头/矩形/保持],沿 `host.batch` 单 undo 模式);triangle/circle defer(引擎无 active ellipse/triangle kind,加 kind 是五视图连锁,守 YAGNI);OCR 远期。canvas-engine 509 + web 1132 测试** | v0.47.0 |
| **v0.48.0** | **响应式布局(画板适配第一阶段,代码层):断点统一 768/1024 + viewport meta(不禁 pinch 保 WCAG)+ body overflow-x + AppMenu <1024 汉堡抽屉(useMatchMedia/useSyncExternalStore)+ companion <1024 覆盖+backdrop + canvas toolbar 断点归一;桌面(≥1024)零回归。触摸(v0.49)/安卓链后续。web 1138 测试** | v0.48.0 |
| **v0.49.0** | **触摸手势(画板适配第二阶段,代码层):SelfBuiltAdapter 多指跟踪(activePointers Map)+ 双指 pinch zoom(中点锚,复用 onWheel 数学)+ 双指中点 pan + 单指-双指切换(startPinch 调 clearInteractionState)+ touch-action:none 核查(主画布/graph/辅助 canvas 均已有)+ 触摸目标 44px(平板态 inbox/archive tile 角标);单指元素/双指画布(Figma/Procreate 范式);桌面+鼠标零回归。canvas-engine 511 + web 1138 测试** | v0.49.0 |
| **v0.49.1** | **触摸手势 patch:pinch 第二指 `setPointerCapture`(v0.49 headline 真 bug — 第二指漂出 canvas 收不到 move → pinch 坏)+ canvas 断点 off-by-one 归一(960/900→1023/767)+ 纯 pan/抬指退 pinch 2 测 + layout 注释。canvas-engine 513 + web 1138** | v0.49.1 |
| **v0.50.0** | **安卓运行时适配 + 全平台打包:platform.ts 加 isMobile/isDesktop(userAgent,SSR 安全);设置页全局快捷键配置段 + 首页 ⌘/^ 捕获提示块移动端隐藏(安卓无系统全局热键;capture 仍可用经 AppMenu/inbox);capture-host __TAURI__ catch(invoke 安卓 no-op 不崩)。macOS .app/.dmg + Android .apk(arm64)打包;Windows 走 CI。web 1138 test 零回归。** | v0.50.0 |
| **v0.51.0** | **工作台三件套:富 Markdown 编辑器(toolbar+split preview+remark-gfm+rehype-highlight Bauhaus 主题)+ 标签管理(多选+二级管理页 /tags)+ 库页 D4(/workbench:默认画布/自定义 tag/堆叠分区)+ DSL guard;lucide 图标 hub。** | v0.51.0 |
| **v0.52.0** | **内容版本/开发存档:archive-store(OPFS two-tier index+payload)+ release/风险 op/手动 触发 + /dev/archive 查档+导出 JSON + 分层 retention(b cap 100,a/c 永久)** | v0.52.0 |
| **v0.53.0** | **wikilink 显式化 5 项:@wikilink DSL 标记(DSL_VERSION 1→2)+ 双链重命名追踪 + 跨画布双链(meta.crossCanvas + portal)+ 模糊匹配(Levenshtein≤2)+ load 批量同步;syncWikiLinkArrows dedup(T2 race 自愈)** | v0.53.0 |
| **v0.53.1** | **安卓运行时验证修复(首次 emulator 跑暴露 v0.50.0 的运行时隐患):rustls ring provider 修 reqwest 启动 panic(致命闪退)+ 首页平台检测 hydration + 平台检测 SSR-safe hooks 全仓收口(useIsMac/useIsMobile/useIsDesktop,render 直读改 hook)+ CaptureHint/inbox 空状态 ⌘ 提示移动端隐藏;沉淀安卓开发工作流(Studio 仅 AVD/Logcat,构建走终端,阿里云镜像)。web 1330 测试** | v0.53.1 |
| **v0.54.0** | **工作台专注编辑态:「展开工作台」后深度编辑加二档,dock 头部 ⤢ 触发,编辑器撑满 + 画布缩成可拖拽 / 可收起(剩角)的浮 `MinimapPreview`(独立组件,复用 minimap 投影纯函数 + drawElementMark);`.cv-host` 隐不卸载保 view 态 + chrome(Toolbar/SideRail/Outline/Companion/原 Minimap)隐;workbench-store +focusEdit(会话态,不持久);与 ⌘. 画布焦点模式互斥(双向)。老 minimap 收起条状 spec §7 记不连带改。web 1352 测试。** | v0.54.0 |
| **v0.55.0** | **Markdown 数学公式 + 脚注(katex):`$inline$` / `$$display$$` 经 remark-math + rehype-katex;katex CSS **本地 bundle**(不走 CDN,56 woff2 字体落 media);脚注走 **remark-gfm 内置**(`remark-footnotes` v5 已废弃空 stub);sanitize 放行 `math` class + katex 后跑绕过(无需 mathml 枚举),script 仍剥。单一渲染器 MarkdownBody,工作台编辑器预览联动。顺带:workbench focus-mode 互斥抽 `nextFocusStates` 纯函数 + 6 测(v0.54.0 final review 的 Important defer 闭合)。web 1362 测试** | v0.55.0 |
| **v0.56.0** | **打包分发版:UI 打磨批(暗色代码块反相 HIGH 修复 + i18n 漏键 + focus-visible 一致性 + 触摸目标 + token 漂移,Explore 审计 10 瑕疵)+ c1 DSL 重试闭环核对闭合(三路径自动重试 + c2 失败采集,user+messages 同传澄清非 bug)+ 类型逃逸修复(file-drop-handler latent bug + canvasId 占位)+ 文档对齐一轮(STATE 瘦身/user-README 工具栏修正/architecture tldraw→自研)+ deepresearch 赛道缺口报告(推翻 AI-native 无竞品,转义 DSL=护城河)。lint 0/test 1362/build 0** | v0.56.0 |

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
| v0.37.0 | docs(README): license section TBD → GPL-3.0-or-later | v0.37.0 |
| v0.38.0 | fix(canvas): B1 跳转孤儿卡卡死 + 模板空 DSL 误导反馈 + 首页版本号 v0.38 | v0.38.0 |
| v0.39.0 | chore: bump 版本 0.38.0 → 0.39.0(自审修复 + 文档同步) | v0.39.0 |
| v0.39.1 | chore: bump 版本 0.39.0 → 0.39.1(Windows 适配:字体分层+native 控件 Bauh… | v0.39.1 |
| v0.45.0 | chore(release): v0.45.0 — DSL 语法单一源 + 版本号 | v0.45.0 |
| v0.46.0 | chore: v0.46.0 wrap-up — STATE/changelog + version bump (0.45… | v0.46.0 |
| v0.47.0 | docs+chore: freedraw v1 wrap-up — STATE/changelog v0.47.0 + v… | v0.47.0 |
| v0.48.0 | release: v0.48.0 responsive layout (tablet) | v0.48.0 |
| v0.49.0 | release: v0.49.0 touch gestures (tablet) | v0.49.0 |
| v0.49.1 | release: v0.49.1 touch gestures patch (pinch pointer capture) | v0.49.1 |
| v0.50.0 | release: v0.50.0 安卓运行时适配 + 全平台打包 | v0.50.0 |
| v0.51.0 | chore: bump v0.51.0（工作台三件套：编辑器+标签管理+库页 D4） | v0.51.0 |
| v0.52.0 | release: v0.52.0 内容版本/开发存档(archive-versioning) | v0.52.0 |
| v0.53.0 | release: v0.53.0 wikilink 显式化(@wikilink + 跨画布 + 模糊 + 重命名 + lo… | v0.53.0 |
| v0.53.1 | release: v0.53.1 安卓运行时验证修复(rustls panic + hydration + 平台检测 SS… | v0.53.1 |
| v0.54.0 | release: v0.54.0 工作台专注编辑态(二档切换+MinimapPreview 独立组件+chrome 联动+… | v0.54.0 |
| v0.55.0 | release: v0.55.0 Markdown 数学公式 + 脚注(katex) | v0.55.0 |
| v0.56.0 | release: v0.56.0 polish-batch（UI 打磨 + c1 闭合 + 类型逃逸 + 文档对齐） | v0.56.0 |
<!-- gen-state:end -->

## 当前能力(用户视角)

- **捕获**:全局快捷键 + Mini Input + 文件拖拽 + `.cystift` 文件拖回恢复
- **inbox**:多媒介编辑(链接/代码/引用/媒体)+ 草稿自动保存 + 发送到画布
- **canvas**:自研 Canvas 2D 自由画布(6 active kind:card/arrow/freedraw/text/rect/frame)+ 多画布 CRUD + 视图持久化 + 关系箭头(straight/curve/elbow + 手绘识别)+ 工具栏(选择/笔/橡皮/文本/连接)+ AI 排版(配 AI 才显,未配走引导卡)+ 导出(图片 SVG/PNG + Markdown + DSL 二级菜单)+ Outline/Minimap/全局缩略图三态 + 双链 [[]] 自动建箭头 + DSL 模态编辑器(转义)+ **对齐分布 9 操作**(选中 ≥2)+ **画布模板**(4 预设 + 自建/导入)+ **AI 工作流模板**(聚类/关系/大纲)+ **整理范式**(策略:思维导图/流程图/网格/紧凑 × 方向 TB/LR/RL/BT × 间距,默认 mindmap/TB)+ **焦点模式**(⌘. 隐 chrome)+ **frame 双击重命名** + minimap 可拖拽 + **关系箭头高倍放大不再消失**(端点解析脱离视锥剔除)+ **手绘规范化 v1**(store-time 保角 RDP 简化 + 贝塞尔平滑 render/SVG 同源 + 转 arrow/rect chooser)
- **工作台**(per-card 深度编辑):`/workbench` 库页(标签管理 + 堆叠分区)+ canvas **D2 dock 编辑器**(富 Markdown 编辑 + 预览联动)+ **专注编辑态**(v0.54 ⤢ 二档:编辑器撑满 + 画布缩成可拖拽/可收起的浮 `MinimapPreview`,与 ⌘. 焦点模式互斥)
- **Markdown 渲染**(卡片 body,跨 inbox/canvas/workbench):GFM(表格/任务列表/删除线/自动链接)+ 代码高亮(Bauhaus 主题)+ **数学公式**(v0.55 katex `$inline$`/`$$display$$`,CSS 本地 bundle 不走 CDN)+ **脚注**(`[^1]`,remark-gfm 内置,不引入废弃的 remark-footnotes)+ 块引用 `((标题))` 嵌入(环检测 + missing 标记)
- **graph**:全局图谱 `/graph` —— 语义三维签名力导向图(d3-force),跨画布消费已物化的双链/关系 arrow + **缩放条**(−/slider/+/reset)+ 触摸板 pinch=缩放/双指=平移(不再误缩放)+ 删卡不灰屏 + 卡详情 action 行 sticky 常驻 + **加关系实时刷新**(freeform store 订阅通道)
- **archive**:网格/时间轴 + 多选批量 + 详情 Modal
- **trash**:软删恢复
- **search**:全文检索(title 1.5x 权重 + body 摘要 + pinned 前置)
- **命令面板**:⌘K 跳转项 + 卡片搜索 + **最近编辑跳转**(空 query 显 updatedAt 前 8,点卡智能开卡:在画布跳画布定位+开详情,否则开详情)
- **标签**:10 色固定调色板,卡片标签 + 过滤 + **标签墙 `/tags`**(标签云 + 卡网格)
- **关系网络**:块引用 `((标题))` 嵌入(embeds 关系)+ 详情建/删关系(relation-picker)+ 跨画布 backlinks(useGlobalEdges 聚合所有画布)+ **智能关系推荐**(graph 详情页「建议关联」,本地零 AI 四信号打分 + 可选「AI 再找找」语义粗筛,一键即建)+ **AI 对话 agent**(`/ask` 页:对话提需求 → AI 输出 cys-dsl 块 → 确认门 before/after 缩略图 + 变更摘要 → 应用/拒绝;RAG 引用卡片;改任意目标画布)+ **v0.46 对话打通**(/ask 全屏 + companion 共享 per-canvas 对话 store;全屏可切所有画布 + ➕新建画布「新建即出生」)+ **wikilink `[[标题]]` 自动建 references 箭头**(已增强:**跨画布** title→id 全局索引,同画布优先 + 跨画布 fallback;**模糊匹配** Levenshtein≤2 容忍拼写/简写;**重命名追踪** 改标题自动 re-sync 引用旧/新标题的卡;**load 批量同步** hydrate 完跑一次 `syncAllWikiLinks`;**DSL `@wikilink` round-trip** arrow 序列化→parse→apply 不丢 meta.wikilink;跨画布 arrow 在 source 画布画到 portal 点(目标卡右外侧 + 「→ 目标标题 (画布X)」标签))
- **AI 伴侣面板**:画布常驻 AI 浮面板(rail ✨ 开关,发现/对话两 tab,折叠+tab 持久)—— 发现 tab 本地预筛零成本常驻(重复/可关联/孤立卡)+ 选中定位/建立关联/AI 深挖三动作;对话 tab = /ask agent 上画布(live host 应用 + 确认门 + 引用点开)+ **历史持久化 + v0.46 现发给 AI**(不再"没上下文";与 /ask 共享同一段 per-canvas 对话)+ 缩略图窄面板横向滚不溢出,非破坏性默认开
- **AI 排版**:诚实反馈(apply 前后位移对比 → "重排 N 张平均 Xpx" / "AI 认为已合理未改动")+ 主动重排 prompt + 拓宽思考抑制(deepseek 镜像/model 名)+ 60s 超时
- **版本号**:单一可信源(`scripts/gen-version.mjs` 读 root package.json → version.ts + 同步 tauri.conf),主菜单 + 首页实时显示
- **开发存档**(dev 工具,非用户向):release/风险 op/手动 checkpoint 落 OPFS 全量快照(版号区分,mediaAssets 剥 dataUrl),`/dev/archive` 列表+浏览+导出 JSON 外部 diff(查错误)+ release 自修自查;分层 retention(风险 op cap 100 FIFO,release/手动永久)
- **settings**:快捷键自定义 + 导入/导出 + 暗色主题 + AI provider 配置 + **实验室区**(vision/autoCurate/autoTag/autoCapture/agentToolCalling 五个实验室,默认关,LAB_REGISTRY 注册表 + useLabEnabled 守卫 + 确认门;分层判据见 ai-labs-strategy spec)

## 下一步

> **当前阶段:打磨期(2026-06-26 起)** — 主线 + P10 + UI/a11y/鲁棒三轮 + AI 门槛/记录栏/canvas-UI 自适应 + 画板适配(响应式/触摸/安卓链)+ product-idea(工作台/Markdown)全闭合。
> 判断"这一步该不该做"先读 **[`docs/development/polish-phase.md`](development/polish-phase.md)**(打磨 vs 修缝判据 + 反馈驱动流程 + 退出标准)。
> 燃料 = 你手测的真实反馈。每轮主线开工走 brainstorming,严守「一次一问 + 逐段确认」(skill-checklist-discipline 记忆)。

### 当前焦点(2026-07-05,v0.55.0)

product-idea 大方向四块**对账**(均有结论,#1 搁置 / #2-4 done):

- **#1 大卡/角色卡** — 用户搁置。
- **#2 DSL 规则版本号** — v0.45 落地(`DSL_VERSION=2`;改指令种类/属性/颜色才 bump,prompt 自动跟 `DSL_GRAMMAR_REFERENCE`)。
- **#3 工作台** — v0.51 库页 + D2 dock 编辑器 + 标签管理;v0.54 专注编辑态(⤢ 二档 + 浮 `MinimapPreview`)。
- **#4 Markdown 升级** — v0.38 GFM + 高亮 + embed;v0.55 katex 数学 + 脚注。

⚠️ **v0.54/v0.55 未手测**(仅代码测):工作台 ⤢ 拖拽/收起/预览 + katex `$x^2$` + 脚注 `[^1]` 渲染,顺手测一轮。

### 短期 backlog

1. **AI 可用性集群** — 部分落地:(a) 对话记忆 ✅ v0.46 / (e) /ask 入口 ✅ v0.46。暂停项(用户暂不测 AI):(b) 指令遵循 / (c) DSL 校验器 / (d) 预览可视性 / (f) provider UX。
2. **(c2) prompt 加固** — v0.45 单一源后改 `DSL_GRAMMAR_REFERENCE` 一处即联动 5 个 prompt。失败样本采集已落地(`5c4a4a5`,retry 耗尽记 `parse_failed` 进 sample-store,设置页可导出),攒一批失败案例再针对性改 prompt。**RAG few-shot 不做**(用户心理阴影,`rag-deferred-user-averse` 记忆)。
3. **LOW backlog triage**(`ux-audit-backlog` 记忆)— 性能 / a11y / 边缘 / 视觉,HIGH 已清零,按价值挑批。
4. **(f) P2 能力维度** — per-profile vision/labs/思考模式开关;deferred 到 profile 体系稳定后。

### 中期

> 画板适配(响应式 v0.48 + 触摸 v0.49 + 安卓 v0.50 + 运行时修复 v0.53.1)**已落地**,下接安卓实机收尾。

- **安卓实机收尾** — 构建链 + 运行时已通(emulator 验证):release 签名 keystore / WebView Canvas 性能 + OPFS 版本差异调优 / 实机测试。iPad/iOS 不做(用户定)。

### 远期

- **画布引擎独立化**(北极星)— canvas-engine 可剥离成独立包/项目(`canvas-engine-extractable` 记忆);待真实使用验证后再推 npm/demo 站。
- **手写文字识别(OCR)** — PaddleOCR/ONNX defer 待条件成熟(浏览器可跑的轻量 OCR + 手写准确率达标;`freedraw-v1-normalization` 记忆的 spike 校正)。v1 freedraw 不含文字。
- **训练大模型适配** — fine-tune for DSL 生成 + 指令遵循。依赖真实 DSL 交互数据(样本导出已落地 v0.44);先 prompt+重试跑到天花板 + 语料攒够再定文本微调 vs vision 任务专用模型。
- **电子书 pad**(最远)— 文石 Boox 等安卓电子书走安卓路径直接装 APK;E-Ink 残影要全屏刷新策略 + 砍 animation,单独一类适配。依赖安卓先落地。

### 历史日志

历史进度见 [`changelog.md`](changelog.md)(newest-first)。各版本里程碑见上方版本表。

## 已知 debt(有意 defer,非 bug)

- **颜色类型双轨制**:`ColorToken`(6 色 Bauhaus)vs `TagColor`(10 个 CSS var)未统一 — 稳定版内不做重构(风险大)。详见 v0.37.0 review D 段。
- **Tauri 未签名**:DMG 可本地构建(36MB,Apple Silicon),分发需签名公证。
- **B3b frame 拖框创建**:触及引擎 tool union 类型 + 全 pointer 链,L 级;现有「框住选中」按钮 + DSL/Outline 两条建 frame 路够用。
- **Batch C 智能关系推荐(已落地)**:`relation-recommend.ts` 本地启发式四信号 + `relation-recommend-ai.ts` 可选 AI 语义粗筛,均在 graph 详情页接入。**剩余**:inbox/timeline 详情页只读看推荐(目前仅 graph 页可建关系)。
- **AI agent /ask 二期**:画布侧边栏版(画布内对话,上下文=当前画布);tool-calling 主动检索(目前 RAG 预注入被动);对话持久化(reload 清空);历史摘要(超阈值直接丢老消息)。
- **vision 三能力实装**:看图描述/OCR、画布视觉理解、图转 DSL —— 实验室骨架已就位(labs-registry 注册表 + useLabEnabled 守卫),实装 defer(用户判非必要,等真实需求)。
- **新实验室实装(基础设施已就位)**:autoCurate(自动整理)/autoTag(自动打标签)/autoCapture(自动建卡)/agentToolCalling(/ask 主动检索)——labs 类型 + LAB_REGISTRY + LabToggle 已落地,功能实装按 spec 顺序 autoCurate→autoTag→toolCalling→autoCapture。
- **图层 / 卡片版本 / 引擎 npm 化**:打磨计划书方向 8-10,L 级 defer。

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
