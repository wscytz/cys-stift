# 块引用 + 全局关系视图设计 — 知识网络 Phase 2a

> 来源:产品方向 A「知识网络」Phase 2。Phase 1(全局图谱视图 /graph)已完成。
> Phase 2 拆 2a/2b:本 spec 是 **2a**(块引用嵌入 + 全局 backlinks 看)。2b(建关系:详情/图谱)等 2a 落地看效果再单独走。

## 背景

Phase 1 图谱补了「整理和回溯」的鸟瞰视图。Phase 2a 补两个更深的「复用 + 关系消费」:
1. **块引用 `((标题))`**:比双链 `[[]]` 更深一层——不是「链接到」,而是「嵌入对方内容」。改一处处处更新。Obsidian/Logseq 的块引用能力。
2. **全局 backlinks 看**:共享版详情页(图谱/搜索用)现在看不到关系(canvas 版才有,且依赖单画布 host)。补上全局关系展示。

## 地基核实

- **MarkdownBody**(`apps/web/src/app/inbox/markdown.tsx`):ReactMarkdown + rehypeSanitize。`[[]]` 在显示层**不渲染成链接**(只物化成 arrow),body 里是普通文本。块引用要预处理 source 才能嵌入。
- **双链物化**:`wiki-links.ts` 的 `syncWikiLinkArrows` 在画布编辑卡 body 时触发,把 `[[标题]]` 物化成 references arrow(meta.wikilink)。inbox 卡不物化(无 host)。块引用对齐此模式。
- **findBacklinks(host, cardId)**(`backlinks.ts`):依赖 host(单画布)。全局化用 Phase 1 的 aggregateEdges 替代(已全局聚合所有画布 arrow)。
- **共享版 CardDetailModal**(`card-detail.tsx`):actions 数组口径,**无 backlinks 区**。canvas 版(`card-detail-modal.tsx`)有 host + backlinks 区。
- **aggregateEdges**(Phase 1):已全局聚合所有画布 arrow → GraphEdge。提升为 hook 即可复用。

## 决策汇总(brainstorming)

| 项 | 决策 |
|---|---|
| 块引用语法 | `((标题))` 同 `[[]]` 风格,重名取首匹配 |
| 嵌入内容 | 完整 body + 递归展开 + 环检测(visited Set) + maxDepth=5 |
| 进图谱 | 物化成新 `embeds` 关系 arrow(yellow/dotted/none) |
| 关系全局化(2a) | 共享版详情加全局 backlinks 区(看);建关系留 2b |

## 设计

### 第 1 节 — 块引用解析 + 物化 + embeds 关系

**解析(纯函数,对齐 wiki-links 模式)** — 新增 `apps/web/src/features/canvas/embed-links.ts`:
- `extractEmbeds(body): string[]` — 正则 `/\(\(([^)]+)\)\)/g` 提取标题,去重保序。
- `syncEmbedArrows({host, getCardIdByTitle, sourceCardId, body})` — 对齐 syncWikiLinkArrows:解析 `((标题))` → 标题查 cardId → 与现有 `meta.embed=true` arrow 做 diff → 建/删 embeds arrow(color=yellow + text='embeds' + meta.embed=true,from=source to=target)。绝不碰手动 arrow(无 meta.embed)。

**与 `[[]]` 关系**:并存独立 sync。`[[标题]]`=references arrow(meta.wikilink);`((标题))`=embeds arrow(meta.embed)。互不干扰。

**embeds 关系类型** — `relation-types.ts` RELATION_TYPES 加第 5 种:
```
embeds: { id:'embeds', color:'yellow', dash:'dotted', arrowhead:'none', labelKey:'relation.embeds', labelColor:'yellow', swatch:'var(--color-yellow)' }
```
`inferRelationType` 自动识别(color=yellow + text=embeds)。

**物化触发**:canvas page 卡 body 保存时(onSave patch.body)调 syncEmbedArrows(同 syncWikiLinkArrows 位置)。inbox 卡不物化(无 host,与 [[]] 一致)。

**标题→cardId 解析** — 新增 `resolveCardByTitle(service, title): CardId | null`(重名取首)。syncEmbedArrows 和渲染层共用。

**设计点**:
1. 环检测在渲染层(不在物化)。物化只建一层 arrow(A embeds B);递归展开在 MarkdownBody 渲染时(B body 里 `((C))` 也展开),visited Set 防环。
2. embeds arrow 不递归物化:A→B、B→C 各自独立 arrow。图谱显示所有 embeds 边(扁平)。
3. `((已删卡))`:resolveCardByTitle 返回 null → 渲染占位"卡片不存在或已删除"(不崩)。

### 第 2 节 — MarkdownBody 递归渲染 + 环检测

MarkdownBody(`apps/web/src/app/inbox/markdown.tsx`)加可选 props(向后兼容):

```ts
export function MarkdownBody({
  source,
  resolveEmbed?,   // (title) => { body: string; title: string } | null
}: { source: string; resolveEmbed?: (t: string) => { body: string; title: string } | null })
```

**渲染逻辑**:
1. `splitEmbeds(source)` 纯函数:正则切分 source 成有序段 `{type:'text'|'embed', value}[]`。单测覆盖。
2. `EmbedRenderer` 子组件递归,持 visited Set:
   - text 段 → MarkdownBlock(现有 ReactMarkdown+rehypeSanitize,抽出复用)。
   - embed 段:无 resolveEmbed → 当文本;visited.has(title) → "↻ 循环引用";resolveEmbed(title)=null → "📌 卡片不存在或已删除";否则递归展开 target.body,visited 加 title。
3. **环检测**:每条嵌入路径维护 visited(标题级),`new Set(visited).add(title)` 复制传入递归,兄弟嵌入不互相污染。
4. **maxDepth=5**:递归深度上限,超过显示"嵌套过深"。

**调用方**:
- canvas card-detail 共享版 + canvas 版:传 `resolveEmbed={(title) => { const c = resolveCardByTitle(service, title); return c ? {body:c.body, title:c.title} : null }}`。
- inbox 列表预览(若用 MarkdownBody):可选传(service.get 不依赖画布)。
- 不传 resolveEmbed:原行为(`((标题))` 当文本,向后兼容)。

**样式(token)**:
```
.md-embed { border-left:2px solid var(--color-yellow); padding-left:var(--space-2); margin:var(--space-1) 0; background:var(--color-gray-soft); }
.md-embed__title { font-family:var(--font-mono); font-size:var(--font-size-xs); color:var(--color-gray); }
.md-embed--missing { color:var(--color-gray); font-style:italic; }
.md-embed--cycle { color:var(--color-red); font-size:var(--font-size-xs); }
```

**设计点**:
1. 向后兼容:resolveEmbed 可选,现有所有 MarkdownBody 调用不破。
2. resolveEmbed 注入:MarkdownBody 不依赖 CardService,调用方传 resolver(解耦,单测 mock)。
3. maxDepth=5 防超长递归;环检测防 A→B→A。

### 第 3 节 — 全局 backlinks(共享版详情页)

**useGlobalEdges hook** — 新增 `apps/web/src/features/graph/use-global-edges.ts`:
```ts
export function useGlobalEdges(): { edges: GraphEdge[]; loaded: boolean }
```
从 Phase 1 图谱页内的聚合逻辑(useEffect + aggregateEdges)提升为可复用 hook。图谱页和详情页共用。

**共享版 CardDetailModal 加 backlinks 区** — `card-detail.tsx` 加可选 props:
- `globalEdges?: GraphEdge[]`(全局关系,按 cardId 过滤 in/out)
- `getCardTitle?: (id: string) => string`
- `onJumpToCard?: (cardId: string) => void`

渲染 backlinks 区(复用 canvas 版 `cd__backlink` 样式):incoming/outgoing,按 relationType 显示签名色 + 标签(blocks/references/derived-from/related-to/embeds)。

**onJumpToCard 跨页(第一版简化)**:
- 图谱页:onJumpToCard = 高亮该节点(复用 hover 淡化逻辑)。
- 搜索页/其它:第一版仅关闭 modal(跨页跳 canvas 的 `?focus=id` 留 2b)。

**调用方**:
- graph page:CardDetailModal 传 useGlobalEdges() + getCardTitle(service.get) + onJumpToCard(高亮节点)。
- 其它用共享版 detail 的页(inbox/archive/search/timeline):传 globalEdges + getCardTitle,onJumpToCard 可选。

**设计点**:
1. 复用 Phase 1 aggregateEdges(提升为 hook),不重新聚合。
2. backlinks UI 复用 canvas 版样式,视觉一致。
3. 共享版 detail 的 props 都可选,不破坏现有调用(graph 之外不传 globalEdges 则不显示 backlinks 区——但建议都传,让关系全局可见)。

### 第 4 节 — 验证 + 文档 + 风险

**涉及文件**:

| 文件 | 变更 |
|---|---|
| `apps/web/src/features/canvas/embed-links.ts` | extractEmbeds + syncEmbedArrows(新) |
| `apps/web/src/features/canvas/relation-types.ts` | RELATION_TYPES 加 embeds |
| `apps/web/src/app/inbox/markdown.tsx` | MarkdownBody 加 resolveEmbed + EmbedRenderer + splitEmbeds |
| `apps/web/src/app/inbox/markdown.test.ts`(或 __tests__) | splitEmbeds 纯函数单测 |
| `apps/web/src/features/graph/use-global-edges.ts` | useGlobalEdges hook(新,从 graph page 提升) |
| `apps/web/src/features/card/card-detail.tsx` | 共享版加 globalEdges + backlinks 区 + resolveEmbed 传入 |
| `apps/web/src/app/canvas/page.tsx` | onSave 调 syncEmbedArrows + 详情传 globalEdges/resolveEmbed |
| `apps/web/src/app/graph/page.tsx` | 用 useGlobalEdges 替代内联聚合 + onJumpToCard 高亮节点 |
| `apps/web/src/lib/i18n/messages.ts` | relation.embeds + backlinks/嵌入 key |
| domain/web 纯函数 | resolveCardByTitle |

**验收**:
- `pnpm -r test` 全绿(splitEmbeds/embed-links/resolveCardByTitle 新单测)。
- `pnpm -r lint` 零新增(canvas-engine/domain 零错)。
- `pnpm --filter web build` exit 0。
- e2e:body 写 `((另一张))` → 详情渲染嵌入块;循环引用显示提示;图谱显示 embeds 边;详情 backlinks 区显示全局关系。
- 静态导出铁律不破。

**YAGNI 边界(2a 不做)**:
- 详情页建关系(2b)。
- 图谱连节点建关系(2b)。
- onJumpToCard 跨页跳 canvas(`?focus=id`)(2b)。
- 嵌入关系图谱显隐开关。
- 块引用编辑器拾取器(第一版手写 `((标题))`)。
- maxDepth 递归缓存(YAGNI,maxDepth=5 防爆即可)。

**风险**:
1. MarkdownBody 改动影响面广(详情/预览都用)。resolveEmbed 可选 + 向后兼容缓解。
2. resolveCardByTitle 重名取首。文档说明(用户重命名消歧)。
3. embeds arrow 只在画布编辑时物化;inbox 卡 `((标题))` 不物化(不进图谱)但**渲染层仍展开嵌入**(resolveEmbed 用 service.get)。与 [[]] 一致,可接受。
