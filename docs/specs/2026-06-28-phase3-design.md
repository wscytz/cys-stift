# 命令面板 + 标签墙 + 剪切板快捷键设计 — 知识网络 Phase 3

> 来源:产品方向 A「知识网络」Phase 3。Phase 1(图谱)/2a(块引用+全局关系)/2b(建关系)已完成。
> 三子特性:命令面板(⌘K 三合一)、标签墙(/tags)、剪切板快捷键(画布 ⌘C)。

## 背景

Phase 1-2b 补了"整理和回溯"的视图与关系操作。Phase 3 补三个独立小特性,提升"快速操作 + 按主题组织 + 跨实例搬运":
- 命令面板:一切操作可搜索执行(Obsidian/Linear 风格),降低发现成本。
- 标签墙:按标签组织检索(标签云 + 分组),补"按主题"维度。
- 剪切板快捷键:画布选区 ⌘C 复制为 DSL,跨实例/给 AI 搬运。

## 地基核实

- **命令面板**:只有 `⌘/` 跳 /search(`search-shortcut.tsx`)。⌘K 因冲突浏览器改 ⌘/(v0.23.2)。无真正命令面板。
- **标签墙**:无标签云/聚合页。TagColor 是 10 色 CSS var(`types.ts`)。ArchiveCardTile 可复用渲染卡。
- **剪切板=DSL 闭环已存在**:dsl-dialog 的 `copySelected`(序列化选中元素→writeText)+ canvas paste 监听(applyDslFromText,BUG-A/B 轮)。**⌘V 已被现有 paste 监听接管**(浏览器 paste 事件)。**只缺 ⌘C 复制选区**。

## 决策汇总

| 项 | 决策 |
|---|---|
| 范围 | 三子特性都做 |
| 命令面板 | 跳转 + 搜索(⌘K 开,modal) |
| 标签墙 | 独立 /tags 页(标签云 + 点展开卡网格) |
| 剪切板 | 画布页 ⌘C 复制选区 DSL(⌘V 靠现有 paste 监听) |
| 快捷键 | ⌘K 开命令面板;⌘/ 并入(也开,聚焦搜索) |

## 设计

### 子特性 1:命令面板

`apps/web/src/features/command-palette/command-palette.tsx`(modal 组件,layout 全局挂载):
- ⌘K(或 ⌘/)全局监听 → 开 modal(preventDefault 接管浏览器 ⌘K)。
- 输入框 + 实时结果列表。匹配:includes(第一版简单,fuzzy 留后续)。
- 命令源:
  - **跳转项**(静态):收件箱/画布/图谱/归档/时间线/搜索/回收站/设置 → router.push。
  - **搜索卡**(动态):复用 searchCards(allCards, query),结果点击 → 开 CardDetailModal(命令面板内嵌,或关面板后开)。
- ESC 关闭。输入态时不接管浏览器原生 ⌘K(input focus)。
- search-shortcut.tsx 改:⌘/ 也开命令面板(不再只跳 /search);或保留 ⌘/ 跳 /search + ⌘K 开面板。**第一版:⌘K 和 ⌘/ 都开命令面板**(统一入口)。

### 子特性 2:标签墙 /tags

`apps/web/src/app/tags/page.tsx` + `apps/web/src/features/tags/tag-cloud.tsx`:
- 聚合所有卡的 tags,按使用次数排序(大字=多)。颜色=TagColor。
- 点标签 → 展开该标签下所有卡的网格(复用 ArchiveCardTile)。
- nav 加"标签"入口(归档后/时间线前)。
- 空状态(无标签)引导。

### 子特性 3:剪切板快捷键(画布 ⌘C)

canvas page 加键盘监听:
- ⌘C(画布有选中元素 + 非编辑态 input/textarea)→ 序列化选中元素为 DSL(复用 serializeCanvas 或 dsl-dialog 的 copySelected 逻辑)→ navigator.clipboard.writeText(dsl) + toast。
- **⌘V 不需额外做**:浏览器 paste 事件已被现有 applyDslFromText 接管(⌘V/Ctrl+V 都触发 paste 事件)。

### 涉及文件

| 文件 | 变更 |
|---|---|
| `apps/web/src/features/command-palette/command-palette.tsx` | 命令面板(新) |
| `apps/web/src/app/layout.tsx` | 挂载命令面板 |
| `apps/web/src/components/search-shortcut.tsx` | ⌘/ 开命令面板 |
| `apps/web/src/lib/i18n/messages.ts` | 命令面板/标签墙 key |
| `apps/web/src/app/tags/page.tsx` | 标签墙页(新) |
| `apps/web/src/features/tags/tag-cloud.tsx` | 标签云(新) |
| `apps/web/src/components/app-menu.tsx` | nav 加标签入口 |
| `apps/web/src/app/canvas/page.tsx` | ⌘C 复制选区 DSL |
| `scripts/_phase3-probe.mjs` | e2e |

### 验收
- `pnpm -r test` 全绿。
- `pnpm -r lint` 零新增(canvas-engine/domain 零错)。
- `pnpm --filter web build` exit 0。
- e2e:⌘K 开命令面板;/tags 渲染标签云;⌘C 复制选区 DSL。
- 静态导出铁律不破。

### YAGNI 边界
- 命令面板画布操作类命令(新建/切画布/DSL 模板)——留后续。
- 命令面板 fuzzy 高级算法(第一版 includes)。
- 命令面板搜索结果精确跳 canvas focus(第一版开 CardDetailModal)。
- 标签墙标签编辑/合并/拖拽。
- ⌘V 额外处理(靠现有 paste)。
- 全局 ⌘V(非画布页粘贴)——不做。
