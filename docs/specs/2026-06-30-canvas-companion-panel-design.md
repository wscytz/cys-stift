# 画布 AI 伴侣面板(CanvasCompanionPanel)— 设计契约

> 2026-06-30 · 状态:草案待审
> 范围:画布常驻 AI 面板(对话 + 主动发现),默认开。= /ask spec「画布侧边栏二期」+ labs strategy「/ask 画布侧边栏(默认开,规划中)」的实装,叠加主动发现。

## 1. 动机与定位

v0.40 手测反馈原话:**「AI 现在感知不强」**。根因不是能力不够 —— 已有 8 个 live AI 功能(卡片总结/改写/翻译、AI 排版、AI 聚类、大纲总结、copy-as-prompt、/ask agent、关系推荐)。问题是它们**散 + 被动 + 藏**:

- **散**:入口分布在 card 详情菜单、画布工具栏、/ask 独立页、graph 详情页 4 个地方,无统一 AI 存在感。
- **被动**:全是「按按钮才动」,AI 不会主动参与画布工作流。
- **藏**:/ask(最强、最 Claude-Code 式)在独立页,脱离画布核心流程。

本功能给画布加一个**常驻 AI 面板**,让 AI 从「藏在菜单的工具按钮」变成「坐在画布旁边的伴侣」:你随时能跟它对话(= /ask 搬上画布),它也会主动亮出画布上的发现(重复 / 可关联 / 孤立卡)。

**非 autoCurate**:发现只做到「建议 + 逐条确认」,不做合并/删除/分组(破坏性,归 autoCurateLab,以后)。这条边界是它**默认开、非 lab** 的前提。

契合北极星「画布完全文字化 / AI 可驱动」:对话半边复用 /ask 的 DSL 提议 + 确认门;发现半边把已有分析能力(聚类/关系推荐/找重复)从「按钮」变成「主动浮现」。

## 2. 设计概览

新增 `<CanvasCompanionPanel>`,浮面板(镜像 OutlinePanel 范式),常驻画布右侧。rail 加开关按钮(✨)。两个 tab:

| tab | 性质 | 触发 | token 成本 |
|---|---|---|---|
| **发现** | 主动(push) | 本地预筛常驻 + 点按 AI 深化 | 本地零成本;AI 深挖按需 |
| **对话** | 被动(pull) | 用户发消息 | 仅用户发消息时 |

**面板规格**(镜像 OutlinePanel,右侧加宽):
- 浮面板 `position:absolute`,右侧 `right: var(--space-1)`,`top: calc(var(--app-menu-height) + 3px)`,z-index 30(与 outline/minimap 同层,低于 modal 100)。
- 宽度 360px(对话需要空间;outline 220px 不够)。body `max-height` 封顶 + 内部滚动。
- Bauhaus chrome:白底 + 2px 黑边 + 4px 硬阴影 + `role="group"` + i18n 标题(同 outline/minimap)。
- 折叠态持久(localStorage,同 outline `COLLAPSED_KEY` 范式)+ 上次激活 tab 持久。
- 订阅 `host.onUserChange`(元素增删改 → 重算发现 + 重渲染)+ `host.onSelectionChange`(高亮联动),非轮询(同 outline 债收口范式)。

## 3. 发现 tab —— 本地预筛常驻 + AI 深化

### 3.1 本地预筛(零 AI 零隐私,始终亮)

纯函数 `discoverInsights(elements, cards, opts)` 返回 `Insight[]`,在 `host.onUserChange` 触发 + debounce + memoize 下重算(见 §8 性能)。三类:

| kind | 信号源(复用现有) | 涉及卡 | 动作 |
|---|---|---|---|
| `duplicate` | `findDuplicateGroups`(domain 纯函数,URL/代码/标题归一化等值) | ≥2 一组 | 选中定位 / 建立关联(组内 related-to) / AI 深挖 |
| `relation` | `relation-recommend` 本地四信号(title-mention 3 / title-similar Jaccard 2 / shared-tag 1.5 / content-overlap 1),扩到全画布卡对扫描,封顶 N 对 | 一对 | 选中定位 / 建立关联(推断关系类型) / AI 深挖 |
| `orphan` | 零关系箭头的卡(从 arrow 元素 from/to 反查) | 单卡 | 选中定位 / AI 深挖(找能关联的) |

```ts
interface Insight {
  id: string                  // 稳定 id(内容哈希,免重算抖动)
  kind: 'duplicate' | 'relation' | 'orphan'
  cardIds: string[]           // 涉及卡
  title: string               // i18n 标题(e.g. "3 张疑似重复")
  description?: string        // 一句话理由
  score?: number              // 本地置信(排序用)
  deepened?: boolean          // 是否已 AI 深挖过
  aiNote?: string             // AI 深挖返回的理由/类型建议
}
```

### 3.2 动作

- **选中定位**:选中涉及卡 + 居中(复用 OutlinePanel `focusItem` 的 `elementCenter` + `setView` + `setSelectedIds` 数学)。零改动。
- **建立关联**:upsert relation arrow(`from`/`to` + 经 `applyRelationType` 写语义三维签名)。走 `host.batch` 单 undo 步,可撤销。duplicate 组内连 related-to;relation 对用本地/AI 推断的类型。
- **AI 深挖**:把该 insight 的卡(过 `serializeCardsForAI` allowlist)发给 AI,复用 `cluster.ts` / `relation-recommend-ai.ts` 范式 → 返回更细建议(语义关系类型 + 理由 / 分组依据)。**非破坏性**:只回填 `aiNote` + 可能补一个带类型的「建立关联」动作,不自动合并/删除。走 `streamText`,`structuredOutput: true`(DeepSeek 关思考,同 AI 排版/聚类)。

### 3.3 空态

无发现(画布卡 < 2 或无信号)→ 显示空态文案 + 引导(「画布卡多了,AI 会在这里亮出重复和可关联的」)。

## 4. 对话 tab —— /ask 上画布(live host)

复用 /ask 全套(`agent-prompt.ts` / `extractDslBlocks` / `extractCardRefs` / `AgentConfirmCard` / RAG `searchCards` top-8 / `streamText` 流式)。**唯一架构改动:操作 live host**。

### 4.1 live host 应用路径(关键简化)

| | /ask 独立页(现) | 对话 tab(本功能) |
|---|---|---|
| 读画布状态 | `buildCanvasHostForCanvas` 建 temp host 快照 | 直接读 live host(`host.getElements()`/`getView()`) |
| DSL 应用 | `applyOpsAndPersist`(temp host → persist → 跨页 store 同步) | `applyLayout(adapter, ops)` 直接改 live host(`host.batch` 单 undo) |
| before/after 缩略图 | before = 重建 temp host | before = live host 当前元素快照;after = before 克隆 + applyLayout 预演 |
| 上下文 | 目标画布下拉(默认当前) | 固定 = 当前画布(无下拉) |

- **确认门仍保留**:`AgentConfirmCard` before/after 缩略图 + `diffCanvasSnapshots` 变更摘要 + [应用]/[拒绝]/[让AI改](复用 DslDialog 编辑器)。[应用] 走 live `applyLayout` → undo 历史。
- **思考模式**:沿用 /ask 现行实装行为(实测已对 DeepSeek 关思考,见 `deepseek-thinking-structured-output` 记忆),不在本 spec 重新决定。
- **未配 AI**:tab 显示 `AiSetupCard` 引导(高亮 Ollama),不静默不可用(同 /ask)。

### 4.2 多轮 + 截断

沿用 /ask:`messages: {role,content}[]`,每轮发完整历史,超阈值(20 条)丢最早非 system 消息。对话不持久化(reload 清空,同 /ask MVP;持久化留二期)。

## 5. 关键决定(已与用户确认)

1. **浮面板 vs 持久右栏** → 浮面板(跟 outline 一致、可开关、不挤工具栏)。
2. **两 tab vs 统一 feed** → tabs(发现/对话),心智清晰、好做。统一 feed(AI 在对话流里主动插话)留二期。
3. **live host 操作** → agent 直接改 live host(比 /ask temp host 简单),undo 走 host。
4. **/ask 独立页保留** → 做跨画布/全页对话,不删。本功能是它二期的实装,不是替换。
5. **非破坏性边界** → 发现只做 选中/加箭头/AI 深挖,**不做** 合并/删除/分组(归 autoCurateLab)。

## 6. 分层判定:默认开,非 lab

依 `ai-labs-strategy` spec §2 反向判据(只读 allowlist + 用户确认/可撤销 + 稳定 + 符合核心承诺):

- 发现本地预筛:纯本地零 AI,无隐私/副作用。
- 发现 AI 深挖:只读 allowlist(`serializeCardsForAI`)+ 只回填建议,不改数据。
- 发现建立关联 + 对话 DSL 应用:**用户逐次确认**(确认门 / 点按)+ 可撤销(host undo)+ 非破坏(只加箭头/几何,不删卡)。

labs strategy §3 已把「/ask 画布侧边栏」列在「默认开(规划中,稳定后)」,理由「同 /ask 确认门机制」。本功能整份默认开,不进 LAB_REGISTRY,不经 `useLabEnabled` 守卫。

## 7. 隐私 R2(同现有 AI 路径,无增量)

- 发现本地预筛:零外发。
- AI 深挖 / 对话 RAG:走 `serializeCardsForAI` allowlist —— 无 `source.deviceId` / `media.dataUrl` / `apiKey` / 软删卡(`serializeCardForAI` 对软删卡返回 `''`)。
- DSL / 引用 `[card #id]`:只含几何 + 关系签名 + id/title,不含卡片正文之外。
- 反向断言测试:AI 深挖/对话 prompt 不含 deviceId / dataUrl / 软删卡(同 /ask 验收)。

## 8. 性能守卫

- 本地预筛 `relation` 类是 O(n²) 卡对打分 → **debounce(300ms)+ 封顶 N 对(如 12)+ memoize(输入未变不重算)**。`host.onUserChange` 触发,不每帧跑。
- 大画布(卡 > 50)降级:relation 扫描只跑同标签/标题重叠预筛后的候选对(剪枝),不全量 O(n²)。
- 面板折叠/对话 tab 激活时:发现预筛仍跑(本地廉价),但不渲染 DOM。
- AI 深挖:每 insight 独立请求,不批量(用户点哪个挖哪个),可 abort(切 tab / 关面板)。

## 9. 复用清单(不重造)

| 现有 | 用途 |
|---|---|
| `OutlinePanel` 范式 | 浮面板 chrome / 订阅 / 折叠持久 / focusItem 数学 |
| `findDuplicateGroups`(domain) | 发现 duplicate 类 |
| `relation-recommend`(本地四信号) | 发现 relation 类 |
| `applyRelationType` | 建立关联写语义签名 |
| `cluster.ts` / `relation-recommend-ai.ts` | AI 深挖范式 |
| `agent-prompt` / `extractDslBlocks` / `extractCardRefs` | 对话 tab |
| `AgentConfirmCard` / `diffCanvasSnapshots` | 对话确认门 |
| `applyLayout` | 对话 DSL 应用到 live host |
| `streamText` / `serializeCardsForAI` / `searchCards` | AI 调用 / RAG / 隐私 |
| `AiSetupCard` | 未配 AI 引导 |

## 10. MVP 范围

### 做
- `<CanvasCompanionPanel>` 浮面板 + rail 开关 + 两 tab + 折叠/激活 tab 持久。
- 发现 tab:`discoverInsights` 纯函数(三类)+ 渲染 + 三动作(选中定位 / 建立关联 / AI 深挖)+ 空态。
- 对话 tab:/ask 上画布,live host 应用路径 + 确认门。
- 性能守卫(debounce / 封顶 / memoize / 剪枝)。
- i18n(中英)+ token 化样式 + a11y(role/tab/aria)+ R2 反向断言测试。

### 不做(留二期 / 各 lab)
- 统一 feed(AI 在对话流主动插话)—— 二期。
- 对话持久化 / 历史摘要 —— /ask 二期 defer。
- autoCurate 破坏性批量(合并/归档/分组进 frame)—— autoCurateLab。
- tool-calling 主动检索 —— agentToolCallingLab。
- vision —— visionLab。

## 11. 验收

- [ ] rail ✨ 开关切换面板;折叠态 + 上次 tab reload 保留。
- [ ] 发现 tab:画布有重复/可关联/孤立卡时亮出对应 insight;空画布显空态。
- [ ] 选中定位 → 涉及卡选中 + 居中;建立关联 → relation arrow 落画布 + 可 undo;AI 深挖 → 回填理由(需配 AI,未配引导)。
- [ ] 对话 tab:发消息流式回答;要改画布 → DSL 块 + 确认门 before/after + [应用]落 live host 可 undo / [拒绝] AI 换方案 / [让AI改] 编辑 DSL。
- [ ] 性能:50 卡画布切换/编辑不卡(预筛 debounce + 剪枝)。
- [ ] R2:AI 深挖 + 对话 prompt 反向断言无 deviceId / dataUrl / 软删卡。
- [ ] 默认开,不经 lab 守卫。
- [ ] i18n 中英 + a11y + token 化(build 无裸 hex/px)。
- [ ] build exit 0 + 全量测试绿(canvas-engine + web)。

## 12. 风险

- **面板挤占画布空间**:右侧 360px 浮面板在小屏挡画布。缓解:可折叠 + 拖拽定位(复用 minimap 拖拽范式,二期);MVP 先固定右侧可折叠。
- **发现噪音**:本地预筛可能误报(标题相似但不相关)。缓解:封顶 N + 按 score 排序 + AI 深挖是纠错入口(用户可让 AI 判断)。
- **live host 应用与 /ask persist 路径分叉**:两条路径(独立页 persist / 画布 live)要保持 DSL 应用语义一致(都走 `applyLayout`)。测试覆盖两条路径同一组 ops 结果一致。
- **O(n²) 发现打分**:大画布性能。§8 剪枝 + 封顶;若仍慢,relation 类降为「仅同标签 + 标题重叠预筛后才打分」。
