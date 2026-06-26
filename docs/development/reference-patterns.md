# 参考项目分析 — drawio 30.2.5 + AFFiNE 0.26.3

> 📌 **栈已变更(读前注意)。** 本分析写于 2026-06-21,当时画布栈是 tldraw。**画布已于 2026-06-23 迁自研 Canvas 2D**(`packages/canvas-engine`)。文中"我们移植…tldraw 提供…"的具体 API 不再适用,但**技术与 UX 模式本身**(导出边界解析、SVG→PNG 栅格化、字体嵌入、命令面板、标签调色板、配额派生等)仍是有效参考——把"tldraw API"读作"我们的 `CanvasHost`/`CanvasElement`"即可。
>
> 来源: 2026-06-21,用户提供 drawio + AFFiNE 源码 zip,挖可移植技术/UX 模式。
> 原则: **只采技术与 UX,不采架构**(我们栈 = Next.js 静态导出 + tldraw 3.15 + localStorage + 纯 TS domain,无 yjs/blocksuite/mxgraph/后端)。
> 每个 finding 标: 所属 phase / 技术 / 我们的移植方式 / 可移植性 / 源码位置(供核实)。

---

## P5 画布导出 — drawio 是专家,以下按实现顺序

### P5-1 导出边界解析(最重要,纯几何,无依赖)
**drawio 技术**: 导出前根据 `exportType` 选 bounds 来源三选一:
- `page` → `view.getBackgroundPageBounds()`(纸张大小)
- `diagram` / `nocrop` / `ignoreSelection` → `getGraphBounds()`(内容紧包框)
- `selection` → `getBoundingBox(getSelectionCells())`(仅选中)

然后对称加 border:`w = ceil(bounds.width*scale) + 2*border + (有阴影&&border==0 ? 5 : 0)`。背景图 rect 也会 union 进 bounds 防裁切。

**我们移植**: **直接可移植**。tldraw 提供 `editor.getCurrentPageBounds()`(内容)、`editor.getSelectedShapes()` + reduce `getShapePageBounds`(选区)、`editor.getCamera()`(视口裁切)。写一个 `resolveExportBounds(editor, {type, border, shadow})` 返回同样的三选一 + border + shadow slack。纯几何,零依赖。

**源**: drawio `src/main/webapp/js/diagramly/EditorUi.js` 周边;`Graph.js:15944-16013`;`export.js:396-416`。

---

### P5-2 SVG → PNG 栅格化管线(PNG 路径)
**drawio 技术**: 永不直接栅格 shape,恒走 **SVG → `<img>` → `<canvas>` → `toDataURL`**:
1. `getSvg()` 产出 SVG(嵌入已完成)
2. SVG 根加 `-webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale`(更锐利)
3. `new Image(); img.src = 'data:image/svg+xml;base64,'+...`
4. load 后:canvas = `ceil(scale*svgW) × ceil(scale*svgH)`,用 `getMaxCanvasScale` 钳制(防 canvas 最大尺寸崩溃)
5. 非透明:先填背景色 rect
6. 有 grid:把 grid 重画成无缩放 SVG,base64,带相位偏移 tile 绘制
7. `ctx.scale; ctx.drawImage`(Safari 需 `setTimeout(0)` 绕坑)
8. `canvas.toDataURL('image/'+fmt)`;PNG 可把 XML 塞 `tEXt` chunk、DPI 塞 `pHYs`

**我们移植**: **完全可移植,且 tldraw 更省**。`@tldraw/utils` 的 `getSvgAsImage(svg, {type, quality, scale})` 已做 SVG→blob→canvas→PNG/JPEG。我们补:(a) 绘前填背景;(b) grid tiling(若要);(c) PNG metadata chunk 写入(为 P5-4 往返)。**`getMaxCanvasScale` 钳制 + Safari `setTimeout` 必抄**——否则大画布静默失败。

**源**: drawio `Editor.js:5314-5490`;`EditorUi.js:6272-6308`。

---

### P5-3 字体嵌入(关键,本地优先必做)
**drawio 技术** 两层:
1. **先 await `document.fonts.ready`**——让页面声明的 `@font-face` 真正加载完再序列化(`export.js:777`)。这是"导出缺字体"bug 的主因:时序,不是嵌入。
2. `addFontCss(svgRoot, css)` 往 SVG `<defs>` 注入解析后的 `@font-face`。Google Fonts 走 `@import url(...)`,否则 `@font-face{font-family; src:url(...)}`。

**我们移植**: **基本可移植,一处gap**。tldraw 用浏览器已加载字体渲 SVG。本地优先配方:
- `await document.fonts.ready` 再 `getSvgString`——直接抄
- 拿到 SVG 字符串后,扫 `<text font-family=...>`,对每个用到的 face 调 `FontFace.load()`,拿到 buffer 后手注 `@font-face{src:data:base64...}`
- **不抄** Google Fonts `@import` 捷径(本地优先不应依赖网络字体 CDN,强制 base64 data URI 路径)

**可移植性**: tldraw 不自带此步,是 SVG 字符串后处理。**标记**: Google-Fonts-`@import` 路径 **不可移植**(违背本地优先)。

**源**: `EditorUi.js:10122-10155`;`export.js:777, 871-913`;`Editor.js:4673-4764`。

---

### P5-4 嵌入源码实现往返(`.cystift.svg` / `.cystift.png`)
**drawio 技术**: `embedXml` 开时,全图 XML 经 URL 编码塞进 `svgRoot.setAttribute('content', ...)`;PNG 则写进 **`tEXt`** chunk(键 `mxfile`)。重导入读回。文件名 `name.drawio.svg` / `name.drawio.png`。

**我们移植**: **可移植,且对我们价值更高**。tldraw `editor.store.serialize()` 给快照;我们把 `db` JSON 存 SVG 根 `data-cystift` 属性 / PNG `tEXt` 键 `cystift`。**单文件便携卡片**——拖个 `.cystift.png` 到任何地方重导入即恢复完整可编辑画布+卡片元数据。本地优先 app 高杠杆。PNG chunk 写需一个 ~40 行纯 TS PNG-tEXt writer(drawio `Editor.writeGraphModelToPng` 参考)。

**源**: `EditorUi.js:6272-6295, 7416-7420`;`export.js:845-855`。

---

### P5-5 导出对话框选项集(标签/默认值蓝本)
**drawio 选项**: `format`(png/jpeg/webp/svg/xmlsvg/pdf)、`scale`(float,'auto' 适配页)、`border`(int,默认 0)、`w/h`、`transparent`(**jpeg/webp 禁用**)、`embedImages`('1' 内联外链图为 data URI)、`embedFonts`、`embedXml`、`shadow`、`grid`、`dpi`(PNG,100/200/300/400,写 `pHYs`)、`linkTarget`、`theme`(auto/light/dark)、`exportType`(diagram/page/selection)、`include`(allPages/currentPage)。

**我们移植**: tldraw `getSvgString` 接受 `{scale, background, padding, darkMode}`(子集);其余(border/transparent/jpeg-block/dpi/grid/theme/selection/font+image 嵌入)我们自建面板。drawio 选项名=我们 UI 标签的抄写源。

**源**: `export.js:332-351, 826-913`;`EditorUi.js:7306-7496, 9047-9447`。

---

### P5-6 主题感知导出(亮/暗/跟随)
**drawio 技术**: 渲前快照并 override `mxUtils.preferDarkColor` 等全局,CSS `light-dark(...)` 解析到对应极,渲后还原。PNG 路径单独 `getLightDarkColor(bg)` 取 `.light`/`.dark`。

**我们移植**: **tldraw 更干净**。`editor.userPreferences.setColorScheme('dark'|'light')` → 快照 SVG → 还原。导出对话框加一行"导出为:亮/暗/跟随 app"。

**源**: `EditorUi.js:7347-7354`;`Editor.js:5376-5385`。

---

### P5-7 PDF / 打印(部分可移植)
**drawio 技术**: `mxPrintPreview.addGraphFragment` 把大图 tile 到 N 个打印页:算每页 scale、translate view 让每页显不同 clip rect、CSS `transform:scale()translate()`。`export.js` 服务端 PDF 走无头浏览器。

**我们移植**: **分页数学可移植;逐 shape 重绘不可移植**。浏览器打印(`window.print()` + CSS `@page`)路:整 SVG 渲一次,CSS `transform`+`clip-path` 显每 tile。**服务端 PDF 不可移植**(无后端),标记跳过。v1 不做 PDF,后续用同 dispatch shape 加。

**源**: `mxPrintPreview.js:857-946`;`export.js:1295-1365`。

---

### P5 显式不可移植(勿浪费时间)
- `mxImageExport.js` shape-walk(tldraw `getSvgString` 已内置,跳)
- `export.js` 服务端渲染 / `ExportProxyServlet`(无后端)
- drawio Google-Fonts-`@import` 字体捷径(违背本地优先)
- `mxPrintPreview` 逐-shape-clip 重绘

---

## P11 全文搜索 — drawio 给骨架,AFFiNE 给 UX/排序

### P11-1 AFFiNE 多 session 命令面板(cmdk)— 头号 polish
**AFFiNE 技术**: 面板非单一搜索框,而是多个独立 session 各发 item(带 `source`/`group`(含 rank)/`payload`),聚合器拼起来。打开时 session:`RecentDocs`/`Collections`/`Commands`/`Creation`/`Docs`(FTS)/`Links`/`Tags`。提交时 dispatcher 按 `result.source` 路由(openDoc/openCollection/openTag/跑命令/建页)。

**我们移植(极易)**: 弃 yjs/rxjs 管道,留架构。定义:
```ts
type Session = { source: 'recent'|'card'|'tag'|'command'|'create'|'canvas';
                 query(q): Item[]; group: {id;label;score} }
```
每个 session 是 Card[]/tags 上的纯函数。一次 Cmd/Ctrl+K 面板给齐:最近卡片/跳标签/切画布/建卡/FTS。

**源**: AFFiNE `packages/frontend/core/src/modules/quicksearch/services/cmdk.ts`;`impls/docs.ts`;`recent-docs.ts`;`tags.ts`。

### P11-2 AFFiNE FTS 查询形态(标题加权 + 高亮 snippet)
**AFFiNE 技术**: 单次 `aggregate$` 构布尔查询——must match content + should match + **boost 1.5 给 `affine:page` flavour(标题权重高于正文)**;取 top 50 doc、每 doc top 2 高亮 hit,自定义 `before:'<b>', end:'</b>'`。结果 `{docId, title, score, blockId, blockContent}`,blockContent 当 snippet。

**我们移植(采形态)**: 标题命中>正文命中、每卡 1 snippet、限 ~50。首次开面板时对 `Card.title + Card.body` 建懒加载内存倒排,写时刷新。score = `titleHit?1.5:0 + bodyHitCount`。localStorage 下数千卡足够。

**源**: AFFiNE `modules/docs-search/services/docs-search.ts`(`search$` 体)。

### P11-3 AFFiNE snippet 高亮器(逐字可抄)
**AFFiNE 技术**: `highlighter(originText, before, after, matches, {maxLength:50, maxPrefix:20})`:合重叠区间→以首 match 为中心切 maxLength 窗口→包 match→截断处加 `...`。配套 `<HighlightText>` 把标记串拆高亮/纯 span。

**我们移植(逐字)**: `highlighter.ts` + `highlight-text.tsx` 基本原样抄——纯函数(字符串 + `[number,number][]`),无 blocksuite 依赖。配 FTS 返回的 match offset。

**源**: AFFiNE `modules/quicksearch/utils/highlighter.ts`;`views/highlight-text.tsx`。

### P11-4 AFFiNE recent-docs LRU(最近用)
**AFFiNE 技术**: `RecentDocsService` workspace local state 键 `'recent-pages'` 存最多 3 doc id。`addRecentDoc`:去重、超 cap 弹尾、unshift。空 query → 显 recent;非空 → recent session 返 `[]`。

**我们移植(逐字)**: localStorage 存最近 5–8 个打开的卡片 id;空 query 时面板显。trivial win。

**源**: AFFiNE `modules/quicksearch/services/recent-pages.ts`。

### P11-5 drawio FindWindow 匹配骨架(可移植算法)
**drawio 技术**:
- 候选=所有 cell,每次现搜(无预索引);对我们=所有卡
- 归一:`label.replace(/[\x00-\x1F\x7F-\x9F]|\s+/g,' ').trim().toLowerCase()`(剥控制字符+塌空白)——便宜有效的"准模糊"
- 匹配:默认子串 `indexOf`;勾选 regex 则 `new RegExp`
- **HTML label → DOM 剥 HTML 再匹配**:`tmp.innerHTML=sanitizeHtml(label); label=extractTextWithWhitespace([tmp])`。对我们关键:markdown/code 卡身带 markup,需剥成纯文本
- 单函数兼顾首/下一 match:用 `active` flag,过 `lastFound` 后才置 active

**我们移植**: domain.Card[] 替 cell;`title + body`(markdown 剥成文本)替 label。HTML 剥文本 = md 渲到临时 DOM 读 `.textContent`。tldraw `editor.zoomToShape(id)`/`setSelectedShapes([id])` 替 scroll/select。单函数首/下一 trick 值得抄。

**源**: drawio `Dialogs.js:9299, 9432-9620`。

### P11-6 drawio 跨字段 `testMeta`
**drawio 技术**: cell value 是带属性对象时,遍历属性,**跳过 `label`**(已搜),归一后子串/regex 匹。所以搜 label + 每个属性(URL/tags/notes 等)。

**我们移植(直接)**: `searchCard(card, q)` 拼 `Object.values` 可搜字段(title/body/url/tags[]/kind/quotes 等,排除二进制),同样归一子串/regex。"元数据遍历跳主文本字段"防重复计数。

**源**: drawio `Dialogs.js:9383-9405, 9526-9530`。

### P11-7 模糊 — drawio 不满足,gap
drawio 是纯子串+可选 regex,**无 tokenized 排序**。我们 P11 "fuzzy" 用 `Fuse.js` 或手写 trigram/bigram scorer 叠在 P11-5 骨架上。drawio 贡献匹配脚手架(归一/HTML剥/跨字段/next/多源),不贡献排序。

---

## P4 标签 / 分类 — AFFiNE 是蓝本

### P4-1 AFFiNE Tag 实体 + 10 色固定调色板
**AFFiNE 技术**: Tag 一等实体(非 doc 属性)。每 tag 稳定 id + value + **10 色固定调色板之一**(Red/Teal/Blue/Yellow/Pink/White/Gray/Orange/Purple/Green)。三向色映射:`tag-*`(点)↔ `chip/label/*`(chip bg)↔ `palette-line/*`(行淡 tint)。`TagService.randomColor()` 新建随机选调色板项。doc 在 meta 里用 id 数组引用。

**我们移植(全可移植)**: Card 加 `tags: TagRef[]`(id+color);localStorage 维护 `tags: Tag[]` 索引。抄 10 色调色板概念——固定调色板意味着永不碰任意 hex,chip 永远一致。新建 tag 自动随机调色板色(同 UX)。

**源**: AFFiNE `modules/tag/entities/tag.ts`;`entities/utils.ts`(色映射);`service/tag.ts`(`tagColorIds`, `randomColor`)。

### P4-2 AFFiNE Collections = 保存的过滤规则(非文件夹)— 差异化点
**AFFiNE 技术**: "collection" = 命名的保存查询,由 `FilterParams`/`OrderByParams`/`GroupByParams` 组成。filter 是可插拔 provider(`tags`/`created-at`/`updated-at`/`favorite`/`trash`/`text`),各实现 `filter$(params): Set<docId>`。tags filter 5 法:`include-all`/`not-include-all`/`include-any-of`/`not-include-any-of`/`is-not-empty`。order-by provider(`updated-at`/`created-at`/`title`)排序。

**我们移植(采 idea,不采 rxjs)**: P4 最佳 idea。不给卡套文件夹,给用户**智能 collection** = 保存的 `{tagIds, type, dateRange, freeText}` 谓词,对 Card 数组重算。filter 法名(`include-any-of` vs `include-all`)直接映射 tag chip 多选 UI。纯函数实现 `(cards: Card[], rule: Rule) => Card[]`。规则数组 localStorage 持久化。

**源**: AFFiNE `modules/collection-rules/types.ts`;`impls/filters/tags.ts`(5 法);`impls/order-by/updated-at.ts`。

### P4-3 AFFiNE Favorites 是类型联合(非 boolean)
**AFFiNE 技术**: `FavoriteSupportTypeUnion = 'collection'|'doc'|'tag'|'folder'`。啥都能收藏。侧栏 Favorites 显混合。

**我们移植**: 让用户星标卡、标签、保存的 collection。一个 `favorites: {type, id}[]` 数组。侧栏 Favorites 区混合渲染。

**源**: AFFiNE `modules/favorite/constant.ts`。

### P4-4 drawio hidden-tags 过滤窗口
**drawio 技术**: `plugins/tags.js` 把 tag 存 cell XML 属性,带 `HiddenTagsWindow` checklist UI 切 tag 可见性,发 `mxEvent('hiddenTags')` 重过滤。无状态过滤(每次渲染重算,不持久化视图态)。

**我们移植(概念可)**: Card 已有 `tags[]`。"hidden tags" 过滤窗口=多选 chip list 过滤画布/卡。React 组件 + 过滤函数。"无状态过滤"是有意简洁,值得抄。低 effort 中回报。

**源**: drawio `plugins/tags.js:1-50`。

---

## Storage / 配额 — 升级我们已有 localStorage 仪表盘

### S-1 AFFiNE 配额派生(used/max/percent/formatted/color)
**AFFiNE 技术**: `WorkspaceQuota` 暴露 `used$`/`max$`/`percent$`(`= min(100, max(0.5, used/max*100))`——**0.5 下限让近空 bar 仍可见**)/`usedFormatted$`/`maxFormatted$`(bytes lib)/`color$`(percent>80 红)。view 渲 `{used}/{max}` 文本 + 宽=percent% + bg=color。

**我们移植(抄模型,换源)**: 我们无服务端配额,但 `navigator.storage.estimate()` 返 `{usage, quota}`(Chrome/Edge/Safari 17+)。建同样派生。**`>80%→红` 和 `0.5% 下限` 两个 polish 细节逐字抄**。`estimate()` 不支持时 fallback 求和我们 localStorage 键(我们已在做的)。

**源**: AFFiNE `modules/quota/entities/quota.ts`;`views/quota-check.tsx`;`desktop/.../storage/workspace-quota.tsx`(progress bar 标记)。

### S-2 AFFiNE 超限确认对话框(分类文案)
**AFFiNE 技术**: `QuotaCheck` 盯 `usedPercent`;`>=100` 开确认 modal,`getSyncPausedMessage(...)` 按 owner/memberOverflow/storageOverflow 选 title/description/confirmText/tips。无可补救时藏 cancel。

**我们移植**: localStorage 仪表盘越阈值(如 4.5MB/5MB)弹 modal:"浏览器快满了——导出备份或删归档卡。"确认→导出流(P5-...),取消→归档管理视图。

**源**: AFFiNE `modules/quota/views/quota-check.tsx`。

### S-3 AFFiNE 全量备份 vs 快速导出区分
**AFFiNE 技术**: `DesktopExportPanel` 两按钮:"Full Backup"(先强完整 blob 下载,再整库导 `.affine`)和 "Quick Export"(不等 blob 同步,导当前态)。Full Backup 在 `fullSynced` 前禁用/loading。

**我们移植**: "全量备份"= 序列化所有卡+画布+标签+collection 成单 JSON(我们已有);"快速导出选中"= 仅选中卡/当前视图导 Markdown。两层框架(整 app 归档 vs 轻量分享)是好 UX 脚手架。

**源**: AFFiNE `desktop/dialogs/setting/workspace-setting/storage/export.tsx`。

---

## P12 UX 打磨

### P12-1 AFFiNE 多选 + selectionMode atom(批量操作)
**AFFiNE 技术**: Jotai atom `selectMode$`/`selectedDocIds$`。selectMode 真→每行显 checkbox(`selectable: !!selectionActive`);`SelectPage` 翻 selectMode 并 seed 选中。同一 list 组件靠切 atom 兼任浏览/挑选两种模式。

**我们移植**: inbox/archive list 采:Zustand 一个 `selectMode` flag;激活时行显 checkbox;粘性 footer 显批量动作(归档/删/打标签)。一个 list 组件复用"选卡加入 collection"对话框。

**源**: AFFiNE `components/page-list/scoped-atoms.tsx`;`page-group.tsx:140`;`docs/select-page.tsx`。

### P12-2 AFFiNE Markdown 适配器架构(双向 md idea)
**AFFiNE 技术**: `MarkdownAdapter` 用 `unified`+`remark-parse`+`remark-stringify`+`remarkGfm`。md→blocks:解析 mdast,walk,每 block flavour 有 matcher `toBlockSnapshot.enter/leave`。blocks→md:walk,matcher `fromBlockSnapshot`。每 block 旁自带 adapter。`gfm.ts` 就是 5 个 micromark 插件 `combineExtensions`。

**我们移植(采 idea;impl 不可移植)**: 单个 `CardMarkdownAdapter` 带 `toCard(md)`/`fromCard(card)`,基于 `unified`/`remark-parse` 白拿 GFM 表格/删除线/任务列表/自动链接(`gfm.ts` 的 5 插件列表直接抄)。**我们优势:已把 markdown 当真相源**,所以"双向"对我们主要是**渲染时**:md→渲染富文本卡,编辑→序列化回 md。别逐 block matcher,用一个 remark AST pass 把 `code`/`quote`/`link`/`image` 子节点抽进 Card 类型化子字段(若要结构)。

**源**: AFFiNE `blocksuite/affine/shared/src/adapters/markdown/markdown.ts`;`gfm.ts`;`blocks/paragraph/src/markdown.ts`(最小 block adapter 示例)。

### P12-3 Card 域层 undo/redo(命令栈)
**AFFiNE 技术**: framework store 上 `history-extension.ts` 捕事务。CRDT backed,**机制不可移植**。

**我们移植(自建)**: tldraw 自带画布 shape 的 undo/redo(`editor.undo()/redo()` + stack)。**Card 域层**实现独立命令栈:每 mutation 压 `{undo(), redo()}`。两栈(画布走 tldraw,卡走我们栈)v1 可接受。偷的 idea:单 `HistoryService` facade 按焦点委派到对应子栈。

**源**: AFFiNE `framework/store/src/extension/history/history-extension.ts`(仅概念)。

### P12-4 drawio 搜到即选中/滚到(含只读高亮)
**drawio 技术**: `setSelectionCells`/`scrollCellToVisible`/`highlightCell`(锁定不可编辑时仍显命中)。

**我们移植(易)**: tldraw `editor.setSelectedShapes(ids)` + `editor.zoomToShape(id)`。"只读时高亮而非选中"对归档/回收卡(不可编辑)是小 UX 细节,值得留。

---

## 模板 / 模板库(新 phase 候选)

### T-1 drawio 模板库 = 静态 XML 文件 + 索引
**drawio 技术**: `templates/` 目录树(`basic/`/`flowcharts/`/`uml/`/`wireframes/`…),每模板一个 XML + `index.xml` manifest + LICENSE。载入侧栏。无动态生成。

**我们移植(概念可)**: 发一个 `templates/` 文件夹的 JSON 卡集(或 tldraw 快照)——"阅读清单"/"菜谱"/"每日日记"/"代码片段包"等,各预填画布+几张卡。manifest 索引。目录按类 + manifest 简洁好用。做模板 phase 时可采。

**源**: drawio `templates/` 目录;`templates/index.xml`。

---

## 显式跳过(不可移植,勿投入)

- drawio `mxImageExport.js` shape-walk(tldraw `getSvgString` 已内置)
- drawio `mxUndoManager.js`(tldraw 自带历史栈)
- drawio `Pages.js` 页模型(深绑 mxgraph;tldraw 3.x 原生多页,用它的别 port)
- drawio `export.js` 服务端渲染 / `ExportProxyServlet`(无后端)
- drawio Google-Fonts-`@import` 字体捷径(违背本地优先)
- drawio `mxPrintPreview` 逐-shape-clip 重绘
- AFFiNE yjs/CRDT 内部、blocksuite 每-block markdown adapter(只偷 unified/remark-GFM 插件列表)
- AFFiNE edgeless toolbar widget 本体(tldraw 自带底部 toolbar)
- AFFiNE 服务端/云同步/认证/计费/移动原生
