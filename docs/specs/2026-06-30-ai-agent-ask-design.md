# AI Agent(`/ask`)— 设计契约

> 2026-06-30 · 状态:草案待审
> 范围:MVP = `/ask` 全功能 agent 页;画布侧边栏二期。

## 1. 动机与定位

现有 AI 能力是**一次性黑盒**:点「AI 排版」→ AI 生成 → 直接应用,用户无法干预。
用户要的是 **Claude Code 式 agent**:对话提需求 → AI 提议变更 → **人 review 确认**才落地。

这是转义核心卖点的终极形态:AI 用 DSL(画布的文字化)表达变更,人确认后应用。
完全契合北极星「画布完全文字化 / AI 可驱动」。

## 2. 能力分诊

AI 收到用户消息后,根据意图做三类事(system prompt 教分诊):

| 意图 | AI 行为 | 是否改画布 |
|---|---|---|
| **查知识**(「我关于 React 的笔记」「总结我的想法」) | 基于检索到的卡回答 + 引用 `[card #id]` | 否 |
| **改画布**(「把这些对齐」「连个箭头 A→B」) | 输出 `cys-dsl` 块 + 解释 → 确认门 | 是(确认后) |
| **建卡**(「记一条:明天开会」) | 输出 `cys-dsl` create 指令 → 确认门 | 是(确认后) |

## 3. 核心机制:对话 + DSL 提议 + 确认门

### 3.1 DSL 提议协议

AI 回复是自然语言 + 可选的 `cys-dsl` 代码块:

````text
好的,我把这三张卡水平对齐到 y=100,等距分布:

​```cys-dsl
[card #c1] @pos(100,100) @size(220,80)
[card #c2] @pos(400,100) @size(220,80)
[card #c3] @pos(700,100) @size(220,80)
​```
````

- UI 用正则提取 ` ```cys-dsl ... ``` ` 块 → `parseDslWithDiagnostics` 解析
- 解析失败(格式错)→ 不阻塞对话,显示「AI 的提议格式有误,请它重试」
- 一条 AI 回复可有 0 个(纯回答)或 1 个 DSL 块(多块取首个,MVP)

### 3.2 确认门 UI

DSL 块解析成功后,在该条 AI 消息内嵌确认卡片:

```
┌─ AI 提议改动画布「产品规划」──────────────┐
│  [before 缩略图]  →  [after 缩略图]        │
│  变更:3 张卡移动 · 1 条箭头改签名          │
│  [应用]   [拒绝]   [让 AI 改]              │
└────────────────────────────────────────────┘
```

- **before/after 缩略图**:用 mini canvas 渲染目标画布应用前 / 应用后的元素
  (after = before 克隆 + applyLayout 预演,不写真实 host)
- **变更摘要**:复用 `diffCanvasSnapshots(before, after)` → added/removed/changed 列表
- **[应用]**:applyLayout 到目标画布 host → 进 undo 历史(可撤销)→ 确认卡变「已应用」
- **[拒绝]**:把「用户拒绝了该提议,请换方案」作为新消息喂回 AI,继续对话
- **[让 AI 改]**:打开该 DSL 文本编辑(复用 DslDialog 编辑器)→ 改完再应用

### 3.3 目标画布选择

- `/ask` 页顶部有目标画布下拉(默认当前活跃画布)
- agent 的 DSL 应用到所选画布
- 缩略图 diff 也基于所选画布的当前状态

## 4. 上下文策略(RAG)

用户问题发出前,UI 层先做本地检索,预注入相关卡:

1. `searchCards(allCards, userMessage)` 取 top-N(默认 8)相关卡
2. 走 `serializeCardsForAI`(allowlist)拼进 system/user prompt
3. AI 看到相关卡 → 回答时引用 `[card #id]`,UI 渲染成可点链接(点开 CardDetailModal)

MVP 不做 tool-calling 主动检索(AI 被动看预注入卡)。主动检索留 v2。

## 5. 多轮对话

- 维护 `messages: {role, content}[]`(system + 历史轮 + 新问题)
- 每轮把完整历史发 provider(OpenAI 兼容多轮)
- **token 截断**:历史超阈值(如 20 条)时丢最早的非 system 消息(MVP 简单截断;摘要留 v2)
- 流式输出:复用 `streamText` 的 `onDelta` 增量渲染

## 6. 思考模式适配

- agent 对话**需要推理**(分诊、理解意图、生成 DSL + 解释)→ **不设 `structuredOutput`**(保留思考)
- 但 DSL 提议是结构化输出,思考可能截断 → 用更大 `maxTokens`(8192)+ prompt 强调「DSL 块必须完整」
- 实测验证:思考模式下 agent 能否稳定产出完整 DSL 块(实现时跑真实 API 测)

## 7. 隐私 R2(同现有 AI 排版)

- 预注入卡走 `serializeCardsForAI` allowlist:无 `deviceId` / `media.dataUrl` / `apiKey`
- 软删卡过滤(`searchCards` 已过滤)
- DSL 只含几何 / 关系签名,不含卡片正文内容
- 引用 `[card #id]` 只暴露 id + title(渲染时取),不暴露正文给 UI 之外
- 未配 AI → `/ask` 页显示引导(AiSetupCard),不静默不可用

## 8. MVP 范围(`/ask` 页)

### 做
- `/ask` 路由 + 聊天 UI(消息流 + 输入框 + 流式)
- system prompt(agent 分诊 + cys-dsl 输出契约 + 引用格式)
- RAG 预注入(searchCards top-8)
- DSL 提议提取(` ```cys-dsl ` 块)+ 确认门(before/after 缩略图 + 变更摘要 + 应用/拒绝/让AI改)
- 目标画布下拉
- 引用卡片可点开(CardDetailModal)
- 多轮对话 + 简单 token 截断

### 不做(留 v2)
- 画布侧边栏版(二期)
- tool-calling 主动检索
- 历史摘要(超阈值直接丢老消息)
- 一条回复多个 DSL 块
- 对话持久化(reload 清空,MVP 内存态)

## 9. 复用清单(不重造)

| 现有 | 用途 |
|---|---|
| `streamText` | AI 调用层 |
| `serializeCardsForAI` | RAG 卡片序列化(allowlist) |
| `searchCards` | RAG 检索 |
| `parseDslWithDiagnostics` | DSL 提议解析 |
| `applyLayout` | 确认后应用 |
| `diffCanvasSnapshots` | 确认门变更摘要 |
| `snapshotCanvas` / `formatCanvasSnapshot` | 目标画布上下文(侧边栏二期用) |
| `CardDetailModal` | 引用卡片点开 |
| `AiSetupCard` | 未配 AI 引导 |
| mini canvas 渲染(画布缩略图) | before/after 缩略图 diff |

## 10. 验收

- [ ] `/ask` 能对话,流式渲染回答
- [ ] 问知识 → AI 基于卡片回答 + 引用可点开
- [ ] 要改画布 → AI 输出 DSL 块 → 确认门显示 before/after 缩略图 + 变更摘要
- [ ] [应用] → 目标画布更新 + 可撤销;[拒绝] → AI 换方案;[让AI改] → 编辑 DSL
- [ ] 目标画布下拉切换有效
- [ ] 未配 AI → 引导卡
- [ ] R2: deviceId / media.dataUrl / 软删卡不进 prompt(单测 + 反向断言)
- [ ] build exit 0 + 全量测试绿

## 11. 风险

- **思考模式截断 DSL**:agent 需思考但又输出结构化 DSL。实现时实测 DeepSeek,若截断则考虑:DSL 单独二次生成(先对话理解,再单独结构化输出关思考生成 DSL)。
- **缩略图 diff 实现**:mini canvas 渲染 before/after 是新组件,工作量中等。可降级:先只做变更摘要列表,缩略图二期。
- **DSL 从对话文本提取**:正则找 ` ```cys-dsl ` 块,要处理嵌套/转义边界。
