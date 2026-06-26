# 变更日志

> 每完成一个 Phase 追加一段(newest-first,新条目加在本文件顶部)。格式:`## YYYY-MM-DD · <version> · <slug>`。
> 当前状态/版本见 [`STATE.md`](STATE.md)。

---

## 2026-06-26 · normalization · 准则规范化(文档对齐现实 + 修两个失效命令)

用户「先做规范化开发,准则全部读一下,或许要更新」。读完 6 个 CLAUDE.md + development/ 全部规范后,核实 ground truth(package.json/Cargo.toml/实跑命令),发现准则整体框架好,但**几处和现状脱节,两条会咬人**:

### 🔴 真 bug:文档写的命令跑不起来
- **`pnpm --filter web test` 不存在**(web package.json 缺 test 脚本)→ 加 `"test": "vitest run"`,和 domain/db/canvas-engine 对齐。顺带让根 `pnpm -r test` 纳入 web(此前只跑 3 个包,漏 web 655 测试)。实跑 655 绿。
- **`pnpm --filter web lint` 是 `next lint`**(从未配 ESLint → 非交互下交互 prompt 直接挂)→ 改 `tsc --noEmit`,和全部 sibling 包对齐。现有 25 个 `__tests__/` branded-id/color-token fixture 基线(polish-phase §B 已记的已知噪音),判据=零新增,非零错误。`pnpm -r lint` 现在 5 包一致跑 tsc、可预测、可脚本化(此前 web 交互卡死)。

### 🔴 隐私矛盾修正(`docs/development/privacy-design.md`)
§画布快照 + §手绘写"手绘内容可给 AI 看…编码成坐标点序列发给 AI"——**直接违反 R2 最终决策**(STATE 2026-06-24:freedraw 点序列永不外发)。文档比实际更宽松,照此做 AI 改动可能泄漏点序列。三处改正:① CanvasSnapshot 接口的 `draw; points` + tldraw 判定 → 现实的 host.getElements()/CanvasElement + 本地 $1 recognizer shape 描述符;② §手绘"点序列可发"→ R2 硬边界(只发 shape 标签 + confidence + 4 标量 features,点序列绝不外发,有反向断言);③ §DSL 输出删已废止的 `[free: ...]`/`@cluster` 语法 + 注明 card update-only / freedraw 单向约束。

### 🟡 过时引用修正
- **`docs/development/dependencies.md`** 整份重写:删已移除的 `@tldraw/tldraw 3.15.6`、删"web 无 vitest"(实际 655 测试)、补 `packages/canvas-engine`(整个包缺失)、补 `tauri-plugin-global-shortcut`/`markitdownllm`/`pdfjs-dist`、test 数改"见 pnpm -r test 实际输出"(不硬编码怕漂移)、补 canvas-engine test/lint 命令 + web 25-error 基线说明。指向 package.json 作真相源。
- **`apps/web/CLAUDE.md`** 结构树(dev/db、dev/min)→ 真实路由(archive/canvas/inbox/search/timeline/trash/settings + features/feature-sliced + lib/stores);AI checklist 的 `snapshotCanvas(editor)`/"不遍历 tldraw shape" → `serializeCanvas(host.getElements())`。

### 🟢 历史档加 banner(防误读)
roadmap.md(Phase 7-9 已完成,指向 STATE)、reference.md + reference-patterns.md(画布栈 tldraw→自研,模式仍可参考)。

验证:web test 655 绿;web build exit 0;`pnpm -r lint` 5 包一致(domain/db/ui/canvas-engine 干净,web 25 fixture 基线)。

**教训(记入记忆)**:tldraw 移除 + 引擎独立化是大变更,但过程文档没同步,导致 4 份规范 + 2 个 package.json 脚本漂移。大迁移后该有一轮"准则对齐现实"。硬编码版本/test 数的文档最易漂移——改指向真相源(package.json/命令输出)。

**续 · Definition of Done 固化(同轮)**:把"改完代码 → 能 commit"的标准门固化成 [`docs/development/definition-of-done.md`](development/definition-of-done.md) —— ① 验证门(改了哪个包跑哪个包的 test+lint;web ~25-error `__tests__/` fixture 基线,判据**零新增**非零错误;web build 是产品门必须 exit 0;不假装通过);② 提交纪律(一个逻辑一个 commit、`git -c user.name=cy -c user.email=cy@stift.local` 无 footer、SSH push、conventional 前缀、过程文档 gitignored);③ 文档收尾触发清单(加 Card 字段→ai-context+privacy;加依赖→ADR+dependencies.md 指向 package.json;加 CanvasElement kind→五视图对齐;加 i18n→zh+en);④ subagent 编排。根 CLAUDE.md 同步修测试栈(vitest 现 4 包)+ 验证命令(补 `pnpm -r test`/`lint`)+ 关键文件表(挂 DoD/dependencies 指针);polish-phase §六 指向 DoD 作权威门,避免两边漂移。

---

## 2026-06-26 · feature-phase-2 · Markdown 导出 + 双链 [[]](subagent,非 AI)

用户反馈「不要基于 AI 的功能」后,选两个非 AI、围绕核心卖点的功能,各 subagent TDD 实现:

- **F5 画布→Markdown 导出**(commit 8a5987c,数据可迁移信念4):`canvasToMarkdown` 纯函数——按 frame 主题分区(几何包含,与渲染层同源)+ 散卡顶层 + 每张卡 ### title + meta + body + 相关关系列表。转义 MD 特殊字符防注入。CanvasSideRail「导出 Markdown」按钮 + Blob 下载 .md try/catch。开放格式,拿走发博客/存 Obsidian。12 测试绿。
- **F7 双链 [[]] 自动建箭头**(commit 8a5987c,关系网深化):`extractWikiLinks` + `syncWikiLinkArrows` 纯函数——解析 body `[[标题]]` 精确匹配(大小写不敏感),diff 同步建/删 references arrow(标 meta.wikilink=true)。**手动 references arrow 绝不被删**。Obsidian/wiki 风格,让语义关系从「手画」变「写出来就成」。CardDetailModal onSave 触发。23 测试绿。

**不修(v1 边界,记 STATE):** 标题重命名追踪、跨画布双链、模糊匹配、初次 load 批量同步、DSL wikilink 显式标记、inbox 编辑触发。

验证:canvas-engine 372 + canvas feature 177(含 markdown 12 + wiki 23)全绿;web build exit 0;tsc 零非测试错误;render-sweep 4 路由 0 error。

---

## 2026-06-26 · feature-phase-1 · 功能期批 1-4:Backlink + Frame + 全局缩略图 + 智能 elbow

用户反馈"软件可以做到 50mb 至少,还有好多东西可以加"——升级进功能期。基于灵感库(`docs/decisions/2026-06-26-peer-inspiration.md`)+ 产品定位筛选,全做 4 个围绕核心卖点(转义/语义关系/本地优先画布)的功能,按成本/价值分批:

- **批 1 Backlink 相关的卡**(commit b1e535d):关系网可消费侧。关系箭头此前只能画不能查,Backlink 让语义关系从单向绘制变双向可查,放大关系箭头价值。`findBacklinks` 纯函数(遍历 host arrows 找 from/to 命中,分 incoming/outgoing,复用 inferRelationType)+ CardDetailModal 加 host/getCardTitle/onJumpToCard prop 渲染 Backlink 段(画布版,host=null 不显)。点击跳转选中对方卡 + 居中。
- **批 2 Frame 主题分区**(commit 4b4667e):新 CanvasElement kind='frame' 全链路。把「一群卡的分组」变可见可命名容器,契合语义关系身份。引擎(KIND_LAYER frame=-1 最底层 + 渲染半透明填充+虚线边框+标题 + SVG)+ DSL(`[frame #id] @pos @size @text @color`,serialize/parse/apply 全通,e2e round-trip 测试)+ 交互(CanvasSideRail「框住选中为分区」按钮,选中 1+ 卡算 bbox+padding 创建,不门控 AI)+ Outline 标签。几何包含语义(不存 children,bbox 在 frame 内即属)。
- **批 3 画布全局缩略图视图**(commit c90d4d8):空间鸟瞰第三态,互补 Minimap(角落局部)与 Outline(文字结构)。`CanvasOverviewModal` 大尺寸 640×440 canvas,复用 minimap 纯函数(computeMinimapProjection/viewportRect/minimapClickToPage)+ drawElementMark(导出复用),点击居中视口。
- **批 4 智能 elbow 路由避让**(commit 16519af,TDD subagent):折线箭头自动绕开卡片不压线(drawio 功能)。新增 segmentIntersectsBox(Liang-Barsky)+ routeElbowAroundObstacles(启发式 L 形+阶梯偏移,非 A*,YAGNI)+ cardObstacles + autoElbowPath。route='elbow' 且 elbow 空时自动绕障;手设 elbow 非空尊重用户。渲染/hitTest/SVG 三视图接线。18 新测试 TDD 红→绿。

**可拓展点(本轮记入 STATE):** Frame 画布上双击重命名(现走 DSL/Outline)+ frame 工具栏拖框创建(现走「框住选中」按钮 + DSL);Backlink 跨画布查询(现仅当前画布);全局缩略图可滚动/缩放(现固定 fit);智能 elbow 真 A* 路由(多 obstacle 死锁)+ >2 折点 + 自动路径箭头头方向。

验证:canvas-engine 372(原 354 + 新 18)+ ai 192 全绿;web build exit 0;tsc 零新增;cargo check 通过;render-sweep + canvas 交互探针 0 error。

---

## 2026-06-26 · polish-bugfix-4 · 坏输入防御轮:XSS + 崩溃 + 数据损坏 6 真 bug

坏输入防御轮:Explore 审恶意/损坏输入健壮性(区别于 polish-bugfix-2 的"数据往返一致性"看路径间丢失,这轮专看**输入侧**崩溃/注入/损坏)。核实后修 6 个真 bug,根因都是**两导入路径校验不对称**(JSON 全量导入严,`.cystift`/freeform 不校验)+ **已修漏洞在平行代码路径遗漏**。

**注入:**
- **#1 card-detail-modal 链接 href 未过 safeHref**(`card-detail-modal.tsx`):`card-detail.tsx` 用了 `safeHref`(`safe-href.ts` 注释明说修复过 card-detail 的 XSS),但画布版 `card-detail-modal` 是独立文件从未接入 → 导入含 `javascript:` 链接的卡片,画布双击打开点链接执行 JS。修:接入 `safeHref`。

**崩溃:**
- **#2 importFromJson freeform 无校验**(`export-service.ts`):`snap=null` 时 `snap.elements` 抛 TypeError → 异步 unhandled rejection(localStorage 已写但 freeform 静默全丢 = 半损坏)。修:`snap` 非对象/`elements` 非数组 → `continue` 计入 `freeformSkipped`。
- **#3 `.cystift` elements 无 null 校验**(`cystift-payload.ts`):元素是 null/数字 → `el.kind` 抛 → catch 回退当普通附件建卡(数据混淆)。修:循环开头 `!el||typeof!=='object'` continue。
- **#9 `.cystift` card 字段透传不校验**(`cystift-payload.ts`):`title=42`/`links="x"` 进 DB → 后续 `links.map`/`title.trim` 崩到错误边界。修:逐字段类型守卫,坏字段用默认值替代(best-effort 恢复,不跳整张卡)。

**数据损坏:**
- **#5 createdAt/updatedAt 无有效日期校验**(`export-service.ts`):只校验类型不校验可解析 → `"garbage"` → Invalid Date → rehydrate 签名 `"N:NaN"` 跨 tab 同步断裂 + sort 比较器 NaN 行为未定义。修:复用 capturedAt 的 `isNaN(getTime())` 校验。
- **#6 canvas-freeform-store parseSnapshot 无逐元素校验**(`canvas-freeform-store.ts`):坏元素(缺 kind/id)进 host → 几何/渲染函数假设字段类型正确而崩。修:filter 非对象/缺 kind/缺 id。

**不修(YELLOW):** #7 MarkdownBody `{...rest}` 覆盖 safeHref(误报——`({href,...rest})` 解构后 rest 已排除 href)/ #4 大文件 DoS + #8 DSL 超长 DoS(需刻意构造,记入可拓展点)。

**可拓展点(记入 STATE):** ① `restoreFromFile` 复用 `MAX_FILE_BYTES` 上限(FileCaptureSink 有,`.cystift` 恢复路径无);② DSL `@text`/`@label` 值加长度上限(AI 返回不可信)。

验证:canvas-engine 354 + db 7 + domain 68 全绿;web build exit 0;tsc 零新增;render-sweep 9 路由 0 error。commit 23c6172。

---

## 2026-06-26 · polish-bugfix-3 · 周围检查:Tauri 桌面壳 + 性能/资源泄漏 4 真 bug

打磨期"周围检查"轮,扫此前从未系统审过的两个维度:两 Explore 并行审 Tauri 桌面壳 + 性能/资源泄漏,核实后修 4 个真 bug(GREEN),7 条 YELLOW 不修。

**Tauri 桌面壳(首次系统扫):**
- **BUG 1 全局快捷键写死不跟随用户配置**(`lib.rs` + `capture-host.tsx`):Rust 注册 `CmdOrCtrl+Shift+Space` 写死,web `settings.updateCaptureShortcut` 允许改但桌面壳不联动 → 改快捷键后窗口失焦时全局热键失效(功能断裂,非边缘)。修:Rust 加 `update_shortcut` 命令(注销旧/注册新/失败回退保命 + emit 错误),`CURRENT_SHORTCUT: Mutex<Option<String>>` 记当前注册键;前端 `captureShortcutToAccelerator`(modKey→CmdOrCtrl、shift→Shift、code 归一化 KeyC→C/Digit1→1)+ sc 变化 effect invoke。注册成功后写入 CURRENT_SHORTCUT。
- **BUG 2 注册失败静默**(`lib.rs` + `capture-host.tsx`):此前 plugin load/register 失败仅 `eprintln`,桌面用户看不到 stderr,快捷键被别的应用占用时静默失效。修:三处失败均 `emit("global-shortcut-error", ...)`,前端监听 → toast「全局快捷键注册失败(可能被占用)」。

**性能/资源泄漏(长会话才暴露):**
- **Perf #1 domTokenResolver 每帧 getComputedStyle 爆炸**(`self-built-render.ts`):渲染每帧每元素查多次 token,50 元素 ≈ 600 次/帧 = 36000 次/秒 → 布局抖动 + GC 压力(**长会话卡顿主因**)。修:模块级 `_tokenCache` + `MutationObserver` 监听 `<html> data-theme` 变化失效(主题切换唯一入口)。token 集合固定,缓存命中率 ≈100%。`domTokenResolver` 本就是 DOM 实现,加缓存不破坏引擎框架无关性(纯 `TokenResolver` 接口仍可注入无 DOM 版)。
- **Perf #2 InMemoryCanvasHost undo 栈无上限**(`in-memory-host.ts`):对比 `SelfBuiltAdapter UNDO_LIMIT=50`,InMemoryHost 无截断(每快照深拷贝全部元素,契约不对称)。修:对齐 `UNDO_LIMIT=50` + `shift()`。

**不修(YELLOW):** Tauri BUG 3 退出不注销(OS 回收 + 边缘)/ BUG 4 CSP null(安全债,当前低危,AI 返回未直接渲染 DOM);Perf #4/#5 渲染热路径数组重建 GC(元素多才显现)/ #6 toast timer(自清)/ #7 storage 5s 轮询(周期微弱)。

**可拓展点(记入 STATE):** ① CSP 策略 + `withGlobalTauri` 暴露面收窄(随 AI 功能增长需做);② 渲染热路径 `getElements()` 缓存(仅 upsert/remove 失效)+ freedraw preview 免深拷贝(元素 100+ 时优化);③ storage-usage Blob 测量改 `raw.length*2` 或 store notify 驱动(去 5s 轮询 GC spike);④ Tauri 退出显式 `unregister_all`(防御性)。

验证:canvas-engine 354 + web build exit 0 + tsc 零新增 + `cargo check` 通过 + render-sweep 9 路由 0 error。commit 8b99106。

---

## 2026-06-26 · polish-bugfix-2 · 修补轮:数据丢失/误导反馈 6 真 bug

打磨期"修补真 bug + 保证可拓展性 + 记录可拓展点"轮。两 Explore subagent 并行审计(数据往返一致性 / 错误反馈完整性)出 ~20 条,核实后修 6 个真 bug(GREEN),4 条 YELLOW 不修。

**数据丢失类(系统性):**
- **A1 导入孤儿卡片**(`export-service.ts`):`importFromJson` 校验 card 结构但没校验 `canvasPosition.canvasId` 引用一致性。旧 JSON(无 canvases 字段)/手工编辑/损坏 JSON 里指向不存在画布的 `canvasPosition` 让卡既不在 inbox(`!canvasPosition` 要求)也不在任何画布(`listOnCanvas` 按 canvasId 过滤)→ **永久不可见不可找回**。修:payload 带 canvases 时,清掉指向不存在画布的 `canvasPosition`(回 inbox,可见可找回),而非 reject 整体导入。
- **A2 `.cystift` 配额中断悬空箭头**(`cystift-payload.ts`):`restoreCystiftPayload` 卡片创建循环配额失败 break 后,idMap 只含已创建卡。重映射 arrow 时 `idMap.has(from/to)` 为 false 保留旧 id → **悬空 arrow 指向不存在的卡,渲染成连着虚无,选不中删不掉**;card 几何带旧 id 成孤儿。修:重映射时 card 不在 idMap 跳过;arrow from/to 任一不在 idMap 跳过(自由箭头无 from/to 不受影响)。
- **A3 freeform hydrate 前切画布丢绘制**(`canvas-freeform-binding.ts`):cleanup `if(timer)` 才 flush;hydrate 前用户绘制只标 `dirtyDuringHydrate` 不 scheduleSave(timer=null);cleanup 不 flush;load .then `if(disposed) return` 短路 → **OPFS 慢 + 画一笔立刻切画布 → 笔画永久丢**。修:unbind 时若 `!hydrated && dirtyDuringHydrate`,捕获当前 freeform 元素(`pendingAtDisposal`),迟到的 load .then 合并「持久化 ∪ 新建」做一次 save(纯写,disposed 后安全)。新增 `mergeNewIntoSnapshot` 纯函数。

**误导反馈类(系统性):**
- **B2 AI 设置保存配额失败误导 toast**(`settings-store.ts` + `ai-settings-panel.tsx`):`updateAISettings` 配额失败回滚内存 + notifyQuota 但不返回失败信号;`save()` 无条件 success toast → 用户看到「已保存」+「配额超限」矛盾 toast,reload 后配置消失。修:5 个 settings mutator(`update`/`updateCaptureShortcut`/`updateLocale`/`updateTheme`/`updateAISettings`)返回 boolean,`save()` 据此决定 toast。
- **B3 删画布配额失败部分操作无反馈**(`canvas/page.tsx`):`confirmDelete` 先 removeFromCanvas(移卡回 inbox,DB 成功)+ canvasStore.delete(配额失败回滚返回 false,被忽略)+ 无条件关模态 → 配额失败时画布还在(空壳)但卡已离开,用户以为删成功。修:原子化——先 `canvasStore.delete`,成功才移卡片 + 关模态;失败不关模态(画布保留可重试)。
- **B4 DSL 下载缺 try/catch**(`dsl-dialog.tsx`):`new Blob([text])` text 极大时可抛(配额/内存)冒泡到错误边界。修:try/catch + toast error(对齐 export-dialog)。新增 `canvas.dslDownloadFail` i18n。

**不修(YELLOW,核实后非活跃 bug/边缘):** B1 AI Append-as-new 乐观 toast(三调用方注释一致确认为有意设计,配额失败 .catch 已弹错误 toast 补偿)/ A4 zombie freeform(不可达)/ A5 rehydrate 400ms 窗口(极低概率)/ A6 导入孤儿 freeform(不可见)。

**可拓展点(记入 STATE):** ① 配额中断是 best-effort break,各路径恢复策略不统一(.cystift break / freeform hydrate 合并 / store rollback)—— 未来可统一"部分失败"反馈契约;② settings mutator 返回 boolean 模式可推广到 canvas-store/canvas-view-store 调用方;③ 导入引用一致性校验目前只覆盖 canvasPosition→canvas,可扩 card.media/links 引用的 mediaAsset 存在性;④ 配额中断/hydrate 竞态/导入孤儿等边缘路径缺测试固化(核心路径已覆盖)。

验证:canvas-engine 354 + db 7 + domain 全绿;web build exit 0;tsc 零新增;render-sweep 12 路由 + canvas 交互探针 0 error。commit 9f33633。

---

## 2026-06-26 · outline-view · 画布大纲视图(转义第二次产品化)

灵感:同行 drawio/Excalidraw 的 Outline/Layers 视图(见 `docs/decisions/2026-06-26-peer-inspiration.md`,⭐ 首选候选,用户授权开干)。核心卖点「转义」此前只对**编辑**可见(DSL 模态=交换格式给 AI);Outline 是转义的**第二次产品化**——把画布表达成给人**扫览**的结构化文字大纲(可点跳导航),让「画布能用文字描述」对浏览也有用。

- `buildOutline` 纯函数(`features/canvas/outline.ts`):按 z 序(getElements 已分层排序)映射每元素——card→标题 / text→片段 / arrow→关系标签+「A→B」(端点解析)/ rect→(rect) / freedraw→(sketch)(点序列绝不进,R2)/ legacy→(legacy)。
- `OutlinePanel`:左侧浮动面板(避开右侧 rail + 右下 minimap;z-index 30 同 relation/freedraw;collapse;点项→`elementCenter`+`setView` 居中+`setSelectedIds` 选中,复用 minimap 同款 centering);订阅 `onUserChange`/`onSelectionChange` 刷新(非轮询)。
- CanvasSideRail 加 ☰ toggle(pressed 态);只读 v1,纯本地无 AI。
- 与 minimap 互补(结构 vs 空间);与 DSL 模态不同(浏览 vs 编辑)。
- +14 测试(各 kind 标签 + R2 反向断言 freedraw 无 points);web 603 + build exit 0。

---

## 2026-06-25 · robustness-web-layer · web/React 层边界鲁棒性(真 bug 修复)

引擎过了 5 轮边界加固,web/React 层从没做过。3 个 Explore subagent 并行猎真 bug(捕获+store+数据 / canvas 交互 / 模态+表单+路由),出 ~35 条,核实后修 ~20 个真 bug(含数据丢失 + 2 个上两轮引入的回归)。subagent TDD 执行,跨包零回归。

**数据丢失类(最重)**:
- **FileCaptureSink 从未注册** → 拖文件/粘贴全走 fallback 变空卡,内容丢失 + 成功 toast 撒谎(生产里文件捕获彻底坏)。注册 drag-drop/paste。
- **capture 火忘 quota** → 失败时草稿清+modal 关,文字不可恢复。cardRepo.insert 改抛 StorageQuotaError,registry 转 rejected,CaptureHost 失败时留 modal+保草稿+错误 toast(成功仍即时)。
- **canvas Delete 走 softDelete 但撤销不恢复 DB** → 卡永久丢失。改 removeFromCanvas(送回收件箱,**行为变更**:canvas 删除=移出画布,卡真正删除只在 modal 显式确认)。
- **AI Replace body 用陈旧 card prop** → 未存编辑丢失;**inbox/archive/timeline/canvas detail 不同步 store** → 卡他处删除时显幽灵卡;**canvas 存盘丢 tags**。
- **canvas-store/settings-store/canvas-view-store 静默吞 quota** → 内存更新 UI 显成功,reload 静默回退。全加 rollback + onQuotaExceeded pubsub(app-menu 统一 toast)。

**核心 reactivity(根因)**:
- **adapterReady 非响应 ref 读** → 冷启动/切画布工具栏禁用、RelationPanel/FreedrawPanel/Minimap 拿 null host、订阅挂不上。SelfCanvas 加 onAdapterReady 回调,page 用 state 接,render 期 ref 读全改 state(连带多个 MED 一起好)。

**校验/竞态**:import 不校验 capturedAt(Invalid Date 乱序);submit 后 debounced 草稿重存(重现);file-drop deviceId 格式不统一;card-detail resync 冲掉在编编辑;relation appliedKey 不随 arrow 重置;inbox/archive 批量 selected 不对账 store;CreateCardForm !ready 可提交崩路由;多选 Delete = N 步 undo(包 batch→1 步);文本编辑切画布丢半截。

**2 个回归(上两轮引入,必修)**:RouteFocus 抢 modal 焦点(改:有 dialog 开着时跳过);浮 panel 不响应 window resize(加 resize 监听重钳制)。

domain 68 / 引擎 354(+1)/ web 589(+~38 测试)/ build exit 0。

---

## 2026-06-25 · a11y-systematic · 无障碍系统化(键盘/ARIA/对比度/地标)

3 个 Explore subagent 并行审 a11y(键盘导航+焦点 / ARIA+语义+标题 / 对比度+动效+SR),出 ~45 条清单,HIGH/MED 全做 + 选择性 LOW,subagent 顺序 TDD 执行,跨包零回归。

- **地标 + 标题导航(HIGH)**:8/9 生产页无 `<h1>`(SR 无法按标题导航)→ crumb 改 h1(视觉不变)+ canvas/design sr-only h1;无 skip-link + 路由切换不聚焦(键盘用户每页 Tab 穿过整个 AppMenu)→ skip-link + RouteFocus 客户端组件(usePathname → focus #main);Toolbar div → `<header>`(banner 地标);每页 `<main id="main" tabIndex={-1}>` + sr-only 工具类。
- **对比度(HIGH)**:disabled 透明度 0.35-0.4 → 黑文字塌到 ~1.4:1 → 全扫 8 处 → 0.55(~3:1);黄 Tag 1.34:1 不可读 → 文字改 --color-black;灰 Tag 4.14:1 → --color-black-soft(token 值不动,修在组件层);tooltip 加 reduced-motion。
- **键盘可操作(HIGH)**:视图 tab(inbox/archived, grid/timeline)→ 完整 tab 模式(role=tablist/tab/tabpanel + aria-selected + roving tabindex + 方向键);tag chips span onClick 鼠标专用 → button[aria-label](视觉对齐);堆叠 modal Escape 双触发 → defaultPrevented 守卫(canvas card-detail-modal 嵌套 confirmDelete 先让位)。
- **focus-visible 焦点环(MED 大扫除)**:AppMenu / tile(tile__main/pin/select)/ canvas toolbar / tabs / home nav 统一补 2px 红描边(只键盘触发);已有不重复。
- **canvas/panel(SR/MED)**:主画布 `<canvas>` 加 role=img + aria-label(此前 SR 遇无标签 void);minimap 折叠英文 → i18n + role=group;**修上轮回归**——canvas 空态 .cv-empty 的 aria-hidden 遮掉了刚加的 /inbox CTA → 移除;AI 触发按钮加 aria-expanded/aria-controls → popover(id=ai-popover)。
- **LOW 杂项**:editors/ai-popover EN aria-label → t();img alt UUID → 媒体 {n};home nav 与 AppMenu 重名 Primary → 改;toast × 含消息片段;ai-settings 5 label htmlFor;batch bar aria-live;settings 导入结果 role=alert/status;canvas 切换 select aria-label。
- domain 68 / 引擎 353 / web 551 + build exit 0。

---

## 2026-06-25 · ui-polish-batch · minimap 优化 + UI 审计打磨(转义产品化主线收口后进入打磨)

主线三步(JSON 备份 / 转义产品化 / AI 介入手绘)全完成后,进入打磨轮。开 3 个 Explore subagent 并行扫画布 / 列表视图 / 模态+全局壳,出 42 条带优先级清单;用户定"全做"。subagent 顺序执行(TDD),主模型审 diff + 跨包验证 + commit。

- **minimap(用户反馈"手绘图案显示不佳")**:① 拖拽平移(pointer capture + window 监听,拖出 minimap 也跟随;单次 click 仍居中);② **手绘真身显示**——freedraw `meta.points` → mini 折线(本地渲染,不进 AI/snapshot,守 R2);③ 元素标记区分(rect=描边方框 / text=横条 / freedraw=折线,此前全是中心点);④ token 清理(12/4px → var(--space-1))。
- **i18n 清零**:archive 卡 "media" 硬编码 → t('card.mediaCount')(CJK 用户此前看英文)/ archive+trash 面包屑品牌名 / create-form title 误用 body label / settings label htmlFor 关联 / Modal 加 closeLabel prop。
- **token 清零**:export-raster JPEG `#ffffff` → readToken / modal 背景板 rgba → color-mix(跟 --color-black,暗色自适)/ 浮 panel + rail px → space token。
- **一致性统一(F/G/I)**:archive 选择控件原生 checkbox → button[aria-pressed] 方块✓(对齐 inbox)/ archive 黑底 floater → 白卡 batch-bar(镜像 inbox)/ card-detail 编辑态按钮顺序 [Save][Cancel] → [Cancel][Save](primary 靠右)。
- **真 UX bug(J/K/L)**:浮 panel 视口钳制(relation/freedraw 拖到边缘出屏 → 新 useClampedPanelPosition hook 测真实尺寸+钳制)/ DSL dialog 动作行 flex-wrap 防溢出 / card-detail 全局 Escape 守卫(不再吞掉嵌套 AI popover/标签输入/确认删除的 Escape)。
- **toast 错误处理(M)**:错误不再自动消失(数据级错误不该 5s 蒸发)+ per-toast role(error=alert)/ 每条 × 关闭 + 队列上限 5(溢出丢最旧非错误,错误永不静默丢)。
- **z-index 分级(N)**:文档化 canvas 0 / minimap 10 / rail 20(升,不再被遮)/ 浮 panel 30 / modal+toast 100。
- **skeleton(O)+ 杂项**:PageLoading 纯文字 → 4 灰块骨架(opacity 脉冲,reduced-motion 关)/ ✨ emoji → » mono / search 加 PageLoading / trash grid 对齐 / 批量操作 toast 反馈 / DSL 下载 toast / AI busy aria-busy / home 二级 nav(search/trash/settings)/ brand 条纹统一红 / canvas 空态 CTA / version 同步 v0.37.0 / inbox 删死代码 `<style>`。
- 全程 subagent 编排省主模型上下文;domain 68 / 引擎 353 / web 551 测试 + build exit 0,跨包零回归。

---

## 2026-06-25 · timeline-view · 全局时间线视图 /timeline (P10 时间线收口)

P10 三件(cluster / 找重复 / 时间线)最后一件。brainstorm 定形态:**全局本地视图**(非 AI、非画布能力),跨 inbox/canvas/archive 全部非删除卡,按 `capturedAt`(想法诞生时刻)倒序 + 按捕获日分组。核心增值:每张卡显示**「现在在哪」**徽标(inbox/在画布X/已归档)——全局视图的卡是混合状态,这是它区别于 archive timeline(单一已归档)的点。

- `groupCardsByDay<T>` 纯函数 + 5 单测(apps/web/lib,保 domain 零依赖);archive timeline 改用它(DRY,传 updatedAt)。
- 新路由 `/timeline`:Toolbar + 日分组列表 + 空态;复用 `ArchiveCardTile`(扩 badge slot + select props 改可选)+ `CardDetailModal`(动作全套);AppMenu 加条目(横切视图,不做 home 第四阶段卡);Toolbar region 加 timeline(gray)。
- 状态徽标优先级:archived(blue) > 在画布(gray,带名,孤儿退化) > inbox(red)。
- 纯本地、无 AI、无 R2 隐私面。
- i18n 9 条;web +5 测试(551);build exit 0。

---

## 2026-06-25 · inbox-find-duplicates · inbox 本地精确找重复(纯提示)

P10 AI 方向第一层:本地精确去重(零 AI/零隐私/离线可用),互补已上线的 cluster(LLM 找相似画箭头)。用户定形态:本地精确 + inbox 入口;后反馈"功能价值有限,放着但不要替用户决定",改为**纯提示**。

- **domain 纯函数** `findDuplicateGroups(cards)`(`packages/domain/src/services/duplicate-detect.ts`):三维度归一化等值——URL(去 fragment/utm/末尾斜杠、小写 scheme+host)、代码片段(去全部空白+小写)、标题(小写+折叠空白)。返回 `DuplicateGroup[]`(≥2 卡成组,含 dimension/cardIds/reason)。
- **inbox 入口(纯提示态)**:工具栏「找重复」按钮,有重复时附黄色计数 Tag(常驻提示组数)。点按钮只 toast 报「发现 N 组重复:同链接 X · 同代码 Y · 同标题 Z。请自行翻找处理」。**不选中、不跳选、不替用户操作**——工具只提醒"存在",找和处理全靠用户。
- 产品克制:精确重复直接提示;语义重复留给 LLM cluster,互补不重叠。
- domain +17 测试(归一化各维度 + findDuplicateGroups 各场景);domain 68 绿 / web 546 绿 / build exit 0。

---

## 2026-06-25 · import-freeform-atomicity · JSON 导入 freeform 失败诚实回报

修 debt(M2 JSON 导入 freeform 原子性)。`importFromJson` 此前忽略 `canvasFreeformStore.save` 返回值——OPFS+localStorage 双失败时部分画布几何静默丢失(返回 ok:true 不报错),reload 后用户看到部分画布几何缺失且无提示。

- `ImportResult` 加 `freeformSkipped?: number`;freeform 循环检查 `save` 返回值,成功 `freeformCanvases++` / 失败 `freeformSkipped++`。
- 不整体失败(卡片/canvas 列表已成功落地且有 localStorage rollback 保障,freeform 失败不该回滚已成功的核心数据),但诚实回报供 UI 提示。
- settings 导入 toast 体现「· N 个画布几何因存储满跳过」。
- +2 测试(save 返回 false 计 skipped / 全成功 freeformSkipped undefined 向后兼容);此前 `canvasFreeformStore.save` 失败路径零覆盖。
- 测试坑:`vi.resetModules` 后 `mod` 拿到新 `canvasFreeformStore` 实例,顶部静态 import 的 `vi.spyOn` 拦截不到 → 用动态导入挂 spy,红绿才真实。
- export-service 36 测试绿;build exit 0。

---

## 2026-06-25 · inbox-batch-undo · inbox 批量多选 + 画布 undo/redo 按钮

P12 UX 打磨收尾:补两个明确缺失(键盘有 UI 无 / 批量操作空白)。

- **画布 undo/redo 按钮**:此前画布只有键盘 undo/redo(Ctrl+Z/Y),无 UI 按钮——新用户不可发现。SelfBuiltAdapter 加 `onHistoryChange` 事件(pushUndo/undo/redo 触发;restore 不触发 onUserChange 是防 DB 回写循环,故需独立事件给 UI 刷新 disabled)。CanvasSideRail 顶部加 ↶↷ 按钮,disabled 由 canUndo/canRedo 驱动,page 订阅 onHistoryChange(依赖 activeCanvasId,切画布重订阅)刷新。i18n canvas.undo/redo。
- **inbox 批量多选**:此前 inbox 只能单卡操作,管理大量灵感卡片时无法批量归档/删除/移到画布。Gmail 式:每张 CardTile 左上角加 checkbox(常驻,stopPropagation 不触发详情),选中任意卡 → 底部固定 BatchBar(计数 + 归档/取消归档/移到画布/删除/全选/取消)。批量动作循环调 service.archive/unarchive/moveToCanvas/softDelete。切 view 自动清空选中。i18n inbox.batch.*。
- 引擎 +3 测试(onHistoryChange);web 544 绿;build exit 0。

P12 UX 打磨四项(inbox 批量 / Card markdown 双向 / minimap / undo-redo)现已全部完成。

---

## 2026-06-25 · arrow-routes · 箭头形态系统(弯曲 + 折线 + 识别 + DSL)

用户需求:箭头要能弯曲(单控制点光滑曲线)和折线(单/双折点),手绘转箭头要识别形态,AI 能生成弯曲/折线。弯曲箭头 base(commit a708eb1)此前已落地但缺形态切换 UI / 折线 / 识别 / AI 生成。本轮补全箭头形态系统。spec `docs/superpowers/specs/2026-06-25-arrow-routes-design.md`。

五阶段 TDD(每阶段一 commit):

- **① 引擎模型 + 纯函数**:`CanvasElement` 加 `route?: 'straight'|'curve'|'elbow'` + `elbow?: {x,y}[]`(≤2)。`arrowRoute`(显式 route 优先;无 route 旧箭头有 curve→curve,向后兼容)/`elbowSegments`(折点序列)/`arrowHeadAngle`(终点切线按 route)三纯函数收口,render/hitTest/SVG/手柄全走同一份。
- **② 三视图渲染/命中**:render 按 route 分支(straight 直线 / curve 贝塞尔 / elbow 折线 polyline)+ 箭头头角度按 route + label 中点;hitTest elbow 逐段点距;SVG `<polyline>` 折线。
- **③ 交互**:drawSelectionOutlines 按 route 画手柄(elbow 折点方块 / straight·curve 中点圆点);adapter onDown/onMove 按 route 分支(折点拖动 + 从 straight 拉出 curve 一并设 route);RelationPanel 形态切换器(直/曲/折 glyph 按钮,切换时初始化默认 curve/elbow 数据,切回 straight 保留数据)。
- **④ 转义 DSL**:`@route(straight|curve|elbow)` + `@elbow(x,y;x,y)` parse/serialize/apply 四路径全通;AI GRAMMAR 加说明 → 任何 AI 能生成弯曲/折线箭头(绕开遮挡)。**转义核心卖点对箭头形态双向无损**。
- **⑤ 手绘识别**:`detectArrowRoute` 本地几何启发式(折角检测 = 方向角突变 >45° 1-2 个 → elbow;平滑弯曲偏离 >15% → curve;否则 straight)。`freedrawToArrow` 转出的箭头带识别到的 route;FreedrawPanel 按钮文案随形态变(转为曲线/折线/箭头)。点序列 R2 隐私全程本地。

### 验证
引擎 313→343 测试(+30:route helper 12 + render/hitTest/svg elbow + freedraw detect 7);web 525→541 测试(+16:parse route/elbow + serialize + round-trip + apply)。tsc 0 新增(pre-existing 测试类型无关)。build exit 0(静态导出)。

---

## 2026-06-24 · dsl-pos-modal · DSL 负坐标 bug + Modal 滚动/关闭入口

用户实测「复制为 AI 提示词」粘回画布全失败 + 二级页面看不完。两个修复。

- **DSL `@pos` 支持负坐标**(`80acf86`):`POS_RE` 此前 `\d+` 只认正数,但画布元素拖到原点左/上方后 `serializeCanvasReadable` 输出 `@pos(-54,150)` → parser 报 `missing @pos` → 整张画布的 DSL 往返断裂。**转义核心卖点的真 bug**:负坐标元素复制出去的 DSL 粘回来全失败(用户实测 7 卡全无效)。修:`POS_RE`/`AT_RE` 改 `(-?\d+)`(对齐 `SIZE_RE` 早有的负数支持)。加负坐标往返测试。
- **Modal max-height + body 滚动 + ×关闭按钮**(`b04bd4a`):`@cys-stift/ui` Modal 的 `.frame` 此前无高度上限 → 卡片详情等内容多时撑出视口,底部按钮看不到也无法滚(用户:"看不完、没有可拉的条轴")。且无显式关闭按钮(只 Esc + backdrop 点击,用户:"没退出按钮")。修:`.frame` 加 `max-height: calc(100vh - 2*space-4)` + `.body` `overflow-y:auto`(title 行固定不滚,提供稳定关闭入口);title 行加显式 `×` 关闭按钮。**一处改,所有二级页面受益**(卡片详情/导出/DSL/版本对比/快捷键/设置确认)。

### 验证
523 web 测试 + 313 引擎测试 + tsc 零新增(22 基线无关)+ build exit 0。puppeteer 测 1280/900 宽各页面无横向溢出。



用户实测打包版反馈「画布完全不能用」三问题,逐个修。计划 `docs/superpowers/plans/2026-06-24-canvas-usability.md`。

- **触摸板 pan 规范化**(`69b0b0d`):引擎 `onWheel` 此前把所有 wheel 事件当缩放 → macOS 触摸板双指滑动(pan,无 ctrlKey)变成缩放,画布移不动。改:`ctrlKey`(pinch / ctrl+滚轮)→ zoom-to-cursor;无 `ctrlKey`(双指滑动 / 鼠标滚轮)→ pan(`panX -= deltaX, panY -= deltaY`)。签名 `(sx,sy,delta)` → `(sx,sy,deltaX,deltaY,ctrlKey)`。对齐 Figma/tldraw/Excalidraw 主流:滚轮 pan,ctrl+滚轮 zoom。
- **工具栏重构**(`2f374d2`):顶栏 18 元素平铺溢出嘈杂。走 Figma/Excalidraw 风格——顶栏精简(面包屑/画布切换/新建重命名删除 + 工具切换 + 吸附 + 缩放),低频操作(AI 排版/AI 找相似/AI 自动关联/导出/DSL/版本对比/快捷键)移到画布右侧浮动竖条 `CanvasSideRail`(`position:absolute; top:72; right:12`,Bauhaus 白底黑边硬阴影,icon 按钮)。主次分明,顶栏不再溢出。
- **minimap 可发现性**(`08338e8`):右下角鸟瞰地图被用户当「不明物体」。加标题条(「鸟瞰」mono 小字)+ 可收起 toggle(▾/▸),collapsed 时只留标题条。

### 验证
313 引擎测试(310 基线 + 3 新 pan/zoom)+ 522 web 测试 + tsc 零新增(22 基线无关)+ build exit 0。



放大核心卖点「转义」(画布↔文字 DSL 双向,任何 AI 可驱动画布)。三个功能都是转义的直接产物,各自独立。计划 `docs/superpowers/plans/2026-06-24-translit-features.md`,subagent 串行执行(Markdown→双向桥→diff,逐个 commit)。

- **Canvas→Markdown 导出**(`550622e`):数据可迁移信念。新纯函数 `exportCanvasMarkdown`——画布名→H1,card→H2 章节(title+body),语义关系箭头(blocks/references/derived-from/related-to)→ markdown 交叉引用链接;无关系 card 按画布 y 上→下排序。非 card 元素(rect/text/freedraw/自由箭头)无 markdown 语义,忽略。export-dialog 加 `markdown` 格式选项(与 svg/png/jpeg 并列),复用 resolveExportElements 选区。纯函数无新依赖。
- **转义双向桥**(`d50f3d6`):让核心卖点变可摸到,**不依赖内置 AI**。① **粘贴 DSL→画布**:canvas 页加 `paste` 监听,剪贴板纯文本疑似 DSL(任一行 `[card/[arrow/...` 开头)→ `parseDslWithDiagnostics`+`applyLayout` 直接应用,无需开模态;诚实 toast(applied/skipped/none 三态)。② **复制为 AI 提示词**:dsl-dialog 加按钮,`buildCanvasPrompt` 把画布打包成「DSL 语法说明 + 当前画布快照 + 可执行指令」的提示词,粘进任意 ChatGPT/Claude 网页版即可驱动画布编辑。R2 安全:formatCanvasSnapshot 已守 freedraw 只发 shape 标签。完整闭环:复制→粘进 LLM→AI 返回 DSL→粘回画布。
- **画布版本 diff**(`6d3bbb4`):**转义独占能力**——画布=文字 → 两个状态可 diff,Excalidraw/tldraw/Figma 做不了(它们画布是对象图/二进制)。CanvasHost 接口加**可选** `getHistory?()`(不破坏现有实现),SelfBuiltAdapter 暴露 undoStack 只读副本,InMemoryCanvasHost 返回 `[]`。新纯函数 `diffCanvasSnapshots(before, after)`(元素级:按 id 分类 added/removed/changed+变化字段,自研不引 diff 库)。DiffDialog 展示最近一次变更前后差异(新增蓝/删除红/修改黄)。工具栏「版本对比」按钮。

### 验证
522 web 测试(513 基线 + 9 新:4 markdown + 1 canvas-prompt + 4 canvas-diff)+ 310 引擎测试(接口扩展未破坏契约)+ tsc 零新增(22 基线无关)+ build exit 0。

### 决策(deferred,需 ADR 挡 scope creep)
日历待办 / 联网同步 — 偏移产品定位(local-first 灵感画布),建议写 ADR 挡住,不做。语义图分析(本地)、DSL 模板/派生 — 后续特色候选。



收口审计/主线三件可实现遗留。计划 `docs/superpowers/plans/2026-06-24-remaining-ux-ai.md`,subagent 编排串行(三者都触 canvas page.tsx 不同段,按序 commit 避冲突)。

- **R3.8 DB 水合前 gate 空状态**(`d90327a`):`useDb()` 的 `ready` 字段此前解构了却没消费 → inbox/archive/trash/canvas 四页首帧渲染假空状态,水合后跳变(用户误以为「真的没数据」)。新增共享 `<PageLoading>`(极简 mono「读取中…」),四页 `!ready ? <PageLoading/> : 空状态? : 列表` 三元 gate;canvas 空提示叠加层 `!ready ? null`。
- **R3.5 画布快捷键帮助对话框**(`94380aa`):画布有 13 组快捷键(放大 `+`/`=`、缩小 `-`、适配 `0`/`1`、吸附 `g`、`Esc` 取消选区、`Delete` 删除、`Ctrl/Cmd+Z` 撤销、`Shift+Z`/`Ctrl+Y` 重做、`Ctrl+A` 全选、方向键微移 1px、`Shift+方向` 10px)但 UI 全无提示。工具栏加 `?` 按钮 → `ShortcutHelpDialog`(复用 `@cys-stift/ui` Modal,三组:视图/编辑/微移,键→动作两列)。16 条 i18n。
- **A 方向 cluster prompt 接画布快照**(`966cc87`):cluster 是 AI action 但只看 card 文本(`serializeCardsForAI`),看不到 freedraw 形状 → 无法按手绘空间提示分组。`buildClusterUserPrompt(cards, canvasSnapshot='')` 扩展签名(默认空 → 向后兼容,旧调用/单测不受影响),`handleAICluster` 照 `handleAILayout` 调 `snapshotCanvas`+`formatCanvasSnapshot` 喂入;system prompt 补一句说明 freedraw shape 行可作为空间提示(输出 ids 仍只能是 card ids)。snapshot 层早已有 freedraw 的 `shape: circle (85%)` 行(R2 安全:只发离散标签 + 标量比例,不发点坐标),只差 cluster 消费。**转义+AI 主线推进**:AI 现在能感知手绘形状。

### 验证
513 web 测试(510 基线 + 3 新 cluster)+ tsc 零新增(22 基线无关)+ build exit 0。auto-relate 是纯本地关键词启发式非 AI,不在本轮范围。



审计遗留的三类「静默吞 QuotaExceeded」同源问题,复刻 `db-client.ts` 已验证的配额契约模式(`saveXxx(): boolean` + `onQuotaExceeded` 订阅点)统一收口。计划 `docs/superpowers/plans/2026-06-24-quota-dual-failure.md`,5 步 TDD(subagent 编排,每步一 commit)。

- **R2.4 `mediaStore.attach` 配额失败抛错不留悬空 ref**(`5335356`):`saveAssets` 返回 boolean,`attach` 内 `enqueueWrite` 读返回值,失败时 `throw` 先于构造 MediaRef —— 卡片不再引用不存在的 asset(此前配额满时 attach 仍返回 MediaRef → card.media 指向幽灵 asset)。加 `onQuotaExceeded` 订阅点(镜像 db-client)。
- **R2.3 `canvasFreeformStore.save` 返回 boolean**(`8343e6d`):`lsSave`/`save` 返回 boolean,失败经 `onQuotaExceeded` 浮出(此前 fire-and-forget `void store.save(...)` 调用方无法读返回值,配额满只 `console.warn` 静默)。OPFS 成功即 true,否则回退 lsSave 返回其值。
- **R2.8 capture 链路 attach 失败不造悬空卡片**(`ae95d9c`):R2.4 让 attach 抛错后,`FileCaptureSink.submit` 在 `service.create` 之前 reject → 无悬空卡;调用方 `file-drop-handler` 的 `captureAndToast` 已有 `.catch` + toast。回归测试断言 image/doc 两分支 attach 失败时 `service.create` 一次未调。
- **AppMenu 订阅统一**(`3e0742f`):AppMenu 的配额 `useEffect` 从单订阅 db-client 扩为订阅三 store(db-client / media / freeform),任一失败均 toast `storage.quotaExceeded`。

三个 store 现共享同一配额契约模式。510 web 测试(504 基线 + 6 新红→绿:2 media + 2 freeform + 2 capture)+ tsc 零新增错误(22 基线无关)+ build exit 0。



先做审计 plan 的 4 个 HIGH/MED(Task 1-4),再启动 Ralph 式自我打磨 3 轮(subagent 系统扫缝→审→TDD 修→验证→commit)。

### 审计闭环(plan `docs/superpowers/plans/2026-06-24-audit-closure.md`)
- **H1 db-client saveSnapshot 吞 QuotaExceeded + 回滚内存**(`5dc4a47`):裸 setItem 无 try/catch,配额满时 _cards 内存已改但 localStorage 未写 → reload 丢。修:saveSnapshot 返回 boolean,insert/update/delete 回滚内存 + onQuotaExceeded 订阅(AppMenu toast)。防静默丢卡片。
- **H3 DSL COLOR_RE 收窄到 Bauhaus 6 色**(`035f581`):正则 [a-z]+ 接受任意色,引擎 colorOf 只认 6 色 → 越界色静默变黑。修:正则收窄 (red|yellow|blue|black|white|gray|grey)。parser/引擎/prompt 三方一致。
- **H4 存储计量接入 estimate().usage(含 OPFS)**(`b341d63`):used 只算 localStorage,OPFS 不可见 → 80% 警告(防 H1 丢数据的网)触发太晚。修:used 用 estimate().usage。
- **M5+M9 AI 按钮 loading + AbortController**(`dd9fc86`):API 调用期间按钮无 disabled(重复点击并发请求)+ 无 abort(浪费 API 费/unmounted setState)。修:aiBusy state + AbortController + try/finally + 「思考中…」。

### Ralph Round 1:引擎正确性(`9df859f` + `620be98`)
3 BUG + 2 EDGE + 2 LATENT:
- **R1.3 marqueeSelect 不归一化 bbox**(BUG):负 bbox rect 框选不中。
- **R1.4 交互中途 undo/redo 漏清状态**(BUG → 数据损坏):拖拽中 Ctrl+Z,dragGroup 残留旧 offset → 恢复的元素被挪错位。修:clearInteractionState()。
- **R1.5 setTool 只清 currentStroke**(BUG):切工具中途幽灵交互(connect 中切 select 仍创建箭头)。
- **R1.7 elementCenter/borderPoint 负 w/h 错**(EDGE):负 bbox 卡连箭头端点落错边。
- **R1.6 resizeGeometry 负 start dims 错**(EDGE):负 bbox 缩放出垃圾几何。
- **R1.1 snapshot 浅拷贝 meta.points**(LATENT):undo 别名隐患,深拷贝。
- **R1.2 commitFreedraw 存调用方数组引用**(LATENT):深拷贝 points。

### Ralph Round 2:web 数据完整性 + 隐私审计(`a4d2a45` + `ab01491`)
- **R2.5 rehydrateCards 签名太弱**(LATENT → 跨 tab 中间卡编辑丢失):只查 length+首尾 id。修:签名含所有卡 updatedAt 之和。
- **R2.1 canvasViewStore 不进导出**(LATENT):per-canvas zoom/pan/grid 迁移丢失。修:ExportPayload 加 canvasView。
- **R2.10 草稿自动保存配额失败静默**(DATA-LOSS):saveDrafts 吞 QuotaExceeded。修:返回 boolean + isDraftPersistOk + MiniInput/CreateCardForm 红色警告。
- **隐私审计全 CLEAN**:deviceId/media.dataUrl/软删除卡/手绘点序列 全路径无泄漏;新加 shape/features 只含标量比例 + 整数 pointCount。

### Ralph Round 3:UI/UX + i18n + 韧性(`69775fc` + `5899cac`)
- **R3.1 全局 error boundary**(RESILIENCE,关键):无 Error Boundary,渲染崩溃白屏。加 app/error.tsx(崩溃展示「数据没丢+重试/回首页」)。
- **R3.2+R3.3+R3.4 i18n 英文清零**(I18N):editors.tsx / card-detail.tsx / create-card-form.tsx 22 处硬编码英文(编辑器/卡片详情/创建表单)→ i18n key。zh 用户编辑不再看到英文碎片。
- **R3.7 DSL/Export 对话框 Escape**(UX):Modal 只处理 backdrop,这两个漏 Escape。加 keydown listener。

### 验证
web 504 + 引擎 310 = **814 测试全绿**,build exit 0,tsc 零新增。R2 隐私反向审计确认 AI 路径无泄漏。3 轮共 13 个 finding 全修(3 BUG + 2 EDGE + 2 LATENT + 2 DATA-LOSS + 1 RESILIENCE + 3 I18N/UX)。

---

## 2026-06-24 · mainline-b-plus-a · 主线推进:转义信任裂缝修复 + AI 介入手绘(增值)

打磨已有功能(转义核心卖点的诚实性)+ 推进第三层增值主线(AI 介入手绘,守 R2 隐私)。同时收尾 UI 一致性(canvas 工具栏溢出)+ 交付闭环(Windows Tauri CI)。

### 转义打磨 · 核心 卖点信任裂缝(`64153b6` + `4d0599c`)
转义是核心卖点,但 DSL 编辑器有 HIGH 信任裂缝:**parseDsl 静默丢弃坏行**——用户写 10 行(7 对 3 错 `@pos` 拼成 `@ps`),toast 说"应用 7 条",3 行静默消失,用户以为全生效。空输入 vs 全写错也分不清。
- **parseDslWithDiagnostics**:返回 `{ops, errors: DslDiagnostic[]}`(DslDiagnostic = {line(1-based), text, message}),每个 continue 丢弃前记诊断。`parseDsl` 改薄 wrapper 返回 `.ops`,**AI 路径零变化**。诊断分类:missing #id / missing @pos / free arrow 缺 @pos@size / unrecognized kind;`#` 注释和散文行静默跳过(只 `[` 前缀行失败才报错)。
- **dsl-dialog 展示诊断**:textarea 下方渲染诊断列表(行号+原因,Bauhaus red-soft + red 左边栏);全部行无效 → "全部 N 行无法识别" toast + 不应用;空 vs 全错区分;混合有效/无效 → toast 诚实报 applied + skipped(含 parse 错)。核心卖点不再静默丢用户输入。
- **实时预览计数**(`33ba8e8`):useMemo 对 text 实时 parse,打字时显示"2 条有效 · 1 条无效",无需点 Apply。具体行号仍 Apply 后展开(避免打字噪音)。puppeteer 实测通过。

### AI 介入手绘 · 第三层增值主线(`a0b891f`)
此前 AI 只看到 `[freedraw #id] @pos(x,y)`——不知手绘是什么形状,无法智能 cluster/auto-relate 手绘元素。现在 freedraw 元素带 R2 安全的形状描述:
- shape: circle/rect/triangle/check/arrow/unknown(离散标签)+ shapeConfidence + features{straightness, closure, elongation, pointCount}(4 个标量比例)
- snapshotCanvas 本地跑 classifyFreedraw + recognizeShape(失败退化到仅位置,不抛)
- formatCanvasSnapshot 输出 `shape: circle (85%)` 注释行(parser 跳过注释行,round-trip 安全)
- **R2 隐私**:点序列绝不进 snapshot 文本(只有离散标签 + 标量比例)。反向断言测试:多点 freedraw 的 snapshot 文本不含内部点坐标。
- privacy.md 更新:用户面向说明手绘形状描述发给 AI 的隐私边界(本地识别,只发标签不发笔迹)。

### UI 收尾
- **canvas 工具栏溢出修复**(`b2b611e`):@cys-stift/ui Toolbar `.content` flex 子元素 min-width:auto 无法收缩,canvas 工具栏 1756px 溢出 1280px 视口。加 `min-width:0` + `overflow-x:auto`。

### 交付闭环
- **Windows Tauri CI**(`d0f7fcf` → `8569193` → `4cc166c`):加 build-tauri-windows job。macOS 无法 cross-compile Windows(缺 llvm-rc toolchain),故 Windows 在 windows-latest runner build。迭代修复:pnpm/action-setup v4→v5(Node 20 deprecation);rust-toolchain setup + Swatinem/rust-cache;`--bundles nsis`(只 NSIS setup.exe,避开 MSI/WiX 工具链——Win CI 最常见 bundling 失败点);upload-artifact v4→v5。

### 验证
485 web 测试 + 285 引擎测试 + build exit 0 + tsc 零新增。R2 反向断言覆盖。puppeteer 端到端实测 DSL 诊断 + 实时预览。

---

## 2026-06-24 · polish-six · 打磨六主干(已落地功能完成度/体验/鲁棒性)

转义产品化 + JSON 备份 + 引擎鲁棒性都落地后,做一轮"打磨已有功能"而非找新缝。6 个主干,各一 commit。

### 修复
- **DSL Apply 文本同步 + 生效计数**(`bbfb822`,合并主干1+2):① 真 bug——apply 后不重序列化 textarea,host 同引用 + batch 原地变更使填充 text 的 useEffect 不重跑 → 文本框显示旧文本 → 重复 Apply 对 create 类 op(rect/text/自由箭头无 id)造副本。修:apply 末尾 setText(serializeCanvasReadable)。② 反馈不诚实——toast 报 parse 的 op 数非实际生效数。修:applyLayout 返回 {applied,skipped}(各 applyXxxOp 返回 boolean,per-op throw 计 skipped);toast 改"应用 N 条 M 条跳过"。
- **DSL 语法速查内嵌**(`dcabf50`):编辑器只一句话 lede 不教语法。加可折叠 details 速查:5 kind 示例行 + 注释规则 + card 只更新约束。i18n 双语。
- **Escape 取消选区**(`5831b1c`):keyHandler 无 Escape,只能点空白取消。加 Escape 清选区(通用画布习惯),守卫 text/输入框已排除。矩阵补 Escape 列。
- **多选 resize 一致性**(`e9f6810`):resize handle 多选时只缩第一个元素误导。改 size===1:多选时禁用 resize 只允许组移动(组缩放复杂功能留后)。矩阵补多选 resize 格子 + 单选对照组。
- **JSON 导入确认门**(`0cf1000`):导入是裸 file input,选错文件零确认覆盖全数据。加 Modal 确认门(警告覆盖不可撤销建议先备份)+ 导入明细加 canvases/freeform 组数。

### 验证
474 web 测试 + 285 引擎测试 + build exit 0 + tsc 零新增。

---

## 2026-06-24 · dsl-productize · 转义产品化 · DSL 模态编辑器(核心卖点可见)

转义(画布↔文字 DSL 双向)是 cy's Stift 的核心卖点,但此前只在 AI layout 按钮后跑——`handleAILayout` 把画布序列化喂 AI,AI 返回 DSL 静默 apply,用户全程看不到文本。核心卖点对用户完全不可感知。本轮让它从"架构能力"变成用户可摸到的一等公民功能。3 步 TDD(subagent 编排)。

### 修复
- **serializeCanvasReadable**(`7020f1c`):新增面向人的序列化变体——每元素一行(同 serializeCanvas),card 行后附 `  # title: <title>` 注释(parser 逐行 trim 后 `#` 不匹配 `[kind` 前缀 → 静默跳过,apply 无影响)。不动 serializeCanvas(保 e2e 逐字节往返断言)。title 换行压平防破坏单行。
- **DslDialog 组件**(未push):工具栏加 DSL 按钮(不门控 aiEnabled,所有用户可用)→ 模态:textarea 显示当前画布文本,可编辑/粘贴,应用/复制/下载。复用 parseDsl + applyLayout + serializeCanvasReadable,零新逻辑;应用走 host.batch 单 undo 步,不关闭模态供继续编辑。照 export-dialog 结构(Modal+Button+内联 token 化 style+pushToast+i18n)。

### 结果
转义成为用户可感知的双向功能:用户能直接看到画布的文字形态、编辑它、应用回去;能复制/下载文本拿走。这是引擎几轮投资的回报点。card 保持 update-only(内容来自 CardService);freedraw 点序列不进 DSL(R2 隐私)。

### 验证
471 web 测试 + build exit 0 + tsc 零新增。

---

## 2026-06-24 · json-export-canvas · JSON 全量备份补画布几何(数据可迁移信念4 闭合)

审计发现 JSON 全量备份(`apps/web/src/lib/export-service.ts`)只读写 4 个 localStorage key(cards/media/drafts/settings),不含 canvas 列表和 freeform 几何 → 导入新设备画布全丢、卡片变孤儿。这是产品"数据可迁移"承诺(spec §1.2 信念4)的核心载体却裂的。2 步 TDD(subagent 编排)修复。

### 修复
- **Step A — 导出侧**(`08fd11d`):`ExportPayload` 加 `canvases` + `freeform` 两可选字段(复用 `CanvasFreeformSnapshot`,与 .cystift 同源 `CanvasElement[]`,三路径在"画布几何"上统一);`buildExportPayload`/`downloadExport` 改 async——读 canvases(localStorage 同步取 .snapshot,不触发 store hydrate)+ 遍历 canvas 读 freeform(OPFS 异步)。SSR 早退空 payload。
- **Step B — 导入侧**(`c9910e1`,闭环):`importFromJson` 改 async——写 canvases(纳入现有同步 snapshot+rollback 机制)+ freeform(OPFS 异步,在 localStorage 写成功后才写,best-effort 不纳入 rollback,覆盖语义);`ImportResult` 加 canvases/freeformCanvases 计数;向后兼容(旧 JSON 无这两字段→跳过)。

### 结果
JSON 全量备份 round-trip 闭环:导出含画布几何 → 导入新设备画布完整还原 + 卡片不孤儿(canvas 列表还原,card 的 canvasPosition.canvasId 对得上真实存在的 canvas)。

### 验证
464 web 测试(34 文件)+ build exit 0 + tsc 零新增。测试:完整 round-trip 还原(cards+canvases+freeform)+ 孤儿消除(card 带 canvasPosition 指向非 default canvas,往返后仍绑定)+ 向后兼容(旧 JSON)。

---

## 2026-06-24 · dsl-bidirectional-symmetry · DSL 双向对称补全(核心卖点"转义"修复)

审计发现核心卖点"转义"(画布↔文字双向,任何 AI 廉价驱动画布编辑)的基石是裂的:**两套序列化器分裂**。`serializeCanvas` 自洽往返但只测试用;`formatCanvasSnapshot`(生产喂 AI)手写格式与 parser 对不上——size 叉号、free shape 无 `#id`、card color 语法不一致 → 真实链路 SN→P→A 在 rect/text 整行读不回。且 prompt 教的语法与喂 AI 看的现状又不一致。9 步 TDD(subagent 编排,各一 commit)修复。

### 修复
- **legacy 清理**(`5920f3b`):删 parser `[free:` 死代码分支 + apply ellipse/note/line create + snapshot ellipse/note 输出;DslFreeOp 收敛为 rect/text 判别联合,applyFreeOp 参数改用 DslFreeOp 类型对齐。引擎层 LegacyCanvasKind/SVG/渲染分支保留(读旧画布需要)。
- **自由箭头完整 bbox 往返**(`b4625aa`/`67659ce`/`f262dea`):自由箭头(无 from/to,bbox 编码线段,w/h 可负表方向)此前 serialize 产空 `from # to #` → parser 丢弃整元素。serialize 区分关系/自由箭头(有 from/to→关系箭头;否则→`@pos+@size`+签名)+ SIZE_RE 支持负数;parse 无 from/to 走自由箭头 op(带 freeArrow/x/y/w/h);apply 自由箭头 create+update 路径(无需端点存在,负 size 保留)。
- **rect/text update-by-id**(`a70ec65`):applyFreeOp 永远 `uid('free')` 丢 op.id → rect/text 无法 update,每次 apply 新建叠上去。加 update 路径(对齐 applyArrowOp:op.id 命中同 kind 元素→覆盖提供字段保留其余;kind 不匹配或 id 不存在→create)。text create 不再硬编码 100×40。
- **统一 formatCanvasSnapshot**(`4157767`,核心):复用 `serializeElement`(唯一文法源)——对每个 snapshot 条目重建 CanvasElement 调 serializeElement,消除两套序列化器分裂。AI 看到的=serializeElement 输出=prompt 教的格式=parser 能读回的格式,三方一致。snapshotCanvas 补回 rect/text/freedraw 丢失的 id/color/w/h。
- **grey/gray 归一化**(`13b9ac4`):inferRelationType 严格匹配 `grey`(注册表英式),AI 写 `gray`(美式)反推失败→RelationPanel 显示无类型。归一化 gray→grey。
- **prompt 修正**(`cb61d0f`):对齐统一文法,说清 card update-only(内容来自 inbox)、rect/text 可 create/update、自由箭头 `@pos+@size`(w/h 可负表方向)、reuse `#id` update / omit create。
- **端到端往返测试**(`9步末`):新增 `dsl-e2e-roundtrip.test.ts`——serialize→parse→apply→re-serialize 逐字节比对,证明真实链路对 5 个 active kind 双向无损(现有 roundtrip 只到 parse,绕过了丢 id bug)。+ 生产链路自由箭头 bbox 修补(SnapshotArrow 加 x/y/w/h,自由箭头生产链路也完整往返)。

### 设计决策(用户定)
- 自由箭头做**完整 bbox 往返**(非标不往返)——彻底派。
- legacy 死代码**顺手清掉**(纯减法)。
- card 保持 **update-only**(AI 不建孤儿卡片,内容来自 CardService domain)。
- freedraw 保持**单向**(R2 隐私,点序列绝不外发 AI)。

### 验证
457 web 测试(34 文件)+ 280 引擎测试 + web build exit 0 + tsc 零新增。计划 `docs/plans/2026-06-24-dsl-bidirectional-symmetry.md`。

---

## 2026-06-24 · canvas-engine-polish · 引擎鲁棒性第五轮(渲染/导出层一致性)

交互矩阵探照灯扩到**导出维度**——实时渲染(`self-built-render.ts`)画对的、SVG 导出(`elements-to-svg.ts`)出错。根因:导出层是另一套独立 switch,没人保证与渲染 switch 对齐(同前几轮交互层缝同构,只是维度换到导出)。Explore subagent 系统扫描 + 主模型核对全文,修 2 高 2 中 1 低,各步 TDD 红→绿、独立 commit。

### 修复
- **H1 — SVG 导出 bbox 并集归一化负 bbox**(`42fd233`):自由箭头反向画 w/h<0,`unionBounds` 用 `x+w` 算 maxX 算反 → 并集尺寸为负 → 钳 1×1px,箭头导出崩/被裁(PNG 同路径)。实时渲染用 `arrowEndpoints`(支持负 bbox)、hitTest/选中框都 `normalizeBox`,唯独导出 bbox 并集漏。修 `boxes.map(normalizeBox)`,与渲染/交互层同源。
- **H2 — SVG text 尊重 el.color**(`c7f0780`):text 分支 fill 硬写 `c.textCol`(恒 `--color-black`),实时渲染却用 `colorOf(el.color)`;rect/freedraw/arrow 导出都用了 `colorOf` 唯独 text 漏 → 彩色 text 实时画对、导出变黑。修 `fill=colorOf(el.color, tokenResolver)`。测试注入 stub `TokenResolver`(jsdom 无 CSS 变量,`domTokenResolver` 黑蓝同回退无法验红)。
- **M1 — SVG text 多行**(`11c9f6c`):单个 `<text>` 的 `\n` 不换行,render 按 `split('\n')` 逐行行高 18。修逐行 `<text>`、y 递增 18、纯空文本早退(对齐 render line 171)。
- **M3 — SVG rect 负 bbox**(`11c9f6c`):SVG 负宽高不渲染,Canvas 2D `ctx.rect` 支持负值(导入 upsert 不经 MIN_SIZE clamp 可造负 rect)。修 `normalizeBox` 后正宽高。
- **L1 — freedraw 单点可见**(`23378df`):单点(纯点击造)只 `moveTo` 无 `lineTo` → `stroke` 画不出 = 不可见幽灵;SVG 同理 `d="M x y"` 空 path + `fill=none`。修 render `arc`+`fill`、SVG `<circle r=2>`,两视图半径/颜色同源(`colorOf`)。

### 审后不修(归别处)
- **M2 JSON 导出不含画布几何**:apps/web `export-service` scope,需先确认是否刻意只管 card → 单独议。
- **M4 自由箭头 DSL 往返整元素丢失**:归 DSL 双向 P0 缺口(arrow 那条),归 DSL 轮次。
- **L2/L3 SVG text 基线/body 换行精确对齐**:SVG 无 `measureText`,精确对齐成本高,接受差异。
- **L4 borderPoint 负 bbox 端点**:仅导入可造,极边缘,YAGNI。

### 验证
280 引擎测试 + web build exit 0。计划 `docs/plans/2026-06-24-engine-interaction-hardening-5.md`。

---

## 2026-06-23 · canvas-engine-polish · 引擎独立化 + P3/P4 衔接打磨 + AI cluster

P2 引擎抽包后的衔接打磨 + 增值功能。

### 画布引擎独立化(北极星)
- 自研画布核心抽成 **`packages/canvas-engine`**:零业务依赖 / 框架无关 / token 注入 / 独立测试套(156)+ README + standalone 活证据。ADR `docs/adr/2026-06-23-canvas-engine-extract.md`。

### P3 衔接打磨
- **undo coalescing**:拖拽 / resize 的连续变更合并为 1 undo 步(`a108c34`)。
- **`.cystift` 拖放几何恢复**:拖放建新画布无 host,freeform 几何曾静默丢失;现持久化到新画布 `canvasFreeformStore`,新 host mount 时 hydrate(`566bf46`)。
- **确定性 z 序**:z 序升级为模型属性,`KIND_LAYER` 固定分层(rect<freedraw<card<arrow<text,同 kind 保插入序),`getElements` 稳定排序 → 渲染/hitTest/SVG/快照/DSL/.cystift 五视图一致,reload 视觉不变(`ff34c3c`)。

### P4 增值
- **minimap 鸟瞰导航**(`aec2480`)。
- **渲染性能基线**:`render.bench.ts`(renderElements 100=0.3ms/1k=3.4ms/5k=24ms 线性;sortByLayer 每帧<2% 非热点;hitTest<5µs),填 STATE 未压测盲点(`dfe33dc`)。
- **AI 找相似(cluster)**:读画布卡的 allowlist 字段 → AI 分组近重复/相似卡 → 落 `related-to` 关系箭头连组内成员(**非破坏性**:只加关系,不合并/删卡)。防御性输出解析(白名单 id 校验 + 绝不抛)。新 `cluster.ts` 纯逻辑 + 20 单测。
- **手绘语义识别(辅助)**:选中手绘 → **本地几何启发式**(直线度/闭合度/细长比)粗判「像箭头/装饰」+ 置信度,**点序列绝不外发**(笔迹隐私,R2)。装饰可一键【复制】偏移副本(画一次到处盖)。非破坏性,不自动改。新 `freedraw-classify.ts`(引擎纯函数,零依赖)+ 15 单测 + `FreedrawPanel`。

### AI 隐私(cluster)
- 走 `serializeCardsForAI`(allowlist + 软删除过滤);无 `source.deviceId` / 无 `media.dataUrl` / 无 vision。`docs/user/privacy.md` 更新 AI 动作清单 + cluster 说明。

### 引擎离线鲁棒性 + 手绘底座(2026-06-23 第二批)
- **setView 自我防御**:`sanitizeView` 净化脏 view(zoom 钳 [0.1,8] + 非有限值兜底)——引擎独立资产不信任调用方(.cystift/localStorage/AI 传 zoom=0/NaN 会让 screenToPage 除 0,整块画布交互失灵)。
- **手绘移动 bug 修复**(底座):freedraw 真身=`meta.points`(绝对坐标),drag/resize 此前只改 bbox 不变换点序列 → 拖动/缩放手绘笔画原地不动。这是边界疏漏(freedraw phase 不管 move,move phase 只用 card 测,落两 phase 交界缝隙;详见 plan §5 归因)。新 `translateFreedraw`/`scaleFreedrawToBox` + adapter 接线。
- **交互矩阵测试**:`self-built-interaction-matrix.test.ts` 遍历每种 kind × {drag,resize} 断言视觉真身变,先红(freedraw 两格)后绿——这类 kind×操作疏漏以后自动抓住,不靠人记得测。
- **手绘③ 猜箭头转真 arrow**:本地几何猜是箭头且够自信 → FreedrawPanel「转为箭头」一键替换(自由箭头,无 from/to)。`arrowEndpoints` 扩支持自由箭头几何端点 + `freedrawToArrow`。
- 全程守 R2 隐私:手绘点序列纯本地,不外发 AI(② AI 介入手绘按用户决定不做)。

### 引擎交互鲁棒性 · 第二轮(2026-06-23)
- **hitTest/选择 支持负 bbox**:自由箭头(`freedrawToArrow` 产出,w/h 可负表方向)带出新缝——hitTest/handleAtPoint/选中框按 `x..x+w` 取范围假设 w≥0,负 bbox 区间为空 → 反向自由箭头点不中/选不了/移不动(同 freedraw 移动 bug 同源)。`bounds.normalizeBox`(w/h<0 翻转)接入三处。
- **矩阵测试扩列**:hitTest(中心点命中自己)+ 键盘微移两列,先红后绿。键盘微移又照出 freedraw 只移 bbox 不移 points(同 drag),一并修。矩阵现全覆盖 card/rect/text/freedraw × drag/resize/hitTest/键盘微移——这类 kind×操作疏漏自动抓住。
- `bounds.ts` 补直接单测(此前仅经 svg/contract 间接覆盖)。

### 手绘形状识别升级 · \$1 recognizer(2026-06-23)
- 基于 Wobbrock et al. UIST 2007《A \$1 Recognizer》:把识别从「猜类别」(启发式 arrow/decoration)升级到「认具体形状」(圈/方/三角/对勾)。
- `gesture-recognizer.ts`:论文 Appendix A 4 步(resample / rotate-to-zero / scale-to-square+translate / GSS 搜角)→ {name, score[0..1]},~100 行纯几何零依赖。注:论文伪代码 atan2(c−p0) 配 −θ 落 180°,改 atan2(p0−c) 使指示角真归 0(GSS ±45° 才有效)。
- `gesture-templates.ts`:内置 circle/rect/triangle/check 模板 + `recognizeShape`(score≥0.7 认,否则 unknown 不硬猜)。箭头不进 \$1(1D 细长踩非均匀缩放坑)。
- **全程本地,点序列不外发**(选 \$1 的核心原因——守 R2 隐私,不做②AI 介入手绘)。FreedrawPanel 升级显示具体形状。
- 诚实记论文限制:旋转/缩放/平移不变 → 无法区分朝向/比例。

### 引擎交互鲁棒性 · 第三轮(2026-06-24)
- **关系箭头可选中(修真 bug)**:关系箭头(connect 创建)bbox w=h=0 → hitTest/marquee 按 bbox 命不中 → 选不了/删不掉/改不了关系类型。矩阵探照灯照出(测试此前零覆盖「arrow 能选中」)。修:`hitTest` arrow 走线段距离命中(点到 from→to 线段距离<6px/zoom;+zoom 参数);`marqueeSelect` arrow 走线段-框相交(端点在内或线段穿框)。自由箭头统一走线段。
- 矩阵扩「关系箭头选中」列(中点命中/偏离/框选)+ hittest/marquee 单测固化。线段几何:pointToSegmentDistance + segmentIntersectsRect(segSeg 跨立判定)。

### 引擎交互鲁棒性 · 第四轮(2026-06-24,Explore subagent 扫描)
- **undo/restore 同步选区**:restore()(undo/redo 调)不刷新 selectedIds → undo 撤元素后幽灵 id 残留,后续 Delete/方向键/handle 取到 undefined 静默失效。修:restore 末尾过滤 selectedIds∩快照 id + 条件 emit。
- **删端点元素级联删悬空箭头**:删一个 card,连它的关系箭头端点解析失败→消失但残留(幽灵元素,占 id/进快照/reload 仍悬空)。修:remove() 级联删 from===id||to===id 的 arrow(1 步 undo,drawio/tldraw 惯例)。自由箭头不受影响。
- **删 dragId/dragOffset 死代码**:dragOffset 从未赋值、dragId 分支永不可达(dragGroup 已覆盖)。纯减法。
- 审后不修(YAGNI):connect 连 arrow、setTool 清 connecting、resize 多选/arrow、pan 上限。



开发者反馈(2026-06-22)的 2 个交互 bug + 收尾整理 + 战略讨论档归档。

### 交互修复
- **橡皮擦卡片后刷新还在**(交互不一致):`bindCardWriteback` 只监听 `changes.updated`,不监听 `changes.removed` → 橡皮擦掉 card shape 但 CardService 没同步,刷新后 `loadCardsIntoEditor` 重建。现 user-source 的 card shape 移除 → `service.softDelete`(→ /trash,可恢复,与卡片详情的删除一致)。programmatic 移除走 mergeRemoteChanges 不会误触。
- **设置里的中英切换无效**:settings page 直接调 `settingsStore.updateLocale`,但 `I18nProvider` 只在 mount 时读 locale + 经自己的 `setLocale`,没订阅 store → provider React state 不更新 → `t()` 还用旧 locale。修:settings 改走 `useI18n().setLocale`;**并**让 provider 订阅 `settingsStore.subscribe`,任何路径改 locale 都 reactively 跟随。
- **右上角语言切换去掉**(用户要求只保留设置里的):删 `app-menu.tsx` 的 中/EN toggle(含 CSS)。

### 代码整理(v0.37.0 review 收尾)
- 删 db `./persistence` 断链 export、`@cys-stift/config` 死包(3 行 + 断链 export + 零消费)、storage-usage 孤儿 `CATEGORY_LABEL` export、db "persist across restart" no-op 测试。
- `rehydrateCards`:loadSnapshot 总返新数组,`!== _cards` 永真 → 每次跨 tab storage event 都 notify 全部 useDb 消费者。改内容签名(length + 首尾 id)。
- `WorkspaceRepository.getDefault` 加 `ORDER BY createdAt asc`(多 workspace 确定性)。
- dsl-parser 跳过缺 from/to 的 arrow op + noUncheckedIndexedAccess。

### 许可 + 作者
- **LICENSE**:GPL-3.0-or-later(gnu.org 全文 + 项目版权声明)。
- **package.json**:`license`/`author: "cy"`/version 0.37.0。
- **git 历史重写**:26 个 commit 的 author "Claude (main) <claude@anthropic.com>" → "cy"(filter-branch,无 remote 安全)。现 168 commit 全部 author = cy,0 Claude 残留。

### 战略讨论档
- `docs/plans/2026-06-22-canvas-strategy-tldraw-vs-self-build.md`(proposal):tldraw 依赖评估 + 自研路径 + 文本描述语言 + 基座更换 + 行动时间表。未定决策,供团队讨论。

### 验收
domain 51 / db 7 / web vitest 173 / 3 包 tsc 全绿 / web build 0。

---

## 2026-06-21 · v0.37.0-stable · 全量加固 + 文档重构(第二个稳定版)

全量 review(4 并行 reviewer + 交叉验证)驱动的加固轮。**代码:真 bug 全修 + tsc 门禁真正生效 + 隐私 allowlist 边缘补齐。文档:收敛到单一可信源 STATE.md。** 分 7 phase 独立 commit。

### Phase 1 — 代码 P0 真 bug(`0b0e5db`)
- **键盘 r/o 快捷键**:toolbar 矩形/椭圆按钮上一轮只修了 click 路径,键盘快捷键仍调 `setCurrentTool('rectangle')` 静默失败。路由统一到 `activate()`(useCallback)。
- **prompts.ts 软删除回退绕过 allowlist**(隐私规则 #3 ⚠️):`ctx || raw` 回退对软删除卡触发,泄露 title/body。`deletedAt` 守卫移到 `||` 之前。+3 测试。
- **画布切换丢卡片拖动位置**(🔴):`bindCardWriteback` cleanup 清 timer 不 flush → 拖卡后立即切画布丢最后一次位置。改 teardown 同步 flush。
- **画布切换丢手绘/自由元素快照**(🔴):EditorBindingBridge 同类 bug,500ms 快照防抖 cleanup 不存。改 pending 时 fire 一次 save。
- **`.cystift` 拖回恢复静默失败**:FileDropHandler 读异步 gap 的 `window.__cardService`,改从 `useDb()` 拿 service。
- vitest 162 → 165,web build 0。

### Phase 2 — tsc 门禁 + 存储字节精度(`a8992a7`)
- **修 domain tsc 2 error**(card-service `media[0]?` optional-chain + search LinkPreview `fetchedAt`)。
- **ui tsc**:`packages/ui/src/css-modules.d.ts` ambient 声明。
- **storage-usage**:`raw.length`(UTF-16)→ `new Blob([raw]).size`(UTF-8 字节)。zh + base64 低估 ~2x。+4 测试。
- domain/db/ui `tsc --noEmit` 全绿;vitest 165 → 169。

### Phase 3 — 正确性 + CI 门禁(`1468ae4`)
- **SQLite 持久化丢 tags**(🔴 latent):schema/codec 无 tagsJson 列,P4 标签走 SQLite 被丢成 `[]`。补 `tags_json` 列 + codec + DDL + round-trip 测试。
- **删 MediaAsset 孤儿**(YAGNI):type+table 存在但无 repository(保留 `MediaAssetId` brand,MediaRef 用)。
- **canvas-editor onMount race**:`onEditorReady` 从异步 `.then` 提到同步顶部,缩小 dblclick/drag 在 writeback 订阅前的 race 窗口。
- **AI provider 卡死防护**:抽 `consumeStream()`(openai/anthropic/ollama 共享)。abort 保留部分内容(原 AbortError 丢光);max-iteration backstop(代理返回非 SSE 不再死循环);`catch` 不再静默吞。+4 测试。
- **CI 真门禁**:`.github/workflows/ci.yml` 加 typecheck 步(domain/db/ui tsc)。原 "test = tsc && vitest" 注释是假象,test 脚本只有 vitest,类型错误静默通过。
- domain 51/51,db 8/8,web vitest 173/173,3 包 tsc 全绿,build 0。

### Phase 4 — 补建 git tag
- v0.9.2 之后 v0.10–v0.36 共 ~42 个 tag 全部缺失(文档引用了不存在的 tag)。从 git log 还原每个版本的交付 commit,人工核对后 `git tag`。现在 `git tag | sort -V` 连续到 v0.36.0。
- v0.27.1-review-hardening 无独立 tag(工作折进 v0.31.0 refactor)。

### Phase 5 — 文档目录扁平化(`265 files renamed`)
- `docs/memory/decisions` → `docs/decisions`,`docs/memory/feedback` → `docs/feedback`,`docs/superpowers/{plans,specs}` → `docs/{plans,specs}`,`docs/ralph/` → `docs/archive/ralph/`,`docs/evaluation-*` → `docs/archive/`,`docs/development/changelog.md` → `docs/changelog.md`,`docs/design/screenshots/` → `docs/screenshots/`。11 嵌套顶层 → 扁平集 + `docs/archive/` 隔离死流程。

### Phase 6 — STATE.md + 模板 + 断链清扫
- **新建 `docs/STATE.md`**(唯一当前状态源)+ `scripts/gen-state.mjs`(从 git tag 生成版本表)+ `scripts/gen-decisions-index.mjs`(从文件生成 INDEX.md)+ `docs/decisions/_TEMPLATE.md`(决策档模板)。
- **删 current-session.md**(落后 18 版本,STATE.md 取代)。
- 根 CLAUDE.md 600 字 stale 状态行 → 指向 STATE.md。
- 全量断链清扫(phase 5 移动产生的):0 个旧路径残留。
- 9 个未来日期 `2026-06-23` → `2026-06-21`。
- `architecture/overview.md` 重写(原冻 Phase 0 + 错栈 wa-sqlite)。
- `README.md` 状态段重写。
- ADR-0003 标 superseded。

### 验收(全绿)
```
pnpm --filter domain lint  && pnpm --filter db lint  && pnpm --filter ui lint  # 3/3 tsc
pnpm --filter domain test   # 51/51
pnpm --filter db test       # 8/8 (+1 tags round-trip)
pnpm --filter web exec vitest run  # 173/173 (+8: prompts rule#3 + storage + stream-reader)
pnpm --filter web build     # exit 0
node scripts/gen-state.mjs  # 重生成无 drift
git tag | sort -V           # v0.1.0 → v0.37.0 连续
```

### DEFERRED(记入 STATE.md 已知 debt,稳定版不做)
- 颜色类型双轨制统一(ColorToken 6 色 vs TagColor 10 var)—— touches domain+UI+所有 tag 渲染,风险大。
- Tauri Apple 签名公证(P9,需证书)。
- 51 个旧 decision 批量加 frontmatter(模板已就位,新档用它,旧档机会主义采纳)。

详见决策档:`docs/decisions/2026-06-21-p4-p7-batch.md`(review 综合)+ 各 phase commit。

---

## 2026-06-21 · v0.33.0-canvas-export

P5(画布导出 + `.cystift` 往返 — 做出特色):

- **`.cystift` 往返(特色)**: 导出的 SVG/PNG 内嵌完整画布(卡片 + tldraw 快照 + 画布元数据)。拖回应用即在新画布恢复 — 单文件便携卡片(drawio P5-7 套路,移植到 tldraw 栈)。PNG 走自写 `tEXt` chunk(键 `cystift`,纯 TS 含 CRC32);SVG 走 `data-cystift` 属性。
- **导出管线**: `editor.getSvgString` + 字体嵌入(`await document.fonts.ready` + base64 @font-face,**不走 Google Fonts `@import`**)+ 图片外链内联。PNG 走 `getSvgAsImage`。
- **getSvgString 首调 undefined 重试**: tldraw 新会话首次导出可能返回 undefined;10×150ms 重试兜底(真实用户卡片刚建即导出也会撞上)。
- **Bauhaus 导出对话框**: format(SVG/PNG/JPEG)/ scope(整张/选中)/ scale(1×2×3×)/ border / background(透明/白底) + `.cystift` 高亮卡(黑底红影,特色 callout)。`getSafeFileName` 抄 AFFiNE。
- **零 domain/db 改动**(纯加法)。vitest 21→52(+31:export-bounds 18 + png-text-chunk 8 + cystift-payload 5)。e2e p5-export PASS(PNG tEXt + SVG data-cystift 都往返解出 app=cys-stift, cards=1)+ canvas-refactor 无回归。
- **不做**: PDF/打印 / webp/dpi / JPEG 带 cystift。
- 参考分析: `docs/development/reference-patterns.md` §P5(drawio + AFFiNE)。

---

## 2026-06-21 · v0.31.0-debt-cleanup

P1(技术债清扫 — 零行为变化):

- **canvas-editor.tsx 拆分**: 347→166 行。3 个 bridge 抽到独立文件(`canvas-view-persistence-bridge.tsx` 53 行 / `canvas-editor-binding-bridge.tsx` 59 行 / `canvas-double-click-bridge.tsx` 111 行)。每个 bridge 是 null-returning 组件,独立 useEffect,可单测。
- **B8 修正**: `__canvasEditor` global **保留**(e2e 17 处引用,grep 确认),加注释说明 diagnostic + e2e 友好 hook。`__cardService` 改走 React Context(`CardServiceContext` 已存在),relation-panel / auto-relate 不再读 global,`card-service-access.ts` 删除。
- **顺带修预存 bug**: db-client.ts 新增 `rehydrateCards` 导出(M3.2 commit 引入 import 但函数丢失,build 阻塞)。用现有 `loadSnapshot()` 复用 Date 重建逻辑。
- **canvas-snapshot-store 单测**: 9 个 it(save→load 往返 / corrupt JSON 容错 / SSR no-op / quota 异常不 throw / canvas 隔离 / remove no-op),为 P3 B6 offload 铺安全网。
- **测试**: vitest 12 → 21(12 AI + 9 snapshot-store);domain 26/26;db 7/7;build exit 0
- **e2e**: m3 7/7 + canvas-refactor PASS + m1 7/8(1 个预存 bug 与本次无关)
- **新增 P1.5 决策档**: [`docs/decisions/2026-06-21-debt-cleanup.md`](../decisions/2026-06-21-debt-cleanup.md)

详见决策档。

---

## 2026-06-21 · v0.30.0-ai-accessibility

AI 可访问性 & 隐私设计(**纯文档**,无代码改动):

- **`docs/user/privacy.md`**:中英双语,UI 友好。AI 看到什么 / 看不到什么 / 怎么关 / 关了会怎样 / API key 怎么存 / 多 provider 行为差异 / 手绘 = 几何描述 / 多模态不做
- **`docs/development/privacy-design.md`**:开发面向。三条原则(显式 allowlist / 手动 / 本地优先)、手动 AI context 流程、12 项 phase check-list、`ai-context.ts` API 设计、`canvas-snapshot.ts` schema、DSL 输出格式、测试要求、未来扩展
- **决策档**:`docs/decisions/2026-06-21-ai-accessibility-design.md`
- **用户原话归档**:`docs/feedback/2026-06-21-ai-feedback.md`
- **关键决策**:
  - 手动 `ai-context.ts` allowlist,不自动化 codegen
  - 多模态(GPT-4V / Claude Vision)**永久不做**
  - 手绘内容 = 客户端几何描述(启发式 line/rect/ellipse/note/draw 原笔触),不走 vision
  - media 二进制永不外发,只发 metadata
  - 软删除的卡不在 AI 视野
  - 每个 phase 改 AI 必走 check-list(privacy-design.md §7)
- **CLAUDE.md 更新**:加 v0.30.0 记录 + M3.1 实装候选清单
- **`apps/web/CLAUDE.md` 更新**:加 AI 改动 check-list(简版)
- **MEMORY.md 更新**:加索引

**M3.1 实装任务不在本 phase**:ai-context.ts / canvas-snapshot.ts / dsl-parser.ts / toolbar "📐 AI 排版" 按钮(~ 400 行,基于本文档设计)

详见 [`docs/decisions/2026-06-21-ai-accessibility-design.md`](../decisions/2026-06-21-ai-accessibility-design.md)。

---

## 2026-06-21 · v0.29.0-canvas-m3-ai

M3(AI 元素 — 完全可选 / 本地优先 / 密钥不外泄):

- **3 个 AI provider**: OpenAI (Bearer + chat/completions + SSE) / Anthropic (x-api-key + messages + content_block_delta) / Ollama (NDJSON + 本地) — 不开 SDK,纯原生 HTTP + eventsource-parser
- **/settings AI 面板**: provider 下拉 / baseUrl / model / API key password(show/hide toggle)/ 启用 toggle / 测试连接 / 明文警告 banner
- **卡片 AI actions**: Summarize / Rewrite / Translate(zh↔en), inline popover 流式输出 + Replace / Append as new / Cancel 三选项
- **画布 AI auto-relate**: 选中 ≥2 卡 → 对每对推断关系类型 → 创建箭头(复用 M2.1 `createArrowFromHandle`)
- **Provider factory maker pattern**: apiKey 闭包进 instance,工厂存 maker 函数而非实例
- **零 AI 配置时 UI 完全干净** — AI 按钮在 `ai === null || !enabled` 时不渲染(不是 disabled),符合本地优先不打扰原则
- **vitest 引入** — web 包从 0 到 12 单测(纯函数 + provider factory + safe-href AI 校验)
- **新 dep**: eventsource-parser (1 runtime) + vitest + @vitest/ui + jsdom (3 dev)
- **e2e**: `scripts/m3-shots.cjs`(7/7 passed)

详见 [`docs/decisions/2026-06-21-canvas-m3-ai.md`](../decisions/2026-06-21-canvas-m3-ai.md)。

---

## 2026-06-21 · v0.28.0-canvas-m2-smart

M2(画布智能化 + 多模态入口 + 传递出口): P0/P1 四个能力 + 单卡导出最简形态。

- **edge connector drag**: 卡片 4 边中点显示 vertex handle, 拖到目标卡松手即建绑定箭头 → `card-handles.ts` + `card-shape-util.tsx` (onHandleDragEnd 走 M1 验证的两步走)
- **文件多模态拖拽粘贴**: 拖入 .md/.txt/.csv/.html → 文本卡; .docx/.xlsx/.pdf/.pptx/.epub → markitdownllm 转 md + 原文件 media ref; 图片 → mediaStore image 卡 → `file-capture-sink.ts` + `file-drop-handler.tsx` + Toast 提示
- **智能关系类型推断**: 拖出箭头后读取源/目标卡内容做关键词匹配, auto-apply 默认 relation type → `relation-inference.ts` + `relation-panel.tsx` (`__cardService` 诊断 hook)
- **浮动关系面板**: panel 位置改为浮在 arrow 旁 (用 `getShapePageBounds` 计算) → `relation-panel.tsx`
- **单卡导出 Markdown**: card-detail 加 Export 按钮 → `serialize-card.ts` (frontmatter + body + 媒体 + links + code + quotes) → `export-card.ts`
- **新 dep**: markitdownllm 0.1.5 + pdfjs-dist 6.0.227 (markitdownllm 的 pdf 转换依赖)
- **e2e**: `scripts/m2-shots.cjs` 6/6 passed (edge connector + inference + floating panel + file drop + export)

详见 [`docs/decisions/2026-06-21-canvas-m2-smart.md`](../decisions/2026-06-21-canvas-m2-smart.md)。

---

## 2026-06-21 · v0.27.1-review-hardening

大规模代码复审修复(domain + web + canvas + import + CI,grep 4 agent → 18 findings 全修):

- **domain**:修复 12 个 TS 类型错误(wspaceId/fetchedAt/pinned/index-access)、softDelete 幂等、ensureDefault 签名(不再悬空 canvas)、UpdateCardPatch.color → ColorToken 解耦、test 脚本加 `tsc --noEmit` 门禁(db 加同)
- **数据丢失**:导入后 rehydrateCards() 防本 tab 覆盖、跨 tab storage 走 parseCardsRaw(Date 重建)、syncCardsToEditor 几何 reconcile(B3-bis)
- **M1 label**:relation arrow 写 `text` prop(之前误用 richText 失败,注释错误,已修)
- **import XSS**:links[].url http(s)/mailto/tel 白名单、media dataUrl image/\* base64 校验 + 大小上限、safe-href 共享工具
- **canvas 生命周期**:writeback + snapshot listener 迁 EditorBindingBridge useEffect(清除 __canvasEditor = B8)
- **web**:删除 unused deps(better-sqlite3/@cys-stift/db/@types)、/dev/\* prod 门禁(NODE_ENV)、scrim token("rgba leak"修)、search/settings/design 加 role="main"
- **CI**:新增 `.github/workflows/ci.yml`(domain+db 带有 tsc 门禁的 test + web build)
- **决策**:`docs/decisions/2026-06-21-canvas-bugfixes.md` 更新(UI polish + label fix notes)

---

## 2026-06-21 · v0.27.0-canvas-m1-relations

M1(画布关系):给 tldraw arrow 加语义关系类型。

- **关系类型 registry**: 4 内置(blocks/references/derived-from/related-to),映射到 arrow 原生 color/dash/arrowhead/labelColor → `relation-types.ts`
- **关系面板**: 选中单个 arrow 浮出 4 类型按钮,点击重写 arrow 原生 props + 数据属性 `data-relation-id` 供 e2e → `relation-panel.tsx`
- **卡片连接徽标**: 卡片左下角显示 `× N`(N = 连接到该卡的 distinct arrow 数,`getBindingsToShape` 去重)→ `card-shape-util.tsx`
- **持久化透明**: 关系全在 arrow record,snapshot 自动保存,无新持久化层
- **e2e**: 建两卡+绑定箭头+选 Blocks+reload 持久 + 徽标 + infer 反查 → `scripts/m1-relations-shots.cjs` 8/8

详见 [`docs/decisions/2026-06-21-canvas-m1-relations.md`](../decisions/2026-06-21-canvas-m1-relations.md)。

---

## 2026-06-19 · phase 0 · scaffold

**交付**：pnpm monorepo 骨架 + Next.js（静态导出）+ Tauri 桌面壳 + 包豪斯占位首屏 + 完整文档与工程化配置 + git init。

**关键点**：

- 全 local-first 架构在仓库结构层就位（apps/web 静态导出、apps/desktop Tauri 壳）
- 6 个 ADR、4 份决策记录、token 文档、setup 指南落地
- **零业务逻辑**——首屏是占位页，所有功能留后续 phase

**验证**：

- `pnpm install` ✅
- `pnpm --filter web build` → 静态产物
- `pnpm tauri dev`（待 Rust 装好）
- Windows 端复验待切到 Windows 后进行

详见 [`docs/plans/2026-06-19-phase-0-scaffold.md`](../plans/2026-06-19-phase-0-scaffold.md)。

---

<!-- 未来 phase 在此追加 -->

## 2026-06-19 · phase 1 · design system

**交付**：`packages/ui` 从占位升级为真组件库；7 个核心组件（Button / Input / Card / Tag / Toolbar / Modal / Tooltip）；`/design` 视觉契约页面；Tailwind v4 接入。

**关键点**：

- tokens 拆成双源：`tokens.css`（CSS variables）+ `tokens.ts`（TS 对象 + 类型），Tailwind preset 注入 `@theme`
- 6 原色 / 8px 网格 / 字体 / 边框阴影全部锁在 token 集里，组件层只引用
- `/design` 是视觉契约：每个 token、每种字体、每个组件变体都看得见
- 视觉对照笔记（带逐项打勾）+ 三张截图归档到 `docs/design/screenshots/phase-1/`

**验证**：

- `pnpm --filter web build` → 静态产物 101 kB First Load JS
- 6 色 hex 全对（spec §5 vs 截图）
- 7 个组件每个在 `/design` 有可见展示
- Modal / Tooltip 静态截图受限（hover/click 触发），交互验证留后续 phase

详见 [`docs/plans/2026-06-19-phase-1-design-system.md`](../plans/2026-06-19-phase-1-design-system.md) + [`docs/design/screenshots/phase-1/README.md`](../design/screenshots/phase-1/README.md)。

## 2026-06-19 · phase 2 · data layer

**交付**：`packages/domain` 从占位升级（types + codec + Card/Canvas/Workspace services + 6 个 vitest 通过）；`packages/db` 从占位升级（Drizzle schema 四表 + 7 个 SQLite 集成测试通过）；`/dev/db` 烟测页 + 客户端 db-client（in-memory + localStorage 后端）；puppeteer 持久化证据脚本。

**核心承诺验证**：

- UI 写 3 张卡 → 跨刷新 → 3 张卡完整保留 ✅（puppeteer 自动化断言）
- 6 色 token / 字体 / 网格在数据层 UI 仍对 ✅
- 4 张截图归档：`docs/design/screenshots/phase-2/`

**关键工程决策**：

- `packages/db` 用 **better-sqlite3** 跑通 SQL + drizzle schema，集成测试完整。浏览器侧 `db-client.ts` 走 in-memory + localStorage 占位后端，Repository 抽象保留 — Phase 2.5 替换 in-memory 为 wa-sqlite，business code 不动
- `useDb()` hook 修了一个 SSR/客户端 hydration 引用稳定性问题（snapshot object 必须在数据变化时才重新分配）

**已知 / 后续**：

- Web 端 wa-sqlite + OPFS 替换 localStorage（Phase 2.5）
- Tauri 端 Tauri fs 落盘验证（Phase 6/8）
- MediaAsset 真实落盘（业务用，Phase 3+）

详见 [`docs/plans/2026-06-19-phase-2-data-layer.md`](../plans/2026-06-19-phase-2-data-layer.md) + [`docs/design/screenshots/phase-2/README.md`](../design/screenshots/phase-2/README.md)。

---

## 2026-06-19 · phase 3 · inbox business

**交付**：`/inbox` production 路由（`apps/web/src/app/inbox/page.tsx`，`'use client'`）；多媒介卡片创建表单（标题 / body Markdown / 链接 / 代码块 / 引用）；卡片详情 Modal + 编辑 Modal；归档 tab + 软删二次确认；Markdown 渲染（`react-markdown@9` + `rehype-sanitize@6`）；首页加入口；`CardService.update()`；视觉对照笔记 + 8 张截图。

**核心承诺验证**：

- UI 创建多媒介卡（链接 + 代码 + 引用）→ 详情渲染 / 编辑 / 归档 / 软删 全部走 `CardService` ✅
- 跨刷新保留（puppeteer 自动化断言：3 张卡 → 2 active + 1 归档 跨 navigate 仍在）✅
- 6 色 token / 字体 / 网格在 `/inbox` 仍对（视觉对照笔记逐项打勾）✅
- 8 张截图归档：`docs/design/screenshots/phase-3/`

**关键工程决策**：

- **新依赖只加 2 个**（plan §1 限定的）：`react-markdown@9` + `rehype-sanitize@6`。React 19 peer 警告已知但运行时无碍。
- **`CardService.update(id, patch)`**：P3-T1a 加，domain 零依赖特性保持；4 个新 vitest 覆盖（whitelisted fields only / unknown id / bumped updatedAt / multi-media 替换）。
- **Detail Modal 编辑模式简化**：只暴露 title + body（plan §3 P3-T3 描述），多媒介编辑留 Phase 3.5。Modal 内显式提示"intentionally not exposed (Phase 3 MVP)"。
- **Markdown 渲染安全**：`rehype-sanitize` + 自定义 `a` 组件再做 `http/https/相对` 协议白名单（防 `data:` 等绕过 sanitize）。链接统一 stamp `target="_blank" rel="noopener noreferrer"`。
- **toolbar Tag 随 view 切换颜色**：active 红 / archived 蓝，数字 = 对应视图的卡数。
- **路由静态导出**：`/inbox` 是静态路由（无 `[param]`），走客户端状态（detail modal / view tab）。

**已知 / 后续**：

- 编辑多媒介（详情 Modal 增量）→ Phase 3.5
- tldraw 画布位置 → Phase 4
- 全局快捷键 + mini input → Phase 6
- wa-sqlite + OPFS 替换 localStorage → Phase 2.5

详见 [`docs/plans/2026-06-20-phase-3-inbox.md`](../plans/2026-06-20-phase-3-inbox.md) + [`docs/design/screenshots/phase-3/README.md`](../design/screenshots/phase-3/README.md)。

---

## 2026-06-19 · phase 4 · canvas

**交付**：`/canvas` production 路由（`'use client'`，静态导出）；tldraw **v3.15.x** 客户端懒载挂载（挂载守卫 + 动态 import，静态导出安全）；Card 自定义 `ShapeUtil`（BaseBoxShapeUtil，白底黑边 8px 圆角 + Space Grotesk 标题）；§6.11 数据绑定（`listOnCanvas`→shapes 加载 + `editor.store.listen('user')` 防抖 ~300ms → `moveToCanvas` 回写）；双击空白建卡 + 复用 Phase 3 详情/编辑 Modal（编辑实时同步 shape、归档/删除即时移除）；首页加 Canvas 入口（黑 region）；`/dev/tldraw` 挂载回归 canary；6 张截图 + 视觉对照笔记。

**核心承诺验证（spec §6.11）**：

- tldraw v3 + React 19.0.0 + Next 15 静态导出：build exit 0 + puppeteer 真渲染零 page error（spec §12 风险 #1 清除）
- **位置持久化跨刷新**：puppeteer 断言 卡 x=100 → 拖动后 320（防抖回写 DB）→ 刷新后 320（位置存活）
- 双击建卡 / 点卡详情 / 编辑标题实时反映 / 归档即时移除 全流程断言通过
- 6 色 token / 字体 / 8px 点阵网格 / 黑 region 条 在 `/canvas` 仍对；`features/canvas/` hex grep 零命中

**关键工程决策**：

- **tldraw v3.15.6（非 v5）**：spec 写 v3；npm latest 已到 v5.1.1，但 v5 peer 要求 React ≥19.2.1（我们 pin 19.0.0），v3.15.6 peer `^18.2.0 || ^19.0.0` 正好匹配 + spec 对齐 + 不动 React。
- **客户端懒载 + 动态 import 边界**：tldraw 模块加载时访问 `window`，静态导出预渲染期会炸。边界划在 `tldraw-canvas.tsx`（`useEffect` 内 `import('./canvas-editor')`）——tldraw 代码只在浏览器 mount 后加载。tldraw ~2.1MB 独立 chunk，懒载不污染其他路由首屏。
- **shape id = `shape:` + cardId**：tldraw 强制 shape id 以 `shape:` 前缀。`cardToShape` 加前缀，回写时 `cardIdFromShapeId` 剥前缀还原 domain CardId——shape 与卡往返一致。
- **`mergeRemoteChanges` 避自激**：加载用 `editor.store.mergeRemoteChanges(() => createShape)` 标 remote 源；写回监听 `store.listen({source:'user'})` 只听用户拖动，不触发回写循环。
- **`pointerEvents: none` on HTMLContainer**：卡片 HTML 覆盖层若 `pointerEvents:'all'` 会吞掉 pointer、tldraw 拖不动。Phase 4 卡无内部交互 → 设 `none` 让 tldraw 接管选中/拖拽；开详情走 DOM dblclick + `getShapeAtPoint` 判空白 vs 卡。
- **`hideUi`**：隐藏 tldraw 冗余 chrome（形状工具条 / 菜单），保留选中/拖拽/缩放手柄。网格/缩放/对齐控件留 Phase 5。
- **editor handle 经 `onEditorReady` 提到 page**：Modal 在 page 层，save/archive/delete 后用 binding helper（`updateCardShape`/`removeCardShape`，均 mergeRemoteChanges）同步回 tldraw。
- **domain / db 零改动**：`CardService.create/listOnCanvas/moveToCanvas` + canvas 列 + 索引（Phase 2）已就绪；archived/deleted 过滤在 `loadCardsIntoEditor` 里做（不动 domain）。

**已知 / 后续**：

- 网格 snap / free 切换、缩放控件、对齐辅助线 → Phase 5
- 画布视图持久化（viewJson zoom/pan）、inbox → canvas send → Phase 5+
- Delete 键删 shape 与 DB 的同步（MVP 以 Modal 软删为准）→ Phase 5 打磨
- wa-sqlite + OPFS 替换 localStorage → Phase 2.5

详见 [`docs/plans/2026-06-19-phase-4-canvas.md`](../plans/2026-06-19-phase-4-canvas.md) + [`docs/design/screenshots/phase-4/README.md`](../design/screenshots/phase-4/README.md)。

---

## 2026-06-19 · phase 5 · canvas full

**交付**：`/canvas` 工具条右侧新增 snap/free 切换 + 缩放 4 按钮（−/%/+/FIT）+ 键盘快捷键（`+ - 0 1 g`）；tldraw v3 内置 snap 网格 + 指示线能力开箱即用，**0 新依赖**；snap 指示线样式覆盖为 `var(--color-black)` 1px；mobile media query 收紧 hint/dividers/百分比。

**核心承诺验证（spec §8 Phase 5 段：网格/自由模式、缩放、对齐）**：

- snap 模式拖动落点对齐 8px 网格：`+147px → x=488, 488%8==0` ✓（puppeteer 断言）
- free 模式拖动自由落点：`+147px → x=747, 747%8!=0` ✓（puppeteer 断言）
- 缩放 2x 步进（tldraw 默认）：100 → 200 → 400 → 800% ✓
- zoom to fit：3 张散卡全部进视口 ✓
- 键盘 `g` 切换 snap ↔ free ✓
- 6 色 token / 字体 / 8px 网格 / 黑 region 条 在 `/canvas` 仍对；`features/canvas/` + `app/canvas/` hex grep 零命中
- 10 张截图归档：`docs/design/screenshots/phase-5/`

**关键工程决策**：

- **`useState<Editor>` 替代 `useRef<Editor>`**：Phase 4 用 ref 留坑——ref 改值不触发 re-render，toolbar 按钮永远 disabled。Phase 5 第一个真依赖 editor 的功能（snap 切换）暴露。改 state 让 toolbar 跟着 mount 重渲染。
- **toggle 同时设 `isGridMode` + `user.isSnapMode`**：tldraw v3 这俩**是独立的**——`isGridMode` 是 snap 总开关（DefaultCanvas / Pointing / Translating 都读），`isSnapMode` 只是 Ctrl 反转行为。两者必须同步才能让"显示状态 ↔ snap 行为"一致。
- **`gridSize` 显式设 8**：tldraw v3 默认 10，spec §4.3 要 8。onMount 调 `editor.updateDocumentSettings({ gridSize: 8 })`。
- **缩放按钮用本地 `<button>` 而非 `Button`**：Button 40px 高 + padding 大不适合 47px 黑条内紧凑布局。本地按钮 height 32px 贴 toolbar 尺度，颜色/边框全走 token，不破坏视觉契约。
- **`window.__canvasEditor` 诊断 hook**：puppeteer 脚本读 live editor state（isGridMode / gridSize / camera z），window 暴露避免 monkey-patch。
- **snap 指示线覆盖为黑**：tldraw 默认饱和红（`hsl(0,76%,60%)`），包豪斯 red 保留给 inbox/capture 区域，canvas snap 用黑更克制（注册标尺感）。
- **0 新依赖**：沿用 `@tldraw/tldraw@3.15.6` + Phase 1-4 全套组件 + 全 token。

**已知 / 后续**：

- 视图持久化（zoom/pan/gridMode 写 `canvases.viewJson`；domain 需补 `CanvasService.updateView` + `CanvasRepository.update`）→ Phase 5+
- Delete 键与 DB 同步打磨（tldraw Delete → `CardService.softDelete`，需二次确认交互）→ Phase 5+
- mobile toolbar 横向溢出（390px 视口下 zoom 按钮仍溢出；hint/dividers/百分比已隐藏让 snap tag 可见，但 zoom 按钮在视口外）→ Phase 5+ mobile polish
- 自定义 snap threshold / 缩放曲线 / 旋转 snap → 后续打磨
- tldraw chrome 完整换肤 → 后续
- inbox → canvas send / 多画布 UI / `/canvas?id=` 深链 → 留后

详见 [`docs/plans/2026-06-19-phase-5-canvas-full.md`](../plans/2026-06-19-phase-5-canvas-full.md) + [`docs/design/screenshots/phase-5/README.md`](../design/screenshots/phase-5/README.md)。

---

## 2026-06-19 · phase 6 · capture entry

**交付**：`Cmd/Ctrl+Shift+Space` 全局快捷键（任意路由触发）→ Mini Input 居中浮层（spec §5.5：2px 红边框 + 顶部 8px 红条 + z-index 200）→ Enter 展开 body / Cmd+Enter 保存 → 走 `WebCaptureSink` (新) → `service.fromCapture({ source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'web' } })` → 卡进 `/inbox`。`CaptureSink` 接口 web 端落地（spec §7 依赖倒置：web-local 接口 + 实现，domain 不感知）。首页新增 Capture 红条入口。

**核心承诺验证（spec §8 Phase 6 段：全局快捷键 + 菜单栏 + mini input）**：

- 全局快捷键 `Cmd/Ctrl+Shift+Space` 在 `/` + `/inbox` + `/canvas` 都触发 Mini Input ✓（puppeteer 断言）
- Enter 标题 focus 展开 body textarea ✓
- Cmd+Enter 保存 + 关闭 ✓
- `card.source.kind === 'shortcut'` + `shortcutId === 'cmd-shift-space'` + `deviceId === 'web'` ✓（puppeteer 读 localStorage 断言）
- 跨刷新保留 ✓
- 焦点在 input/textarea/contenteditable 内**不**触发 ✓
- 6 色 token / 字体 / 8px 网格 / 红 region 条 在 Mini Input 仍对
- 9 张截图归档：`docs/design/screenshots/phase-6/`

**关键工程决策**：

- **`CaptureSink` 接口放 `features/capture/` 而非 domain**：spec §7 列出接口但未规定位置；依赖倒置——web-local 接口 + 实现，domain 不感知。`CardService.fromCapture` 作为底层统一入口。
- **Mini Input 不复用 `<Modal>` 组件**：Modal 1px 黑边 + z-index 100 vs Mini Input 2px 红边 + z-index 200 抢眼。自建 `.mi-*` CSS。
- **`Input` 不 forwardRef，用 `autoFocus` 兜底**：Phase 1 Input 没 forwardRef；`MiniInput` 早返 `null` 后再渲染那一拍，浏览器 `autoFocus` 触发。
- **首页 Capture 入口纯展示**（无 onClick）：避免 event bus 跨组件通信；按快捷键即可。
- **Enter 展开 body 用 `placeholder` 字符串判别 active element**：Mini Input 内只有一个 Input；用 ref 更鲁棒但 Input 不支持；placeholder 匹配是合理 trade-off。
- **puppeteer 用 `Control+Shift+Space`**：macOS Chrome headless 模式 `Meta+Shift+Space` 被 Spotlight 系统级拦截；浏览器内 `Control` 跨平台一致，**真实用户 `Cmd+Shift+Space` 浏览器内仍工作**（CaptureHost 接受 `metaKey || ctrlKey`）。
- **0 新依赖**：沿用 react + domain `fromCapture`（Phase 2 已实现 + 1 个 vitest 覆盖）+ Phase 1 组件库。
- **不重构 inbox CreateCardForm**：tagged Phase 3 代码，Lean 排除。

**已知 / 后续**：

- Tauri 全局快捷键（`@tauri-apps/plugin-global-shortcut`）→ Phase 6+（apps/desktop 实施时）
- 菜单栏 / menubar capture → Phase 6+
- 编辑多媒介（详情 Modal 改 links/code/quotes）→ Phase 6+（或单独 Phase 3.5）
- inbox → canvas send 动作 → Phase 6+
- 图片上传 / MediaAsset 落盘 → Phase 6+
- 链接 OG 抓取 → 留后
- 草稿自动保存（spec §5.5）→ 后续
- 快捷键自定义（spec §5.5）→ 后续
- 多 CaptureSink 实现（spec §7 列 5 个待实现）→ 本阶段仅 web 1 个
- 手动 capture（inbox CreateCardForm）改用 WebCaptureSink → 留 Phase 6+（避免触碰 tagged Phase 3）
- `Cmd+Shift+Space` macOS Spotlight 冲突 → 浏览器内可拦截；OS 级是用户的，浏览器无法阻止

详见 [`docs/plans/2026-06-19-phase-6-capture-entry.md`](../plans/2026-06-19-phase-6-capture-entry.md) + [`docs/design/screenshots/phase-6/README.md`](../design/screenshots/phase-6/README.md)。

---

## 2026-06-19 · phase 7 · archive

**交付**:`/archive` production 路由(`apps/web/src/app/archive/page.tsx`,`'use client'`,静态导出);顶部 8px 蓝条 Toolbar(`region="archive"`)。网格视图(默认)+ 时间轴视图(按 `updatedAt` 按日 UTC 分组)双视图。多选模式 + 黑底白字浮动工具条批量 unarchive / soft-delete。首页新增 Archive 蓝 region 入口(与 Inbox 红 / Canvas 黑 三色分明)。`features/archive/` 切片干净(`archive-card-tile.tsx` tile+row 双 variant + `timeline.tsx` 日分组)。**domain / db 零改动**(复用 Phase 2/3 的 `archive` / `unarchive` / `softDelete`)。

**核心承诺验证(spec §5.4 + §8 Phase 7 段)**:

- `/archive` 空态 + 网格 + 时间轴 + 多选 + 浮动工具条 全流程 puppeteer 断言通过(8/8)
- 归档 2 → `/archive` 网格显示 2 ✓ → 时间轴按日分组 ✓ → 多选 → 批量 unarchive → archived count = 0 ✓ → `/inbox` 3 张全在 ✓
- 6 色 token / 字体 / 8px 网格 / 蓝 region 条 在 `/archive` 仍对;`features/archive/` + `app/archive/` hex grep 零命中
- 8 张截图归档:`docs/design/screenshots/phase-7/`

**关键工程决策**:

- **复用 `CardService` 已有方法**:archive/unarchive/softDelete 全是 Phase 2/3 已实现 + vitest 覆盖;Phase 7 **domain / db 零改动**,纯 web 层新增(0 新依赖)。
- **Tile + Row 双 variant 共用一个组件**:`ArchiveCardTile` 用 `variant` prop 切换视觉(网格 vs 时间轴行式),共用蓝条/meta/选中态逻辑,避免两套 CSS。
- **多选 Set 状态**:不可变更新(`new Set(prev)`);切换 selectMode / 批量操作后 `clearSelected()` 防泄漏。
- **浮动工具条 z-index 50** < CaptureHost Mini Input 200;打开 Modal 时浮动工具条在底层无影响(互斥显示)。
- **时间轴日分组用 UTC ISO date**:避免本地时区偏移造成同卡不同日;P9 暴露本地时区选项。
- **批量 soft-delete 不二次确认**(Lean):软删只标 `deletedAt`,DB 不真删;P9 导出前补二次确认。
- **Archive 不开 detail modal**:避免复制 inbox `CardDetail`(tagged Phase 3);tile onClick 留 no-op,P6.5b 抽 `features/card/` 后统一接通。
- **首页 Archive 入口蓝箭头**:复用 `home__nav-link` 网格 + 覆盖 arrow 背景蓝 + hover 阴影蓝,与 inbox 红 / canvas 黑 三色分明。

**已知 / 后续**:

- Archive tile 点击 no-op(无 detail modal)→ P6.5b 抽共享 detail modal 后接通
- 批量软删无二次确认 → P9 JSON 导出前补
- 时间轴日分组固定 UTC → P9 暴露本地时区
- 标签 / 全文搜索 / 按媒介类型分组 → P6.5+ / P9
- Archive 卡片入画布 → P6.5c inbox→canvas send 的反向复用

详见 [`docs/plans/2026-06-19-phase-7-archive.md`](../plans/2026-06-19-phase-7-archive.md) + [`docs/design/screenshots/phase-7/README.md`](../design/screenshots/phase-7/README.md)。

---

## 2026-06-19 · phase 6.5a · draft autosave

**交付**:`apps/web/src/lib/draft-store.ts`(web-local localStorage 草稿存储,独立 key `cys-stift.drafts.v1`)+ `apps/web/src/lib/use-debounced-callback.ts`(通用防抖 hook,500ms);Mini Input + inbox CreateCardForm 接草稿(title/body/links/code/quotes 任意字段变化防抖 500ms 写草稿;打开时从草稿恢复;提交成功 / Clear 清除;Escape 关闭**保留**草稿);puppeteer 7/7 断言;6 张截图。

**核心承诺验证(spec §5.5 "输入即保存草稿")**:

- Mini Input 输入 "草稿测试 A" → Escape 关闭 → 重开 → **草稿恢复**(`captureKept = true`)✓
- 改成 "草稿测试 B" → 关闭 → 重开 → **最新草稿**(`restoredB = 草稿测试 B`)✓
- Cmd+Enter 保存成功 → 重开 → **草稿清除**(`capture present = false`)✓ + 卡进 `/inbox` ✓
- CreateCardForm 输入 → 导航离开 → 回 `/inbox` → **表单草稿恢复**(`formTitleRestored = 表单草稿`)✓
- 零 page error
- 6 张截图归档:`docs/design/screenshots/phase-6.5a/`

**关键工程决策**:

- **草稿独立 localStorage key**(`cys-stift.drafts.v1`,与 `cys-stift.cards.v1` 分离):草稿变化不触发卡片列表重渲染;草稿失败不影响卡片完整性。
- **草稿不进 domain**:web-local UI 状态,非核心业务实体;Phase 8 Tauri 端走 Tauri fs 替换。
- **`Draft.payload: unknown`**:capture / manual 各自 cast(capture `{title, body}`,manual 完整表单状态);不污染 type 系统。
- **防抖 500ms + useDebouncedCallback**:通用 hook + unmount cleanup;不在每次按键写 localStorage。
- **Escape 保留 / 提交清除**:Escape 关闭不清(误关保护);Cmd+Enter / Clear 显式 `draftStore.clear`。
- **空草稿自动 clear**:所有字段空时清除(避免 stale 空记录)。
- **snapshot 引用稳定**(同 db-client 模式)+ restore 用 `[ready]` deps,避免覆盖用户输入。
- **CreateCardForm 改造不破坏 Phase 3 多媒介**:只加 useEffect 草稿读写 + 防抖 upsert,不动表单结构;多媒介编辑功能保持。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- Tauri fs 草稿落盘 → Phase 8
- 草稿版本历史 / 多草稿 → 留后
- 跨 tab 草稿同步 → 留后
- 草稿手动清除按钮 → 留后
- wa-sqlite 替换 localStorage → Phase 2.5

详见 [`docs/plans/2026-06-19-phase-6.5a-drafts.md`](../plans/2026-06-19-phase-6.5a-drafts.md) + [`docs/design/screenshots/phase-6.5a/README.md`](../design/screenshots/phase-6.5a/README.md)。

---

## 2026-06-19 · phase 6.5b · inbox multi-media edit

**交付**:`apps/web/src/features/card/editors.tsx`(新)抽 `ListEditor` / `CodeEditor` / `QuoteEditor` + `editorStyles` + 3 个 draft→payload 转换函数;`apps/web/src/app/inbox/page.tsx` 详情 Modal `CardDetail` 编辑模式**完整暴露** 3 个 editor(原 Phase 3 MVP 只暴露 title + body,违反 spec §4.2);`apps/web/src/app/inbox/create-card-form.tsx` 改用共享 editors;Phase 3 "intentionally not exposed (Phase 3 MVP)" hint 移除。puppeteer 7/7 断言;6 张截图。

**核心承诺验证(spec §4.2 + Phase 3 closeout 已知/后续)**:

- View 渲染原始 links/code/quotes ✓(view 模式 link-list / code-block / detail__quote 渲染)
- Edit mode 暴露 **3 个 editor**(.le 块各一,Link + Code + Quote)✓
- Phase 3 hint `.detail__hint` 移除 ✓
- Save 走 `service.update(id, {title, body, links, codeSnippets, quotes})` —— title 改 "Edited title" + link 替换 + code 加到 2 + quote attribution 改 ✓
- 跨刷新保留 ✓
- 零 page error
- 6 张截图归档:`docs/design/screenshots/phase-6.5b/`

**关键工程决策**:

- **editors 抽到 `features/card/editors.tsx`**:CreateCardForm + CardDetail 双消费,避免重复(原 Phase 3 在 CreateCardForm 重复定义)。
- **`editorStyles` 导出共享 CSS**:每个 consumer `<style>{editorStyles}</style>`,不堆 .le*。
- **draft→payload 转换集中到 editors 模块**(`draftLinksToPayload` 等):CreateCardForm + CardDetail 共用。
- **`CardService.update` 白名单已含 3 字段**(Phase 3 实现,无需扩 domain);`update can swap multi-media arrays` vitest 已覆盖全 3 字段。
- **`onSave` 扩 5 字段 patch**:title + body + links + codeSnippets + quotes(原 Phase 3 只传 title + body,3 类媒介走 card.* 不变)。
- **state 同步 useEffect deps 加 3 字段**:打开不同卡 / 外部 update 时 5 state 全重置。
- **Canvas `CardDetailModal` 不动**:Phase 4 自己的简化版,避免触碰 tagged Phase 4。
- **Archive tile onClick 不接通**(Lean):不引入 query string 处理。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- Canvas `CardDetailModal` 多媒介编辑 → 后续 P6.5+ 统一
- Archive tile onClick 接通 → 后续 P6.5+ 或独立 phase
- Edit-mode 草稿 → 后续 P6.5+
- Edit 实时预览 → 留后

详见 [`docs/plans/2026-06-19-phase-6.5b-multi-media-edit.md`](../plans/2026-06-19-phase-6.5b-multi-media-edit.md) + [`docs/design/screenshots/phase-6.5b/README.md`](../design/screenshots/phase-6.5b/README.md)。

---

## 2026-06-19 · phase 6.5c · inbox to canvas send

**交付**:`apps/web/src/app/inbox/page.tsx` 详情 Modal 加 "Send to canvas" 按钮(无 `canvasPosition` 时 primary)→ `CardService.moveToCanvas` 设 `CanvasPosition { canvasId: DEFAULT, x, y, w, h, z }` → 卡出现在 `/canvas`(Phase 4 tldraw binding 自动渲染 Card shape)→ 跨刷新保留 → 已发送按钮变 "on canvas" disabled 蓝 tag。`DEFAULT_CANVAS_ID` 从 `@/features/canvas/default-canvas` 复用。puppeteer 6/6 断言;5 张截图。

**核心承诺验证(spec §6.3 / Phase 4 §6.11)**:

- 详情 view mode 显示 "Send to canvas" 按钮 ✓
- 点击后 `card.canvasPosition = {canvasId: "default-canvas", x:100, y:100, w:200, h:80, z:0}` 写入 ✓
- 按钮变 "on canvas" disabled badge ✓
- `/canvas` 渲染 1 个 Card shape(`[class*="tl-shape"][data-shape-type="card"]`)✓
- 跨刷新保留 ✓
- `/inbox` 列表隐藏该卡(spec §6.11 行为,`listInbox` 排除 canvasPosition 卡)✓
- 零 page error
- 5 张截图归档:`docs/design/screenshots/phase-6.5c/`

**关键工程决策**:

- **复用 `CardService.moveToCanvas`**(Phase 2 实现)+ **`CanvasPosition`**(已有类型);不重写,不扩 domain。
- **`DEFAULT_CANVAS_ID` 从 `features/canvas/default-canvas` 引用**:避免 magic string。
- **z 计算**:`Math.max(...existing.map(c => c.canvasPosition?.z ?? 0)) + 1`;并发竞态 MVP 可接受。
- **位置 x/y 用阶梯式排布**:`100 + (z % 5) * 40`;避免多张卡重叠,后续 P6.5+ 可做智能定位。
- **详情状态用 `service.get(id)` 更新**:不 stale state,触发 CardDetail re-render 显示 "on canvas" badge。
- **inbox 列表隐藏 on-canvas 卡**:Phase 2 `listInbox` 真相(spec §6.11 行为);**已知 UX 限制**,后续 P9 导出可补。
- **Canvas dblclick 路径不动**:Phase 4 实现的另一入口,与新路径并存不冲突。
- **domain / db 零改动**:`moves a card to canvas` vitest 已覆盖。
- **0 新依赖**。

**已知 / 后续**:

- UX 限制:inbox→canvas 后卡从 inbox 隐藏,只能去 `/canvas` 找回 → 后续 P9 导出可补
- 多画布 UI(spec §4.9 schema 已支持)→ P6.5+
- "Send to canvas" 撤销动作 → 留后
- 智能定位到画布空白区 → 留后
- "Open on canvas" link → 留 P6.5+
- 并发 z 计算竞态 → 留后

详见 [`docs/plans/2026-06-19-phase-6.5c-inbox-to-canvas.md`](../plans/2026-06-19-phase-6.5c-inbox-to-canvas.md) + [`docs/design/screenshots/phase-6.5c/README.md`](../design/screenshots/phase-6.5c/README.md)。

---

## 2026-06-19 · phase 6.5d · canvas view persistence

**交付**:`apps/web/src/lib/canvas-view-store.ts`(新):web-local localStorage key `cys-stift.canvas-view.v1` + `CanvasView {zoom, panX, panY, gridMode, gridSize}` 类型 + `canvasViewStore.get/update/reset` + `useCanvasView` hook;`apps/web/src/features/canvas/canvas-editor.tsx` onMount 加载视图 + `editor.store.listen` 监听 camera + gridMode 变化防抖 500ms 写回 store;删除硬编码默认值(改读 store);`hydrateOnce()` 在 `get/update` 同步调用,避免首次 mount 把默认值覆盖持久值。puppeteer 6/6 断言;4 张截图。

**核心承诺验证(spec §4.3 gridMode + Phase 5 closeout 已知/后续)**:

- 默认:{zoom:1, panX:0, panY:0, isGridMode:true} ✓
- Zoom in ×2 → 400%(Phase 5 倍进 100→200→400)✓
- `g` 切 free → isGridMode false ✓
- Pan drag 触发 camera 变化 → 防抖 500ms 写入 ✓
- localStorage 持久化:{zoom:4, panX:-540, panY:-319.5, gridMode:'free', gridSize:8} ✓
- Reload 后状态全保留 ✓
- 零 page error
- 4 张截图归档:`docs/design/screenshots/phase-6.5d/`

**关键工程决策**:

- **web-local localStorage key**(`cys-stift.canvas-view.v1`,独立于 cards / drafts):view 是 UI 状态,非业务实体,Phase 8 Tauri 替换时再走 domain `CanvasService.updateView` + `canvases.viewJson`。
- **单 canvas 视图**(MVP),不分 canvasId:spec §4.9 schema 留位,UI 留后。
- **`hydrateOnce()` 在 get/update 同步调用**:避免首次 mount 把默认值写回覆盖持久值(原 bug 修复)。
- **`editor.user.updateUserPreferences({isSnapMode})`**:Phase 5 closeout 决策,不是 `updateInstanceState({user})`(后者类型不接受)。
- **`editor.store.listen()` 无 scope**(默认全监听):`scope: 'document'` 不触发,与 Phase 4 canvas-binding 同款用法。
- **防抖 500ms** + **cleanup 注入 `editor.dispose`**:tldraw 卸载时清 timer + unsub。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- Phase 8 Tauri fs 替换 localStorage,view 进 `canvases.viewJson`
- 多画布 view 分 canvasId → spec §4.9 schema 留位,UI 留后
- 视图 history → 留后

详见 [`docs/plans/2026-06-19-phase-6.5d-canvas-view-persist.md`](../plans/2026-06-19-phase-6.5d-canvas-view-persist.md) + [`docs/design/screenshots/phase-6.5d/README.md`](../design/screenshots/phase-6.5d/README.md)。

---

## 2026-06-19 · phase 6.5e · unify manual capture

**交付**:`apps/web/src/app/inbox/page.tsx` CreateCardForm 的 onCreate 改走 `new WebCaptureSink(service).submit({source:{kind:'manual', deviceId}})`(从 `service.create` 直接调用切换);`CaptureInput.links` 是 `string[]`,转换 `input.links.map(l => l.url)`。puppeteer 5/5 断言;1 张截图。

**核心承诺验证(spec §7 CaptureSink 接口统一)**:

- Inbox 创建卡 → `card.source.kind === 'manual'` ✓
- `card.source.deviceId === 'web'` ✓
- 跨刷新保留 ✓
- 零 page error

**关键工程决策**:

- **两路 capture 入口同一接口**:inbox 表单 + Mini Input 快捷键都走 `WebCaptureSink.submit → service.fromCapture`(spec §7 依赖倒置)。
- **`CaptureInput.links` 是 `string[]`**,转换 `input.links.map(l => l.url)`。
- **`service.create` 仍保留**(canvas dblclick 路径用),inbox 不再用。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- CaptureSinkRegistry(多 sink 注册)→ P6.5g
- TauriCaptureSink / MenubarCaptureSink → P6.5g

详见 [`docs/plans/2026-06-19-phase-6.5e-unify-manual-capture.md`](../plans/2026-06-19-phase-6.5e-unify-manual-capture.md) + [`docs/design/screenshots/phase-6.5e/README.md`](../design/screenshots/phase-6.5e/README.md)。

---

## 2026-06-19 · phase 6.5f · media upload (inline base64 MVP)

**交付**:`apps/web/src/lib/media-store.ts`(新):web-local localStorage key `cys-stift.media.v1` + `attach` / `getAsset` / `remove` + base64 data URL(soft 500KB 警告);`packages/domain/src/services/card-service.ts` 扩 `UpdateCardPatch.media` + `update` 函数体(零依赖 + 新加 1 vitest);`apps/web/src/app/inbox/page.tsx` 详情 Modal view + edit mode 渲染 `card.media`(view 渲染 `<img>`;edit 加 file input + 缩略图列表 + × 删除)。puppeteer 4/4 断言;3 张截图。

**核心承诺验证(spec §4.5 MediaAsset 最小 MVP)**:

- 上传 1 张图 → save → `card.media.length === 1` ✓
- `cys-stift.media.v1` 1 asset ✓
- 详情 Modal 渲染 1 个 `<img class="media-list__img">` ✓
- 跨刷新保留 ✓
- 零 page error

**关键工程决策**:

- **base64 inline localStorage 占位**:Phase 2.5 OPFS / Phase 8 Tauri fs 替换时,`mediaStore` 公共 API 不变。
- **domain 扩 `UpdateCardPatch.media`**:补白名单,不破坏零依赖,新加 1 个 vitest。
- **软限制 500KB**:console.warn 提示,仍接受。
- **0 新依赖**:FileReader / data URL 原生。

**已知 / 后续**:

- OPFS 真实落盘 → Phase 2.5(独立 phase)
- Tauri fs 落盘 → Phase 8
- 图片编辑(裁剪/旋转)→ 留后
- 拖放上传 → 留后
- OG 图片抓取 → 留后

详见 [`docs/plans/2026-06-19-phase-6.5f-media-upload.md`](../plans/2026-06-19-phase-6.5f-media-upload.md) + [`docs/design/screenshots/phase-6.5f/README.md`](../design/screenshots/phase-6.5f/README.md)。

---

## 2026-06-19 · phase 6.5g · menubar + CaptureSinkRegistry

**交付**:`apps/web/src/components/app-menu.tsx`(新):全局菜单栏 4 入口(Inbox / Canvas / Archive / Capture)+ 当前路由高亮(`usePathname`)+ Capture dispatch CustomEvent;`apps/web/src/features/capture/capture-sink.ts` 加 `captureSinkRegistry`(register/unregister/submit/has);`apps/web/src/features/capture/menu-capture-sink.ts`(新):`MenuCaptureSink implements CaptureSink`(`source.kind='menubar'`);`apps/web/src/features/capture/capture-host.tsx` 加 `openKind` 状态 + 监听 CustomEvent + 动态 register sinks(shortcut/menubar);root layout 挂 `<AppMenu />`。puppeteer 6/6 断言;5 张截图。

**核心承诺验证(spec §5.5 + §7 CaptureSink 接口多 sink)**:

- AppMenu 在 home 可见 ✓
- /inbox 高亮 Inbox / /canvas 高亮 Canvas / /archive 高亮 Archive ✓
- 点 Capture → Mini Input 开 ✓
- save → `card.source.kind === 'menubar'` ✓
- 零 page error

**关键工程决策**:

- **CustomEvent `cys-stift:open-capture`**:不引入 Zustand/event-bus,单实例 CaptureHost 是 open 状态唯一持有者。
- **CaptureSinkRegistry**:模块单例 `Map<string, CaptureSink>`;Phase 8 TauriCaptureSink `register('tauri', ...)`。
- **`openKind` 状态**:CaptureHost 追踪谁打开,save 时用对应 source.kind。
- **MenuCaptureSink 与 WebCaptureSink 对称**:都走 `service.fromCapture`。
- **动态 import + register**:service 注入,unmount 时 unregister。

**已知 / 后续**:

- TauriCaptureSink(global-shortcut + OS 级)→ Phase 8
- Webhook / mobile / alfred sink → 留后
- 菜单栏用户自定义 → P6.5h

详见 [`docs/plans/2026-06-19-phase-6.5g-menubar.md`](../plans/2026-06-19-phase-6.5g-menubar.md) + [`docs/design/screenshots/phase-6.5g/README.md`](../design/screenshots/phase-6.5g/README.md)。

---

## 2026-06-19 · phase 6.5h · keymap customisation

**交付**:`apps/web/src/lib/settings-store.ts`(新):web-local localStorage key `cys-stift.settings.v1` + `Settings { captureShortcut: {modKey, shift, code} }` + `settingsStore.get/update/updateCaptureShortcut` + `useSettings` hook;`apps/web/src/app/settings/page.tsx`(新):`/settings` 路由(system region)+ modifier/shift/key 下拉 + 实时显示当前组合;`apps/web/src/features/capture/capture-host.tsx`(改):keydown 监听改读 `settings.captureShortcut`(deps 含 sc.code,re-bind);AppMenu 加 Settings 入口。puppeteer 5/5 断言;3 张截图。

**核心承诺验证(spec §5.5 "可在设置改")**:

- /settings 默认显示 `⌘+⇧+Space` ✓
- 改成 `⌘+⇧+C` ✓
- localStorage 持久化(`captureShortcut.code === 'KeyC'`)✓
- 按新组合(Ctrl+Shift+C)打开 Mini Input ✓
- 零 page error

**关键工程决策**:

- **web-local settings store**(同 draft/canvas-view 模式):Phase 8 Tauri 读相同 shape。
- **CaptureHost 接受 meta OR ctrl**(跨平台):`sc.modKey` 只是用户偏好 label。
- **`useSettings` + keydown deps 含 sc.code**:改 code → listener re-bind,无需刷新。
- **下拉式 UI**(不是录制式):MVP 简单。
- **0 新依赖** + **domain / db 零改动**。

**已知 / 后续**:

- 冲突检测(快捷键被浏览器/系统占用)→ 留后
- 录制式捕获 → 留后
- canvas 快捷键自定义 → 留后
- Tauri 端读 settings → Phase 8

详见 [`docs/plans/2026-06-19-phase-6.5h-keymap-custom.md`](../plans/2026-06-19-phase-6.5h-keymap-custom.md) + [`docs/design/screenshots/phase-6.5h/README.md`](../design/screenshots/phase-6.5h/README.md)。

---

## 2026-06-19 · phase 8 · tauri packaging — STUCK

**状态**:🟡 STUCK — 本机无 `rustc`/`cargo`,Phase 0 已搭好完整 `apps/desktop/src-tauri/` 骨架,实际构建 + global-shortcut plugin + 签名 + CI 需 Rust。按 roadmap §3.5 失败模式,写 stuck 决策档而非未经验证 Rust 代码。

详见 [`docs/decisions/2026-06-19-phase-8-stuck.md`](../decisions/2026-06-19-phase-8-stuck.md)。

---

## 2026-06-19 · phase 9 · JSON export + user docs

**交付**:`apps/web/src/lib/export-service.ts`(新):`EXPORT_FORMAT_VERSION = 1` + `ExportPayload` 类型 + `buildExportPayload()`(纯函数,读 cards/media/drafts/settings)+ `downloadExport()`(Blob + `<a download>`);`apps/web/src/app/settings/page.tsx` 加 Data section + Export JSON 按钮;`docs/user/README.md`(新):用户指南(捕获/inbox/canvas/archive/settings + 数据隐私 + 快捷键速查 + 已知限制)。puppeteer 8/8 断言;2 张截图。

**核心承诺验证(spec §1.2 信念4 "数据可迁移" + §8 Phase 9)**:

- 下载 1 个 `cys-stift-export-*.json` ✓
- `version === 1` ✓
- `cards.length === 2` ✓
- `mediaAssets` 1 key ✓
- `settings.captureShortcut.code === 'KeyC'` ✓
- `exportedAt` ISO string ✓
- 零 page error

**关键工程决策**:

- **开放格式 JSON,版本化**(`version: 1`):任何工具可读;未来迁移路径。
- **导出范围**:cards + mediaAssets(必)+ drafts + settings(可选)。
- **浏览器原生下载**(`<a download>` + Blob URL):0 新依赖。
- **纯函数 `buildExportPayload`** + `downloadExport` 分离副作用。
- **用户文档 `docs/user/README.md`**:核心流程 + 数据隐私 + 快捷键速查。
- **0 新依赖** + **domain/db 零改动**。

**已知 / 后续**:

- 反向 import → 留后
- 录屏 → 留后
- `/changelog` 路由 → 留后

详见 [`docs/plans/2026-06-19-phase-9-export.md`](../plans/2026-06-19-phase-9-export.md) + [`docs/design/screenshots/phase-9/README.md`](../design/screenshots/phase-9/README.md) + [`docs/user/README.md`](../user/README.md)。

---

## 2026-06-19 · phase 9.1 · JSON reverse import + capture race fix

**交付**:`apps/web/src/lib/export-service.ts` 加 `importFromJson(jsonText)` + `ImportResult` 类型(校验 version/shape,覆盖式写 4 个 localStorage key);`apps/web/src/app/settings/page.tsx` 加 Import 按钮 + `<input type=file>` + 结果提示 + 成功后 reload;`apps/web/src/features/capture/capture-sink.ts` 加 `setFallbackService`(race 安全:submit 在 sink register 前到达也走 `service.fromCapture` 不丢卡);CaptureHost 注册 fallback。puppeteer 全过(export → clear → import → 2 cards 恢复);2 张截图。

**核心承诺验证**:

- Export 1 file → clear (0 cards) → Import → 2 cards 恢复(Import test A + B)✓
- version !== 1 报错不写 ✓(校验)
- 零 page error

**关键工程决策**:

- **覆盖式合并**(MVP):建议先 Export 备份。
- **校验 version + shape**:`version !== 1` 或 cards 非数组 → 报错。
- **可选 key 跳过**:drafts/settings 缺失不报错。
- **reload 恢复**:写完 800ms reload,store 重新 hydrate。
- **capture race fix**:registry 加 fallback CardService,sink 异步 register 前 submit 不丢卡。
- **0 新依赖** + **domain/db 零改动**。

**已知 / 后续**:

- 合并策略(merge)→ 留后
- 冲突解决 → 覆盖
- 导入预览 / 撤销 → 留后

详见 [`docs/plans/2026-06-19-phase-9.1-import.md`](../plans/2026-06-19-phase-9.1-import.md) + [`docs/design/screenshots/phase-9.1/README.md`](../design/screenshots/phase-9.1/README.md)。

---

## 2026-06-20 · review bugfix · #1 import 不一致 + #3 sink 注册竞态

**交付**:承接 self-review([`decisions/2026-06-19-review-findings.md`](../decisions/2026-06-19-review-findings.md))的建议优先级 #1 + #3。① `apps/web/src/lib/export-service.ts`(`importFromJson`)写入段重写:先序列化全部待写项 → 快照旧值 → 写入 → 任一抛错逐条回滚(序列化/写入抛错都返回 `ok:false` 且任何 key 不被半覆盖);② `apps/web/src/app/inbox/page.tsx`(manual sink)+ `apps/web/src/features/capture/capture-host.tsx`(shortcut + menubar)effect 加 `cancelled` flag,杜绝 unmount 后 dynamic import resolve 注册 phantom sink。`scripts/import-rollback-shots.cjs`(新)e2e + 截图。

**核心承诺验证**:

- #1 monkeypatch media key setItem 抛 QuotaExceeded → cards 回滚到原值 + UI 报 `Import failed: write failed: quota exceeded (simulated)` ✓
- #1 happy path 仍写 NEW 卡 ✓
- #3 三入口回归:`p6`(快捷键)/ `p6.5e`(手动)/ `p6.5g`(menubar)全过 ✓
- domain 11 / db 7 全绿;web build exit 0;零 page error

**关键工程决策**:

- **#1 瞬态内存快照 + 回滚,不用持久 `cys-stift.backup.v1`**:避免陈旧副本 footgun + YAGNI(用户已被提示先 Export)。"导入后可撤销"是独立 feature。
- **#1 序列化前置**:序列化抛错(循环引用等)时任何 key 没被碰。
- **#1 回滚容错**:回滚的 setItem/removeItem 各自 try/catch(best-effort)。
- **#3 标准 React `cancelled` 模式**:一个 flag 守 effect 内全部 import(capture-host 2 个);`setFallbackService` 同步不受影响。
- **0 新依赖** + **domain/db 零改动** + **没碰 spec**。

**已知 / 后续**(findings 剩余):

- #2 soft-delete 回收/恢复视图(产品决策 + domain `restore`/`hardDelete`)
- #4 / #5 canvas-editor 脆弱点(下次动 canvas)
- UX 洞(批量 soft-delete 二次确认 / send-to-canvas 反向 / archive tile no-op / OPFS 真实落盘)

详见 [`docs/plans/2026-06-20-review-bugfixes.md`](../plans/2026-06-20-review-bugfixes.md) + [`docs/decisions/2026-06-20-review-bugfixes.md`](../decisions/2026-06-20-review-bugfixes.md) + [`docs/design/screenshots/review-import-rollback/`](../design/screenshots/review-import-rollback/)。

---

## 2026-06-20 · phase trash · soft-delete 回收/恢复视图

**交付**:承接 review findings #2(产品决策)。① `packages/domain/src/services/card-service.ts` 加 `restore(id)`(清 `deletedAt` + bump `updatedAt`)+ `hardDelete(id)`(调 `repo.delete`,4 个 vitest);② `packages/ui/src/components/toolbar.tsx` `region` 联合加 `'trash'`(颜色自动 gray,`regionColorForStripe` default 已返 gray);③ `apps/web/src/app/trash/page.tsx`(新,14 静态路由):列 `deletedAt` 卡按 `deletedAt` desc,复用 `ArchiveCardTile` 视觉 + 每卡 Restore(清 `deletedAt`,自然回 inbox/archive/canvas) + Delete forever(`Modal` 二次确认,`hardDelete` 真删不可逆);④ `apps/web/src/components/app-menu.tsx` entries 加 Trash;⑤ `apps/web/src/app/inbox/page.tsx` 软删 Modal body 文案 `"...recover it later from the database"` → `"...restore it from Trash"`(链 `<Link href="/trash">`);⑥ `scripts/trash-shots.cjs`(新)e2e + 7 截图。Tag **v0.10.0-trash**。

**核心承诺验证**:

- inbox 软删 tr-1 → `deletedAt` 设上 + `/trash` 列 1 项 ✓
- Restore → `deletedAt === undefined` + 卡回原视图(inbox/archive/canvas 之一)✓
- 再软删 → Delete forever → Modal → 确认 → `listAll()` 不含该 id + `/trash` 空 ✓
- AppMenu `/trash` 高亮 active ✓
- inbox 软删 Modal body 含 `"restore it from Trash"` ✓
- 零 page error
- domain 15(11→15)/ db 7 全绿;web build exit 0,14 静态页;7 截图归档

**关键工程决策**:

- **新 `/trash` 路由**(非 archive 三 tab):三分离(inbox 活跃 / archive 归档 / trash 已删)更清晰;spec 没限定 UI 形态,选最简单。
- **`restore` 只清 `deletedAt`,不动 `archived` / `canvasPosition`**:卡自然回原视图,不需要 domain 知道"它原来在哪"——单一真相源是卡自身字段。
- **`hardDelete` 调 `repo.delete`(db 层已就绪)**:不引入新存储语义,`sqlite DELETE` 由 db 包保证。
- **`restore` / `hardDelete` 返回 boolean**(而非 void):让调用方知道是否真改了一张卡;其他 service 方法维持原签名(零破坏)。
- **单卡操作**(无 selectMode):MVP,先验证核心闭环;批量 restore/hardDelete 留后(archive 批量模式可复用)。
- **Delete forever 只 Modal 二次确认**,不要求打字 "delete":MVP,信任 Modal 拦截。
- **`TrashItem` 复用 `ArchiveCardTile`**:视觉已存在的"白底黑边 + 蓝条"通用卡,archive 只是恰好蓝条;不重做。
- **inbox 软删 Modal 链 `<Link href="/trash">`**:文案承诺即兑现,点链接直接跳 /trash。
- **`region: 'trash'` 自动 gray**:`regionColorForStripe` default 返 gray,无 if 分支。
- **0 新依赖** + **没碰 spec** + **ui 仅扩联合类型** + **domain 只加方法**。

**已知 / 后续**(findings 剩余):

- #4 / #5 canvas-editor 脆弱点(下次动 canvas 一起重构成 useEffect)
- 批量 restore / hardDelete(archive 批量模式可复用)
- media gc:hardDelete 只删 card 记录,关联 media assets 留孤儿,Phase 2.5 OPFS 时统一 gc
- 定期自动清空 trash(保留期)—— 未要求,YAGNI
- UX 洞(批量 soft-delete 二次确认 / send-to-canvas 反向 / archive tile no-op / OPFS 真实落盘)
- Phase 8 Tauri build(Rust 就绪)+ 签名公证(需 Apple 证书)

详见 [`docs/plans/2026-06-20-trash-recovery.md`](../plans/2026-06-20-trash-recovery.md) + [`docs/decisions/2026-06-20-trash.md`](../decisions/2026-06-20-trash.md) + [`docs/design/screenshots/phase-trash/`](../design/screenshots/phase-trash/)。

---

## 2026-06-20 · phase canvas-refactor · useEffect 驱动 canvas-editor(关闭 review #4 #5)

**交付**:承接 review findings #4 + #5(原计划:动 canvas 时一起修)。① `apps/web/src/features/canvas/canvas-editor.tsx` 重构:onMount 只剩一次性副作用(view apply + loadCardsIntoEditor + bindCardWriteback + `__canvasEditor` 句柄 + onEditorReady);新增 `<ViewPersistenceBridge>`(`useValue` 订阅 camera + isGridMode + 500ms 防抖 `useEffect` 写回 canvasViewStore,React cleanup `clearTimeout`)+ `<DoubleClickBridge>`(`useEffect` 在 editor container 上 add/remove dblclick,回调走 ref 避免 effect 重订);**全删 `editor.store.listen(callback)` 无 filter + `editor.dispose` 猴补丁**。② `apps/web/src/app/canvas/page.tsx` 把 editor 作为 prop 传给 TldrawCanvas(1 行);TldrawCanvas.tsx 无需改(已 `{...props}` 透传)。③ `scripts/canvas-refactor-shots.cjs`(新):反复切 /canvas↔/inbox ×4 + reload + 拖卡 + 双击建卡 + view 持久化回归。④ p6.5d-shots.cjs 全过(view 持久化行为不变)。Tag **v0.11.0-canvas-refactor**。

**核心承诺验证**:

- #4 反复切 /canvas 4 次后相机稳定(zoom 1 / snap)+ 0 page error ✓
- #4 reload 后 view 全保留(zoom 2 / free / pan -120,-60)✓
- #5 拖卡后 view-store 持久化**0 写入**(before === after 深相等)— useValue 替代全量 listen ✓
- #4 dblclick 双击空白处建新卡 ✓
- p6.5d view 持久化回归全过 ✓
- 零 page error;canvas chunk 体积不变(484 kB);14 静态页不变
- domain 15 / db 7 全绿;web build exit 0

**关键工程决策**:

- **view 持久化用 `useValue` 订阅,不用 `editor.store.listen(callback)`**:`useValue('cvp camera', () => editor.getCamera())` + `useValue('cvp isGridMode', () => editor.getInstanceState().isGridMode)`(复用 ZoomGroup 已用的 tldraw 响应原语)。`useValue` 只在订阅的标量变化时回调,**完全跳过 listen 的"所有 store changes"问题**(#5 根因)。
- **副作用按 lifetime 分**:onMount = tldraw 触发的一次性动作;bridge useEffects = editor 准备好后的响应式副作用。语义清晰,生命周期各归其主。
- **回调走 ref 避免 effect 重订**:`DoubleClickBridge` 内 `const cbRef = useRef(onOpenCard); cbRef.current = onOpenCard`。page 端 `onOpenCard={(card) => setDetail({card})}` 每次 render 都是新函数 — 不走 ref 会让 dblclick effect 每次 render 都 add/remove 监听,既浪费又有 setDetail 期间短暂未挂载窗口。
- **`editor` 下传 page→canvas-editor**:page 已有 `editor` state(`onEditorReady` 拿到后 setEditor),复用同一 handle 作为 prop 给 canvas-editor。无新 state、无新 ref、无新 IPC。
- **保留 `onEditorReady` callback**:page 仍需 `setEditor` 给 CardDetailModal 用 onSave/onArchive/onDelete 同步 shape,这个回调不能丢。
- **保留 `__canvasEditor` 诊断句柄**:puppeteer 用 `window.__canvasEditor` 读 live state;本次 e2e 仍用它。
- **`bindCardWriteback` / `loadCardsIntoEditor` 内部不动**:本次 scope 是副作用组装方式,不是卡片绑定逻辑。
- **0 新依赖** + **没碰 spec** + **domain/db/ui 零改动** + **canvas chunk 体积不变(484 kB)**。

**已知 / 后续**(review 已全部关闭):

- ~~#4 canvas-editor dispose 猴补丁~~ ✅
- ~~#5 listen 无 filter~~ ✅
- canvas dblclick 走 capture registry(plan 决定走 captureSinkRegistry,但当前实现是直接 `service.create`;未要求,YAGNI)
- 多画布 UI(spec §4.9 schema 已支持)
- view 持久化迁到 domain `CanvasService.updateView`(Phase 8 Tauri 时统一)
- "重置 view" 按钮(已知 UX 缺口)

详见 [`docs/plans/2026-06-20-canvas-editor-refactor.md`](../plans/2026-06-20-canvas-editor-refactor.md) + [`docs/decisions/2026-06-20-canvas-refactor.md`](../decisions/2026-06-20-canvas-refactor.md) + [`docs/design/screenshots/phase-canvas-refactor/`](../design/screenshots/phase-canvas-refactor/)。

---

## 2026-06-20 · phase archive-detail · archive tile 接 detail Modal(关闭 review §🟠 UX #4)

**交付**:承接 review §🟠 UX 洞 #4:"archive tile 点击 no-op"。① `apps/web/src/features/card/card-detail.tsx`(新,~360 行共享组件,基于 inbox 完整版,内置 soft-delete confirm modal);② `apps/web/src/app/archive/page.tsx` 接 Modal(grid + Timeline 两路 `openDetail(id)` → Modal),actions `['unarchive','softDelete']`;③ `apps/web/src/app/inbox/page.tsx` 删本地 CardDetail(~320 行)+ DetailState + page-level confirm Modal,改用共享 `CardDetailModal`(actions `['archive','unarchive','sendToCanvas','softDelete']`,共享组件按 `card.archived` 字段决定渲染哪个切换按钮);④ `scripts/archive-detail-shots.cjs`(新)+ `p6.5b`/`trash` 脚本更新 selector(`cd__*` 新 class)。Tag **v0.12.0-archive-detail**。

**核心承诺验证**:

- archive grid 点 tile → CardDetailModal view 打开(cd__meta / cd__actions / Links + Code + Quotes sections 全在)✓
- Edit 模式 3 个 editor 面板(links / code / quotes)✓
- 改 title → Save → localStorage 持久化 `Renamed archive card` ✓
- Save 后自动回 view 模式;Escape 关 Modal ✓
- Timeline 视图点行 → Modal 打开,标题显示新值 ✓
- Modal 内 Soft-delete → 内置 confirm Modal(`cd__confirm` + `cd__confirm-actions`)→ 确认 → deletedAt 设置 ✓
- /archive 空 + /trash 有 1 ✓
- 回归:`p7` ✓(archive 多选批量)/ `p6.5b` ✓(inbox 详情编辑)/ `trash` ✓(trash 视图软删恢复)全过
- domain 15 / db 7 全绿;web build exit 0,**14 静态页**
- **/inbox 体积 8.44 → 5.08 kB(-3.4 kB 共享组件提取收益)**;/archive 3.15 → 3.27 kB(共享 Modal 引入)
- 零 page error

**关键工程决策**:

- **共享组件放 `features/card/`**(与 P6.5b 抽的 `editors.tsx` 同层),不放 `inbox/`(那是 inbox 私有)
- **共享组件内置 soft-delete confirm Modal**(取代 inbox 原本 page-level confirm + inbox 的 `confirmDelete` state 全删):consumer 传 `onConfirmDelete` 即可,内聚更好;inbox page 净减 ~50 行
- **`actions` prop 控制可执行动作集合**:archive 上下文 `['unarchive','softDelete']`(归档卡不能再 archive);inbox 上下文全 4 个 + 共享组件按 `card.archived` 自路由 Archive/Unarchive 按钮
- **`sendToCanvas` 仅当卡无 `canvasPosition` 才显示**:匹配 inbox 原 P6.5c 行为;archive 不传 `onSendToCanvas`(actions 不含)所以 archive 不显示
- **`cd__*` class 命名空间**(从 inbox 原 `detail__*` / `media-list` / `link-list` / `code-block` 收敛):组件独立,被多 consumer 共用不污染 inbox page 的样式
- **canvas 的 `CardDetailModal` 不动**:Phase 4 的简化版(title + body only),已能用;触碰 tagged Phase 4 风险
- **0 新依赖** + **没碰 spec** + **domain/db 零改动** + **archive/onclick no-op 注释删除**

**已知 / 后续**:

- 批量 soft-delete 二次确认(review §🟠 UX #3 — YAGNI,误删可 trash 恢复)
- send-to-canvas 反向动作(卡上画布后无"拿回 inbox"按钮)
- archive 内筛选 / 搜索(YAGNI)
- archive tile 长按多选(touch UX,YAGNI)
- canvas `CardDetailModal` 升级到共享组件(留后,功能等价但需要回归测)
- inbox page 内的 dead styles 清理(`.link-list` / `.code-block` / `.media-list` 等现在无 JSX 引用 — 留后,YAGNI)
- Phase 8 Tauri build + 签名公证(需 Apple 证书)

详见 [`docs/plans/2026-06-20-archive-detail.md`](../plans/2026-06-20-archive-detail.md) + [`docs/decisions/2026-06-20-archive-detail.md`](../decisions/2026-06-20-archive-detail.md) + [`docs/design/screenshots/phase-archive-detail/`](../design/screenshots/phase-archive-detail/)。

---

## 2026-06-20 · phase batch-confirm · archive 批量软删二次确认(关闭 review §🟠 UX #3)

**交付**:承接 review §🟠 UX 洞 #3:"archive 批量 soft-delete 无二次确认"。`apps/web/src/app/archive/page.tsx` import 加 `Modal`,新 state `confirmBatchDelete: CardId[] \| null`(null 隐藏 / 数组显示),改 `handleSoftDeleteSelected` 改弹 Modal 不直接软删,新 `handleConfirmBatchSoftDelete` / `handleCancelBatchSoftDelete`,新增 floater 后的 `<Modal>` 块(title 显示 "Soft-delete N card(s)?",body 列出前 5 个 title + "...and N more" + "restore them from Trash" Link,actions Cancel + "Soft-delete N"),styles 字符串加 `.confirm__body` / `.confirm__link` / `.confirm__actions`(沿用 trash page 的 `confirm__*` 命名空间)。`scripts/batch-soft-delete-confirm-shots.cjs`(新):seed 3 卡 → 选 3 → 弹 Modal → Cancel 保留 → 再触发 → 确认 → /archive 空 + /trash 3。Tag **v0.13.0-batch-confirm**。

**核心承诺验证**:

- floater "Soft-delete" 一次点击不再直接软删,改弹 Modal ✓
- Modal title = "Soft-delete 3 cards?"(单复数处理)✓
- Modal body 列出 3 个 title + Link 指向 `/trash` ✓
- Cancel 关闭 Modal,3 卡仍在 archive,selected 保留 ✓
- 再次点 floater "Soft-delete" → Modal 重新打开 ✓
- 点 danger "Soft-delete 3" → /archive 空 + /trash 3 ✓
- 回归:`p7` ✓ / `p6.5b` ✓ / `trash` ✓ / `archive-detail` ✓ 全过
- domain 15 / db 7 全绿;web build exit 0,**14 静态页**
- /archive 3.27 → 3.63 kB(+360 Modal 引入)
- 零 page error

**关键工程决策**:

- **复用 trash page 的 `confirm__*` class 命名空间**(而非新建 `bcf__*` 或引入 `cd__*`):archive 与 trash 同为"删除/恢复"流程,UI 模式一致;shared CardDetailModal 用 `cd__*`(因为它有自己的多页路由/状态),archive 这里是 page-level confirm,延续 trash 的轻量命名最简。
- **复用 inbox/trash 已有的 trash 链接文案**:与单卡软删确认(`CardDetailModal.cd__confirm`)及 trash hardDelete(`trash/page.tsx.confirm__body`)文案风格一致 —— 用户对"可以从 Trash 恢复"的承诺已在 3 个确认对话框里看到,跨页面一致。
- **Cancel 保留 selected**:用户误触 Modal 后可以重新决定,不必重新 tick N 个 checkbox。`clearSelected()` 只在确认软删后才调。
- **列出前 5 个 title + "+N more"**:N=3 时显示全部;N=50 时 modal 不会被撑爆,用户知道删的是哪些 + 总数。
- **Danger 按钮 label 带数量**:`Soft-delete 3` 而不是单 `Soft-delete`,最后再给用户一次明确的"我删几卡"视觉。
- **0 新依赖** + **没碰 spec** + **domain/db/ui 零改动** + **`Modal` 复用 `@cys-stift/ui`**。

**已知 / 后续**(review UX 洞剩 #2):

- ✅ ~~批量 soft-delete 二次确认~~ (本次)
- ⬜ UX #2 send-to-canvas 反向动作(卡上画布后无"拿回 inbox"按钮)
- 批量 Unarchive 加确认(非破坏性,review 没要求,YAGNI)
- 输入卡名 "delete" 才确认的高强度确认(信任 Modal 拦截,匹配现有 confirm 风格)
- 把 batch confirm 抽到 features/card 共享组件(archive 是唯一批量场景,YAGNI)

详见 [`docs/plans/2026-06-20-batch-soft-delete-confirm.md`](../plans/2026-06-20-batch-soft-delete-confirm.md) + [`docs/decisions/2026-06-20-batch-confirm.md`](../decisions/2026-06-20-batch-confirm.md) + [`docs/design/screenshots/phase-batch-confirm/`](../design/screenshots/phase-batch-confirm/)。

---

## 2026-06-20 · phase send-back · canvas 卡反向回 inbox(关闭 review §🟠 UX #2)

**交付**:承接 review §🟠 UX 洞 #2(最后剩余 UX 洞):"卡上画布后无'拿回 inbox'反向动作"。① `packages/domain/src/services/card-service.ts` 加 `removeFromCanvas(id)`(清 `canvasPosition`,spec §6.11 的 `listInbox` 自然显示)+ 2 vitest(17 passed);② `apps/web/src/features/canvas/card-detail-modal.tsx` 加 `onSendToInbox?` prop + "Send back to inbox" 按钮(仅当 `card.canvasPosition` 存在);③ `apps/web/src/app/canvas/page.tsx` 调 `service.removeFromCanvas` + `removeCardShape`;④ `scripts/send-back-shots.cjs`(新,7 断言 + 4 截图)。Tag **v0.14.0-send-back**。

**核心承诺验证**:

- canvas 双击已有卡 → Modal 打开,view 模式显示 "Send back to inbox" 按钮 ✓
- 点击 → Modal 关闭,shape 消失,`canvasPosition` 清空 ✓
- /inbox 显示该卡(`listInbox` 排除 canvasPosition 卡)✓
- 7/7 断言 + 0 page error
- 回归:`canvas-refactor` ✓ / `p4` / `p5` / `p6.5d` 全过
- domain 17 / db 7 / web build 14 静态页 exit 0

**关键工程决策**:

- **新方法 `removeFromCanvas` 而非复用 `update`**:卡片字段是 lifecycle 字段(archived / deletedAt / canvasPosition),不通过通用 `update` 改,与 `moveToCanvas` / `softDelete` 等对称。
- **idempotent + boolean return**:`!card.canvasPosition` 时返 false,无副作用;`hardDelete`/`restore` 也是 boolean 一致风格。
- **不动 inbox 显示逻辑**:`listInbox` 已排除 `canvasPosition` 卡(原 spec §6.11 行为),`removeFromCanvas` 自动让卡重现在 inbox,无需 inbox 端任何代码。
- **canvas 按钮 conditional render**:`card.canvasPosition && onSendToInbox` — 已是 inbox 卡的画布上不应显示此按钮(虽然 inbox 卡不会到画布,但兜底)。
- **0 新依赖** + **没碰 spec** + **ui 零改动**(只 canvas 局部组件加 prop)

详见 [`docs/decisions/2026-06-20-send-back.md`](../decisions/2026-06-20-send-back.md) + [`docs/design/screenshots/phase-send-back/`](../design/screenshots/phase-send-back/)。

---

## 2026-06-20 · refactor · canvas dblclick 走 capture registry

**交付**:统一所有 capture 入口。`apps/web/src/features/canvas/canvas-editor.tsx` 的 `DoubleClickBridge` 把直接 `service.create` 改为 `captureSinkRegistry.submit({source: {kind: 'manual', deviceId: 'web'}, title: '', canvasPosition})`,复用 inbox form / menubar / shortcut 同一条路径。复用 'manual' kind(不是新 kind),因为行为上等价(都是 WebCaptureSink → fromCapture → service.create),`canvasPosition` 字段足以区分画布上创建的卡与 inbox-only 手动创建。registry 找不到 manual sink 时 fallback 到 `fallbackService`(CaptureHost 在所有路由都 setFallbackService)—— 卡永不丢。

**核心承诺验证**:

- 双击画布空白 → registry submit → 调 WebCaptureSink(from inbox mount 注册)或 fallback service(直接 /canvas)→ `service.fromCapture` → 卡片创建
- 已有 `canvas-refactor-shots.cjs` 间接覆盖(7/7 PASS,创建第 2 张卡的断言通过新路径)
- 回归:`canvas-refactor` ✓ / `send-back` ✓ / `p4` / `p5` / `p6.5d` 全过
- domain 17 / db 7 / web build 14 静态页 exit 0

**关键工程决策**:

- **复用 'manual' kind**:行为等价(同一 WebCaptureSink 实现),canvasPosition 区分来源;不引入新 kind 增加 registry 复杂度。
- **fallback 兜底**:CaptureHost 永远在所有路由 setFallbackService,直接 /canvas 不经 /inbox 时也能创建卡。
- **不动 capture-sink.ts**:registry 接口已设计好 race-safe,canvas 这边只是 consumer。
- **0 新依赖** + **没碰 spec** + **domain 零改动**

详见 commit `9d7aa24`。

---

## 2026-06-20 · phase multi-canvas · 多画布 UI(关闭 spec §4.9 长期留后)

**交付**:承接 spec §4.9 多画布 UI 留后(schema 早支持,web 端缺最后一块)。① `apps/web/src/lib/canvas-store.ts`(新,~200 行):web-local 多画布 state(模式同 cards/drafts/media/canvas-view/settings),`cys-stift.canvases.v1` 存储 `CanvasesSnapshot { canvases, activeCanvasId }`,永远 seed `DEFAULT_CANVAS_ID`,setActive / create(dedup 命名)/ rename / delete(idempotent,删 default 拒绝,删 active 自动 fallback default);② `apps/web/src/app/canvas/page.tsx`:`useCanvases()` + `activeCanvasId` 取代硬编码 `DEFAULT_CANVAS_ID`,工具栏加 native `<select>` Canvas 切换器 + pencil 笔 inline rename input + `+New` / `Rename` / `Delete` ghost 按钮,删除 Modal 列出画布名 + 卡数,确认前先 `removeFromCanvas` 把所有卡回 inbox(防静默丢失),`<TldrawCanvas key={activeCanvasId}>` 切画布 remount 避免 stale editor;③ 新 `CanvasSwitcher` 子组件(select + pencil 模式);④ `scripts/multi-canvas-shots.cjs`(新,15 断言 + 6 截图)。Tag **v0.15.0-multi-canvas**。

**核心承诺验证**:

- /canvas 显示 default 画布,switcher active + 1 卡 visible ✓
- default 画布 Delete 按钮 disabled(防删 seed)✓
- +New "Project B" → 切到 Project B(active 切换),tldraw 0 shapes ✓
- 切回 default → 卡重新 visible(1 shape)✓
- Project B → rename "Project C" ✓
- Delete Project C → confirm Modal 出现(显示 0 cards)→ 确认 → 列表回 ["default canvas"] + active 回到 default-canvas ✓
- seed 卡仍 canvasPosition.canvasId = 'default-canvas'(无静默丢失)✓
- 9 个回归 e2e 全过
- domain 17 / db 7 全绿;web build exit 0,**14 静态页**
- /canvas 484 → 486 kB(+2 kB 切换器 / 2 Modals)
- 0 page error

**关键工程决策**:

- **新 web-local store,非迁 domain**:`CanvasService` 已存在(Phase 2),但其接口接收 repository(db 包,Phase 8 Tauri 才用);MVP 阶段用 `canvasStore` web-local 持久化 canvas 列表 + active 选择,与 cards/drafts/media 等 5 个 web-local store 模式一致 —— Phase 8 Tauri 时公共 API 不变,迁不迁后端看需
- **native `<select>` 而非自造 popover**:a11y 0 成本 + 工具栏 32px 高度合适,自造 dropdown 增加 50+ 行代码没收益
- **`<TldrawCanvas key={canvasId}>` remount**:`loadCardsIntoEditor` 只在 onMount 跑一次,切画布若不 remount 会有 stale shapes
- **删除前 `removeFromCanvas`**:用户删画布时,卡在那个画布上静默消失?先 move 回 inbox,user 在 inbox 看到所有"被画布吞掉"的卡
- **default 画布不能删**:它是 seed,删了 store 会再次 seed,但 UI 闪烁不友好;`if (id === DEFAULT_CANVAS_ID) return false` + Delete 按钮 disabled
- **删除 active 画布自动 fallback default**:`delete` 方法检测 wasActive 后 activeCanvasId 改 DEFAULT,无需 UI 提示"先切再删"
- **create dedup 命名**:`Project B` 已存在则自动 `Project B (2)`,避免 store 出现重复名
- **inbox "Send to canvas" 仍用 `DEFAULT_CANVAS_ID`(MVP 不动)**:扩到 activeCanvasId 需 inbox 接 canvasStore,扩大 scope;记入 plan 留后
- **view 持久化不分 canvasId(MVP 不动)**:`cys-stift.canvas-view.v1` 仍是单值,切画布 view 不隔离;spec §4.9 支持,plan 留后
- **0 新依赖** + **没碰 spec** + **domain 零改动**(`CanvasService` / `Canvas` 已存在)

**已知 / 后续**(全 review + UX 洞都已关闭,产品 0 open review):

- inbox "Send to canvas" 用 activeCanvasId(目前 hardcode DEFAULT)
- canvas view 持久化按 canvasId 拆分
- workspace 多 workspace 切换
- 拖卡跨画布(drag to canvas)
- 画布排序 / 收藏
- "switch to canvas X" URL hash 直链
- 暗色模式 / 标签搜索 / OPFS / 录屏
- Phase 8 Tauri build + 签名公证

详见 [`docs/plans/2026-06-20-multi-canvas.md`](../plans/2026-06-20-multi-canvas.md) + [`docs/decisions/2026-06-20-multi-canvas.md`](../decisions/2026-06-20-multi-canvas.md) + [`docs/design/screenshots/phase-multi-canvas/`](../design/screenshots/phase-multi-canvas/)。

---

## 2026-06-20 · phase multi-canvas-polish · view per canvas + active-canvas routing(v0.16)

**交付**:v0.15 plan 留后的两项 polish(共 commit `778245d`):
① `canvas-view-store.ts` 改为 `Record<CanvasId, CanvasView>`,API `get(id) / update(id, ...) / reset(id)`,`useCanvasView(canvasId)` 接受 canvasId 订阅,`CanvasEditor.onMount` 读 `canvasViewStore.get(canvasId)` + `ViewPersistenceBridge` deps 加 canvasId;
② `inbox/page.tsx` 接 `useCanvases().activeCanvasId`,`moveToCanvas` 用 activeCanvasId(替代 hardcode DEFAULT)。两个 e2e 脚本(`p6.5d-shots.cjs` + `canvas-refactor-shots.cjs`)更新 selector(读 / 写新 view shape)。

**核心承诺验证**:

- 切画布时 view 独立恢复:zoom/pan/gridMode per canvasId ✓
- /canvas → 切到 active, /inbox → "Send to canvas" 送到 active(不再是固定 default)✓
- p6.5d view 持久化回归 ✓ / canvas-refactor 回归 ✓ / 全部 10 e2e ✓
- domain 17 / db 7 / web build 14 静态页 exit 0

**已知 / 后续**:无 — review + UX 洞 + spec §4.9 + canvas polish 全交付,产品**无遗留可补功能**(除 Phase 8 Tauri build / 签名公证)。

详见 commit `778245d`。

---

## 2026-06-20 · phase dark-mode · 暗色模式(关闭 spec §5.6 长期留后)

**交付**:spec §5.6 "MVP 不做,预留 token 抽象,未来加" —— 现在加。
① `packages/ui/src/tokens.css` 加 `:root[data-theme='dark']` 变体(`--color-white` ↔ `--color-black` 互换,hue tokens 调亮保 AA,soft 变深 washes,borders 改灰);**用 `:root[data-theme='dark']` 而不是 `[data-theme='dark']`** 以更高特异性压过 Tailwind v4 `@theme` reset;
② `apps/web/src/lib/settings-store.ts` 加 `theme: 'light' | 'dark' | 'system'` 字段(default 'system') + `updateTheme()` + public `subscribe()`;
③ `apps/web/src/lib/theme.ts`(新):`resolveTheme(pref)` 优先级 explicit > system(`matchMedia`) > light;`applyTheme()` 写 `data-theme` on `<html>` + sync `--tl-bg` on `<body>` 让 tldraw surface 跟;
④ `apps/web/src/components/theme-boot.tsx`(新):client-only mount,`useThemeApplication` 订阅 settings 变化 + OS dark-mode flips;
⑤ `apps/web/src/app/layout.tsx` head 加 inline script 同步读 localStorage + apply theme 在 first paint,**避免 dark-mode flash**;
⑥ `apps/web/src/app/settings/page.tsx` 加 Appearance section(Theme `<select>` Light/Dark/Follow system)。
Tag **v0.17.0-dark-mode**。

**核心承诺验证**:

- 默认 `data-theme=light`,`--color-white=#fafafa`,`--color-black=#0a0a0a` ✓
- /settings 选 Dark → `data-theme=dark`,`--color-white=#0a0a0a`(背景翻黑),`--color-black=#fafafa`(文本翻白)✓
- reload → inline head script 重新 apply dark before paint(无 flash)✓
- /inbox 切到 dark 立即生效 ✓
- 切回 light 立即生效 ✓
- 切到 system → headless 无 OS dark preference,resolve 为 light ✓
- 11 断言全过 + 0 page error
- 10 个回归 e2e 全过
- domain 17 / db 7 / web build 14 静态页 exit 0
- /settings 4.47 → 4.68 kB(+Appearance section)

**关键工程决策**:

- **`:root[data-theme='dark']` 而非 `[data-theme='dark']`**:0,1,1 specificity 压过 Tailwind v4 `@theme` reset 的 `:root`(0,0,1),确保 dark variant 真生效
- **inline head script 防 flash**:read localStorage + apply data-theme 在 first paint 之前,client 启动后 ThemeBoot 接管 OS theme 变化监听
- **6 原色不变**:包豪斯红/黄/蓝/灰保留,只调亮度(浅→深→浅,dark 调更亮)保 AA 对比度;不引入第七色(守 spec §5.2)
- **theme = 'system' 默认**:尊重 OS 偏好;`matchMedia('(prefers-color-scheme: dark)')` 实时跟踪
- **tldraw bg 跟随**:theme.ts applyTheme 时同步 `--tl-bg` on `<body>`,tldraw 的 canvas surface 跟随页面主题
- **公共 `subscribe()` API**:settingsStore 暴露 subscribe 给 theme.ts,统一 hooks + imperative 消费
- **0 新依赖** + **没碰 spec** + **domain 零改动**

**已知 / 后续**:**无遗留可补功能**(除 Phase 8 Tauri build / 签名公证)。

详见 [`docs/decisions/2026-06-20-dark-mode.md`](../decisions/2026-06-20-dark-mode.md) + [`docs/design/screenshots/phase-dark-mode/`](../design/screenshots/phase-dark-mode/)。

---

## 2026-06-20 · v0.22.0-ui-polish

UI polish 三合一,不动数据/接口/依赖,基于 v0.15 干净基线重启(v0.18/19/20/21 决策档保留,代码未落地)。

- **fix(canvas)**: 折叠三层 UI 为两层(canvas/page.tsx 删 3 个冗余节点 + tldraw 自带 chrome `components` prop 屏蔽 + canvas `.page` 用 `var(--app-menu-height)` 避免底部裁剪) → `cc914a5`
- **fix(layout)**: 修 hydration mismatch("1 error" 红标真根因),`<html>` 加 `data-theme="light"` + `suppressHydrationWarning` → `9325cca`
- **polish(tiles)**: 卡片 CJK 断字规则 + grid 列宽 280→320 + 字重 500→600 + 行间距 < 列间距 → `a1186fa`

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- puppeteer mini-audit 6/6 页 passed, 0 console error, 0 overflow
- 6 张截图 commit 到 `docs/design/screenshots/phase-canvas-polish/`

详见 [`docs/decisions/2026-06-20-ui-polish.md`](../decisions/2026-06-20-ui-polish.md)。

---

## 2026-06-20 · v0.22.0-ux-polish

UX walkthrough 修复 5 个真 bug(plan 完成后 puppeteer-driven deep walkthrough 发现),集中 commit `e8a8da4`。

- **fix(canvas)**: 空状态加 "EMPTY CANVAS" + 双击提示 overlay(`onCanvas === 0` 时显示)
- **fix(trash)**: Modal 关不掉 bug(`!== undefined` → `!= null`)
- **fix(markdown)**: 移除空 body 的 "(no body)" 占位文案(直接 return null)
- **fix(card-detail-modal)**: Edit card 标签间距收紧(`.cd__field gap` 12→4px,first-child margin-top: -8px)
- **fix(inbox)**: active tab 字重 500→600
- **fix(tile)**: CJK 断字规则再修正(`word-break: keep-all` 真正解决 "中文" 被拆的问题)

**已知遗留**(out of scope,需更大改动): Soft-delete 按钮红色 variant 与 Capture 红色冲突、Archive tab 空文案不准确、Capture placeholder 红色对比度差、favicon.ico 404。

详见 [`docs/decisions/2026-06-20-ui-polish.md`](../decisions/2026-06-20-ui-polish.md) 后续 §v0.22.0-ux-polish。

---

## 2026-06-20 · v0.22.1-ux-polish-2

闭合 v0.22.0 deep walkthrough 留的 3 个 deferred UX bug(原 BUG 14/15 经勘察确认不成立,跳过)。

- **fix(ui)**: `Button variant="danger"` 改为 red-outline(白底 + 红字 + 2px 红边框 + red-soft hover)→ 7 处同步生效,与 Capture 红填充视觉权重区分
- **fix(inbox)**: archived tab 空文案改为"Nothing archived yet." + 完整操作引导(指明入口 + 解释归档 vs 软删除)
- **feat(web)**: SVG favicon(`apps/web/src/app/icon.svg`),Next.js App Router 自动发现 + 注入 `<link rel="icon">` → 消掉 favicon.ico 404

详见 [`docs/decisions/2026-06-20-ux-polish-2.md`](../decisions/2026-06-20-ux-polish-2.md)。

---

## 2026-06-20 · v0.23.0-modal-mini-input-polish

闭合 BUG 12(共享 card-detail Modal 标题与首字段间距)+ mini-input 暗色红边框视觉冲击,纯 CSS,不动 data/接口/依赖。

- **fix(card-detail)**: `.cd > :first-child { margin-top: calc(-1 * var(--space-2)) }` 加到共享 `features/card/card-detail.tsx`,与 v0.22.0 修过的 `features/canvas/card-detail-modal.tsx:221` 对齐(canvas-modal 已修,共享 detail 漏了)。消除两个 Modal 视觉分裂 → `6c94a3a`
- **polish(mini-input)**: `.mi-frame` 边框 `2px → 1px`,亮暗都更克制。暗色 `--color-red: #ff4d4d` 在 `#0a0a0a` 深底上 2px 过粗,1px 仍识别为 Capture 入口但不冲击。8px 顶部红条(capture region)+ textarea focus 红下划线均不动 → `1cf45ec`

**验收**:

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- puppeteer mini-audit 6/6 页 passed, 0 console error, 0 overflow

详见 [`docs/decisions/2026-06-21-modal-mini-input-polish.md`](../decisions/2026-06-21-modal-mini-input-polish.md)。

---

## 2026-06-20 · v0.23.1-i18n-hardening

Review 驱动的 i18n hardening。修了 6 处硬编码英文 + 1 个调试辅助(原本静默吞错)+ 1 个潜在 UX bug(archive select 按钮复用 viewGrid 标签)。

- **fix(archive)**: floater + 批量删除 confirm modal 全 i18n(原硬编码 "Unarchive" / "Soft-delete" / "Clear" / "selected" / "Cancel" / "(untitled)")→ `9c6e771`
- **fix(archive)**: select 按钮原本误用 `t('archive.viewGrid')` 显示 "Grid",新建 `archive.select` → `9c6e771`
- **fix(card-detail)**: "Send to canvas" 按钮 + "on canvas" Tag 硬编码 → `t('card.detail.sendToCanvas'|'onCanvas')` → `9c6e771`
- **fix(inbox)**: 卡片无标题 fallback `(untitled)` → `t('card.untitled')` → `9c6e771`
- **fix(trash)**: 软删除 confirm body `(untitled)` → `t('card.untitled')` → `9c6e771`
- **fix(settings)**: `labelFor()` 键名 "Space" / "Comma" / "Period" → `t('settings.key.*')` → `9c6e771`
- **feat(i18n)**: `t()` 缺失 key 时 dev-mode `console.warn` 一次,生产仍静默返回原 key(避免 console 污染)→ `9c6e771`

**新增 i18n keys**(15 个):`card.untitled` / `card.detail.sendToCanvas` / `card.detail.onCanvas` / `archive.select` / `archive.floater.{selected,unarchive,softDelete,clear}` / `archive.batchDeleteConfirm{TitleN,CardsHeader,AndMore,Recovery,Action}` / `settings.key.{space,comma,period}`

**验收**:

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件 / +48 -29 行 / 1 个 commit

详见 [`docs/decisions/2026-06-21-i18n-hardening.md`](../decisions/2026-06-21-i18n-hardening.md)。

---

## 2026-06-20 · v0.23.2-hardening

Review 驱动的 robustness 改动,4 个非 i18n 类 bug(并发 / 校验 / locale / 平台冲突)。

- **harden(media-store)**: `attach()` 有 2 个 await,期间并发调用 loadAssets 拿同一旧 map,后写覆盖前写(静默丢数据)。新增 `enqueueWrite()` promise chain 串行化所有写入,`attach()` + 新增 `removeAsync()` 都走队列 → `a988dfc`
- **harden(export-service)**: `importFromJson()` 只校验顶层 shape,per-card 结构无校验(无 id / 非字符串 title 直接入库污染 DB)。新增逐卡字段检查:id 必填 + 非空、title/body 必为字符串、createdAt/updatedAt 为 ISO 字符串或 undefined → `a988dfc`
- **fix(mini-input)**: Enter 展开 body 用 `document.activeElement.placeholder === t('capture.miniTitle')` 检测 title 焦点,locale 切换后 placeholder 字符串变,匹配失败 → 改用 `e.target.tagName === 'INPUT'`(DOM 属性与 locale 无关)→ `a988dfc`
- **fix(search-shortcut)**: 全局快捷键 ⌘K / Ctrl+K 在 Windows Edge 触发浏览器搜索栏 → 改成 ⌘/ / Ctrl+/(Linear/Notion/GitHub 约定,所有主流浏览器未占用)→ `a988dfc`

**验收**:

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 4 个文件 / +123 -15 行 / 1 个 commit

详见 [`docs/decisions/2026-06-21-hardening.md`](../decisions/2026-06-21-hardening.md)。

---

## 2026-06-20 · v0.23.3-critical-and-latent

Review 驱动第二轮。3 个并行 Explore agent 全代码 + UX walkthrough + 未完成功能 audit。5 个 Critical(数据/safety/重复创建)+ 5 个 Latent(队列/快捷键/a11y/警告刷屏)。**全 10 项现场独立核对,0 误报**。

### Critical(数据丢失 / safety / 重复创建)

- **fix(search)**: `onSave` 只更新本地 state,关闭 Modal 后修改丢失。改调 `service.update()` 与 archive/inbox 一致 → `2638687`
- **fix(trash)**: "永久删除"原仅 Cancel/Confirm 一次性删(文件头注释说"type delete to confirm"是 stale)。加必填 `type delete` 输入框,红按钮在 match 前禁用。新增 2 个 i18n key → `2638687`
- **fix(canvas)**: 空白处快速 dblclick 重复创建卡 — `captureSinkRegistry.submit()` 微任务 resolve,第二击进入时第一张 shape 还没入库。加 `creating` latch 在 `.finally()` 清 → `2638687`
- **fix(mini-input)**: rapid ⌘↩(或双击按钮)可能重复提交 — `submit()` 重新进入。加 `submitting` latch + Save 按钮 disabled → `2638687`
- **fix(card-detail)**: view 模式 Modal 标题 `card.title \|\| '(untitled)'` 硬编码英文(zh 用户看英文 fallback)。改用 `t('card.untitled')` → `2638687`

### Latent(队列 / 快捷键 / a11y / 警告刷屏)

- **harden(media-store)**: `remove()` 同步版 bypass v0.23.2 enqueueWrite 队列,与并发 attach race。内部改走队列,API 保持 `void` → `3d9bb6c`
- **harden(search-shortcut)**: ⌘/ 在 input/textarea/contentEditable 内也触发,抢焦点跳走。加 e.target tag 检测排除 → `3d9bb6c`
- **a11y(archive-card-tile)**: /trash 的 tile 是空 button,Tab+Enter 无反应。ArchiveCardTile 加 `disabled` prop,disabled 时渲染非交互容器(`aria-disabled` + `role=img`)。顺手修了同文件 3 处硬编码 `(untitled)` → `3d9bb6c`
- **harden(i18n)**: `t()` 缺 key 的 dev warn 每次 render 都打,1 个 typo 刷屏。用模块级 Set 按 `locale:key` 去重 → `3d9bb6c`
- **harden(media-store)**: quota 警告每次 attach 都打,重拖同一文件刷屏。用 Set 按 `name:size:mtime` 去重 → `3d9bb6c`

**新增 i18n keys**(2 个):`trash.deleteForeverConfirm` / `trash.deleteForeverTypePlaceholder`

**验收**:

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 10 个文件 / +172 -46 行 / 2 个 commit

详见 [`docs/decisions/2026-06-21-critical-and-latent.md`](../decisions/2026-06-21-critical-and-latent.md)。

---

## 2026-06-20 · v0.24.0-card-pinning

Phase A(快速完善)。给 `Card.pinned`(domain Phase 2 就有但无 UI)接上完整交互。

- **feat(inbox)**: CardTile 重构为 `div > pin-btn > main-btn`(button 不能嵌套 button)。★ 按钮 toggle pinned,pinned 卡左边条 + 边框转 `--color-yellow`。列表用稳定分区(filter 而非 sort)pinned 前置 → `5117cce`
- **feat(archive)**: ArchiveCardTile 加可选 `onTogglePin` prop(传了才渲染 ★,/trash disabled / /search 不传 → 无按钮)。/archive 列表 pinned 前置 → `5117cce`
- **feat(card-detail)**: `CardDetailAction` 加 `'pin'` + `onTogglePin` prop → view toolbar Pin/Unpin toggle 按钮。inbox/archive/search 三个 caller 接上 → `5117cce`
- **i18n**: `card.detail.pin`(固定)/ `card.detail.unpin`(取消固定)→ `5117cce`

**关键决策**:
- toggle 走 `service.update(id, { pinned })`,**不加新 domain 方法**(YAGNI,domain 已支持)
- 排序用 `filter` 分区而非 `sort()` — sort 跨引擎不稳定,分区保序
- canvas 卡片**不加** pin — canvas 用位置/z 表达重要性,canvas modal 是独立 Phase 4 组件保持 MVP
- domain **零改动**(pinned 字段 + UpdateCardPatch + update() 第 121 行 Phase 2 就绪)

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件 / +235 -31 行 / 1 个 commit
- pinned 状态持久(reload 后仍在),i18n 中英切换正确

详见 [`docs/decisions/2026-06-21-card-pinning.md`](../decisions/2026-06-21-card-pinning.md)。

---

## 2026-06-20 · v0.24.1-modal-focus-trap

Phase B(a11y)。ui 包 Modal 加 focus trap,所有 Modal(card-detail / archive batch / trash hard-delete / canvas CRUD)受益。

- **a11y(ui)**: Modal 打开时 focus 进入 frame(首个 focusable,否则 frame 本身 tabIndex=-1);Tab/Shift+Tab 在 frame 内循环;关闭时 focus 回到触发元素。每个 trap 只在自己 frame 持有焦点时干预 → modal 栈(card-detail → confirm-delete)只有顶层 trap 接管按键。Escape 仍由 caller 处理(不变)→ `5580b15`
- **fix(design)**: Modal 现在是 `'use client'`(ui 包第一个用 hooks 的组件),/design 是 server showcase 页(export metadata),不能传函数 onClose 给 client Modal。ModalExample 的 `open={false}` 真 Modal 改为纯 CSS 视觉 mockup(真组件在 /inbox 等验证)→ `5580b15`

**关键决策**:
- Modal `'use client'` — focus trap 必须,ui 包首个 client 组件
- 每个 trap 自检 `frame.contains(activeElement)` → 多层 modal 不抢键
- frame `tabIndex=-1` 作 focus fallback(无 focusable 子元素时);`:focus { outline: none }` 因视觉指示由内部控件承担
- design 页保持 server(保留 metadata export),不抽 client 子文件(YAGNI,真 Modal 在产品页验证)

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 3 个文件 / +90 -9 行 / 1 个 commit

详见 [`docs/decisions/2026-06-21-modal-focus-trap.md`](../decisions/2026-06-21-modal-focus-trap.md)。

---

## 2026-06-21 · v0.25.0-tauri-global-shortcut

Phase C(战略级)。桌面端全局快捷键:app 后台/失焦时 ⌘⇧Space(mac)/ Ctrl+Shift+Space(win)也能唤起 capture。**桌面端相对 web 的核心差异落地**。

- **feat(src-tauri)**: `tauri-plugin-global-shortcut v2.3.2` 注册 `CmdOrCtrl+Shift+Space`,handler show+focus 主窗口 + emit `global-capture-open` event。plugin load/register 失败 eprintln 不 panic → `c83eedf`
- **feat(config)**: `tauri.conf.json` `app.withGlobalTauri=true` 注入 `window.__TAURI__`;capabilities `+global-shortcut:default` → `c83eedf`
- **feat(capture-host)**: 新 useEffect 监听 `window.__TAURI__.event.listen('global-capture-open')` → 打开 Mini Input(source 'shortcut')。浏览器环境(`__TAURI__` undefined)自动 no-op → `c83eedf`

**关键决策**:
- 用 `withGlobalTauri` 而非装 `@tauri-apps/api` → web 包零新依赖,浏览器仍可跑
- 硬编码 `CmdOrCtrl+Shift+Space`(Tauri 自动 mac=Cmd/win=Ctrl,与 web 默认一致);动态配置(前端 settings → Rust 重注册)defer
- handler show+focus+emit 三步;plugin/register 容错(eprintln,不 fatal)

**验收**:
- cargo check exit 0 + pnpm web build exit 0 + **cargo tauri build exit 0**(release 13.89s,产 .app + .dmg)
- ⚠️ **全局唤起效果未经 GUI 实测**(无 GUI 环境),交付代码 + .app,用户手动测:最小化/切后台后按 ⌘⇧Space 应唤起窗口 + Mini Input
- 7 个文件 / +262 -9 行 / 1 个 commit

详见 [`docs/decisions/2026-06-21-tauri-global-shortcut.md`](../decisions/2026-06-21-tauri-global-shortcut.md)。

---

## 2026-06-21 · v0.25.1-review-bugfixes

Review 驱动。3 个并行 Explore agent 复核 v0.24-v0.25,6 项全修(4 真 bug + 2 一致性 gap)。

### 🔴 真 bug

- **fix(capture-host)**: Tauri listener 泄漏 race — `listen()` 返回 Promise,unmount 早于 resolve 时 cleanup no-op → listener 永久泄漏。加 cancelled flag,.then 内检查已取消则立即 unregister → `78b1bba`
- **fix(archive-card-tile)**: `/trash` 软删除的 pinned 卡仍显示黄边(pin 按钮被 disabled 隐藏但 `tile--pinned` class 仍加)。cls 里 `disabled` 时不加 `tile--pinned` → `78b1bba`
- **fix(card-detail)**: inbox detail 的 Pin 按钮在 send-to-canvas 后仍在(可 pin canvas 卡,违反决策)。`showPin` 加 `&& !card.canvasPosition` → `78b1bba`
- **fix(css)**: `.tile--pinned`/`.tile--selected` 改 `border-width:2px` 导致 grid reflow;且 selected+pinned 同 specificity 冲突。改用 `outline:2px`(offset -1px)叠加在默认 1px hairline 上 → 无布局抖动,pinned(后声明)胜。inbox + archive-card-tile 同步 → `78b1bba`

### 🟠 一致性 gap

- **fix(search)**: 结果加 pinned 前置 partition(与 inbox/archive 一致)→ `78b1bba`
- **fix(timeline)**: `/archive` Timeline 视图传 `onTogglePin`(行显示星)+ 每日组内 pinned 前置 → `78b1bba`

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 7 个文件 / +51 -10 行 / 1 个 commit

**defer 的 latent**(不修):pinFirst 未 memo(卡片量小 perf 可忽略)/ register 失败无 in-app 反馈 / emit 广播多 webview(单窗口无影响)/ auto-repeat 重复 emit(setOpen 幂等)/ window label 隐式 "main"(默认值稳定)

详见 [`docs/decisions/2026-06-21-review-bugfixes.md`](../decisions/2026-06-21-review-bugfixes.md)。

---

## 2026-06-21 · v0.26.4-canvas-bugfixes

深度复审([`docs/reviews/2026-06-21-canvas-deep-review.md`](../reviews/2026-06-21-canvas-deep-review.md))找到 9 个问题,本档关闭其中 4 个 critical/high(B1/B3/B4/B5)。B2 由 B3 隐式覆盖。

- **B1**: `db-client.ts` 加 `storage` event listener + 跨 tab re-hydrate,两 tab 编辑不再互相静默覆盖 → `cf2eba0`
- **B3**: `loadCardsIntoEditor` 检测 DB 与 shape 位置不一致时 `updateShape` reconcile,DB 是权威 → `cf2eba0`
- **B4**: `canvasStore.delete` 调 `canvasSnapshotStore.remove`,删画布释放 localStorage 配额 → `cf2eba0`
- **B5**: `bindCardWriteback` flush guard: 卡被删/归档/移走时跳过写回,防 300ms 窗口覆盖 → `cf2eba0`
- **e2e**: 17/17 通过(新增 5 断言覆盖 4 bug)

详见 [`docs/decisions/2026-06-21-canvas-bugfixes.md`](../decisions/2026-06-21-canvas-bugfixes.md)。

---

## 2026-06-21 · v0.26.0-high-freedom-canvas-f1

高自由画布 Phase **F1(地基)**。参考苹果无边记(Freeform),以"整理笔记"为核心,画布从"只摆灵感卡"向"自由多元素笔记整理"演进。F1 = 持久化地基 + card 内容单一数据源 + body preview。**F2(包豪斯工具栏)下一档**。

- **F1.1** `CardServiceContext` + Provider — 让 card shape component 能查 CardService → `b9d0e57`
- **F1.2** card-shape-util component 渲染查 CardService — **body preview(3 行)** + pinned 黄星 + 类型标签 + inbox→画布实时同步 + 占位(card 删时)→ `af4fe61`
- **F1.3** card props 瘦化 `{w,h}`(去 title/kind)+ binding 同步 — 单一数据源,无 stale → `b58d460`
- **F1.4** `lib/canvas-snapshot-store.ts` — per-canvas snapshot(localStorage)+ quota 容错 → `ab7f4c2`
- **F1.5** onMount `loadSnapshot` 恢复全画布(document only,camera 仍 canvasViewStore)+ `loadCardsIntoEditor` 幂等补漏 + 自由元素 `store.listen` 防抖写回 → `78777bc`

**关键决策**:
- **card 内容单一数据源**:shape 只存几何 + cardId 引用(在 shape.id),内容渲染查 CardService → inbox/archive 编辑实时反映画布,body preview 自然实现,无 sync 冲突
- **持久化**:per-canvas snapshot(`getSnapshot`/`loadSnapshot`,localStorage),document only。不用 tldraw 原生 IndexedDB(避免卡脱离 CardService 体系)
- **reset 重灾区谨慎**:F1 拆 5 步,每步独立 commit + build 验证

**验收**:domain 26/26 + db 7/7 + web build exit 0。GUI 可见改进:card body preview + pinned 星 + inbox→画布实时同步。自由元素(便签/文本/形状/箭头/手绘)持久化**已就位但待 F2 工具栏才能创建测试**(F1 阶段 hideUi 未放工具)。

详见 [`docs/decisions/2026-06-21-high-freedom-canvas-f1.md`](../decisions/2026-06-21-high-freedom-canvas-f1.md)。

---

## 2026-06-21 · v0.26.1-high-freedom-canvas-f2

高自由画布 Phase **F2(工具栏)**。F1 地基上,放开 tldraw 笔记工具,画布真正可"自由整理"。

- **feat(canvas)**: `CanvasToolbar` 组件 — 底部浮动包豪斯工具栏,8 工具(select/draw/rectangle/ellipse/arrow/note/text/eraser),`editor.setCurrentTool` 切换,`useValue('canvas tool', ...)` 响应高亮,键盘快捷键 v/d/r/o/a/n/t/e → `6ad68cb`
- **i18n**: `canvas.tools` + `canvas.tool.*`(9 key,zh/en)→ `6ad68cb`

**关键决策**:
- **保留 hideUi**:tldraw 默认彩色 chrome 与包豪斯冲突;自定义极简工具栏(mono 字符 + hairline + 硬阴影 + active 红)
- **card 仍 dblclick**:card 是结构化数据(CardService),与自由 shape 不同源,保留独立入口(DoubleClickBridge)
- **工具集**:select/draw/rectangle/ellipse/arrow/note/text/eraser — 无边记核心(手绘 + 形状 + 箭头 + 便签 + 文本),包豪斯约束(无彩色便利贴)
- **快捷键不冲突**:避开现有 + - 0 1 g;输入框内不触发

**验收**:domain 26/26 + db 7/7 + web build exit 0。GUI:工具栏切换工具,画布加便签/文本/形状/箭头/手绘,与灵感卡共存,刷新持久(F1 snapshot)。**需 GUI 实测**(无 headless canvas 测试)。

详见 [`docs/decisions/2026-06-21-high-freedom-canvas-f2.md`](../decisions/2026-06-21-high-freedom-canvas-f2.md)。

---

## 2026-06-21 · v0.36.0-search

P11(全文搜索增强 — 倒叙记录在 [`2026-06-21-p4-p7-batch.md`](../decisions/2026-06-21-p4-p7-batch.md) P11 段):

- **scoring**: title 命中 +1.5/token,body/tags/links/code/quotes 命中 +1.0/token。Sort by score desc, then capturedAt desc
- **normalise/tokenise**: 剥控制字符 + lowercase + 塌空白 + 空白 split(基础安全网,防 XSS/markdown 注入到正则)
- **`bodySnippet(card, query)`**: 200 字 body 摘要,围绕首个匹配 token 居中,头尾省略号
- **`SearchResult` interface**: `{card, score, matchedField}` — matchedField 供 snippet 抽取决定
- **`/search` UI**: 用 `ArchiveCardTile` 渲染 + 下方加 `SnippetLine` 显示 body 摘要;pinned 卡前置 partition(与 inbox/archive 一致)
- **测试**: 9 个新增 search.test.ts(normalise / tokenise / searchCards 各场景 / bodySnippet 边界)
- **vitest**: 162/162、domain 38/38、db 7/7、build 0
- **commit**: `712350c`

## 2026-06-21 · review-fix #1 · ThemeBoot 未挂载(用户报)

用户报"日/夜间模式手动调没用"。

- **根因**: `apps/web/src/app/layout.tsx` import 了 `ThemeBoot` 但 JSX body 里**没挂**。`useThemeApplication` hook 没运行 → settingsStore notify 没人听 → `data-theme` 永远停在 head inline script 初值
- **修法**: JSX body 加 `<ThemeBoot />` 一行(在 `<AIProviderSync />` 后)
- **验收**: build exit 0、vitest 162/162 不回归、GUI 实测 settings 切换 dark/light 实时生效
- **commit**: `6f5902a`

## 2026-06-21 · review-fix #2 · canvas toolbar 矩形/椭圆死按钮(用户报)

用户报"画布下面 3、4 用不了,按压动画有但不会变红也不会按下去"。

- **根因**: tldraw 3.x 把 `rectangle`/`ellipse`/`triangle`/... 合并成单个 `'geo'` 工具,具体几何形状通过 `editor.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle'|'ellipse')` 切换。原代码调 `setCurrentTool('rectangle')` 触发 `Error: root - no child state exists with the id rectangle.`,onClick handler 无 try/catch → **静默失败**。按钮按压动画是 CSS `:active`,与 handler 无关
- **puppeteer 验证 bug**: `setCurrentTool('rectangle')` 抛 `no child state exists with the id rectangle`,`'geo'` 成功
- **修法**:
  1. import `GeoShapeGeoStyle` from `@tldraw/tldraw`
  2. 抽 `activate(id)`:rectangle/ellipse 先 `setStyleForNextShapes(GeoShapeGeoStyle, X)` 再 `setCurrentTool('geo')`
  3. active 高亮:rectangle/ellipse 改用 `getStyleForNextShape(GeoShapeGeoStyle)` + `current === 'geo'`
- **puppeteer 验证修**: 拖鼠标创建 `{type:'geo', props:{geo:'rectangle'}}` shape ✓; 椭圆同理 ✓
- **验收**: build exit 0、vitest 162/162 不回归、puppeteer 实测两形状都能创建
- **commit**: `48dfaa7`
