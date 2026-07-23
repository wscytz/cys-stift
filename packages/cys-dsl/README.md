# @cys-stift/dsl

cys-dsl — cy's Stift 画布的**双向文字表示(转义)**。整张画布能压成一段文本,文本也能重建/改画布;任何 AI 或外部工具读写一段文本就能操作画布。

## 是什么

cys-dsl **v7** 文法:**5 种元素**(`card`/`rect`/`frame`/`text`/`arrow`)、6 Bauhaus 色、关系式放置(`right-of`/`below` + `@gap`)、箭头签名(label/color/dash/arrowhead/route/wikilink)、**卡片内容 `@title`(短)/`@content`(长 markdown,`\n` 转义多行)**,以及三条语义 directive:**`@group("名")`**(语义分组,meta.group)、**`@href(#a;#b)`**(卡片显式引用,meta.href id 列表)、**`@compute("公式")`**(安全公式,仅 text,只引用元素几何 `#id.x|y|w|h`;手写 tokenizer + 递归下降,禁裸 eval,不碰卡片内容)。v5 引入内容;v6 将 `freedraw` 移出 DSL;v7 加语义层(group/href/compute)。

## public API

- **grammar**:`DSL_VERSION`、`DSL_KINDS`、`DSL_COLORS`、`DSL_COLOR_ALIASES`、`DSL_GRAMMAR_REFERENCE`、`DSL_MAX_TEXT_LEN`、`DSL_MAX_CONTENT_LEN`、`truncateDslText`(代理对安全截断,parser/sanitize 共用)
- **serialize**:`serializeCanvas`、`serializeCanvasReadable`、`serializeElement`
- **parse**:`parseDsl`、`parseDslWithDiagnostics`、`parseDslStrictWithDiagnostics`(Peggy 语法驱动)
- **sanitize**:`sanitizeDslOps`(opt-in 修正层,防 LLM 产非法值不崩)

## 用法

```ts
import { serializeCanvas, parseDsl, sanitizeDslOps, DSL_GRAMMAR_REFERENCE } from '@cys-stift/dsl'

const text  = serializeCanvas(elements)     // 画布 → 文本
const ops   = parseDsl(text)                // 文本 → ops
const clean = sanitizeDslOps(ops, ctx)      // 修正非法值(永不抛错)
```

## 依赖

- `@cys-stift/canvas-engine`(`CanvasElement` 类型)
- `@cys-stift/domain`(`CardId` 类型)

纯逻辑、框架无关,可独立于 `apps/web` 复用。

## 文法治理

- 增删指令种类 / 属性 / 颜色枚举 → bump `DSL_VERSION`(`dsl-grammar.ts`)。
- 改 Peggy 语法后跑 `pnpm --filter @cys-stift/dsl gen` 重新生成 parser。
- round-trip 契约由 `__tests__/` 守护(roundtrip / v4-stability / robustness)。

## 不变量

- **round-trip**:活跃 kind 的 serialize↔parse 双向稳定。
- **sanitize 永不抛错**:坏输入降级,不整块丢。
- **freedraw 不在 DSL**:freedraw 已出 DSL(程序自管 R2 + 渲染);serialize 按 `DSL_KINDS` 过滤,`[freedraw]` 行 parse 报 unrecognized。点序列/位置都不进 DSL(隐私 + 防 DoS + 存储重/意义低)。
- **Bauhaus 6 色**:不新增色。
- **截断代理对安全**:`truncateDslText` 不劈开 emoji/增补平面字符(不产孤立代理位)。

## 内容能力与边界(v7;内容自 v5 引入)

v5 的卡片内容(`@title`/`@content`)在格式层、apply 层、`/ask` 落库层均已接通(无遗留适配缝)。A/D/E 三处此前的缺口/局限于 2026-07-22 全部闭合:

- **A(`/ask` 落库)**:`applyOpsAndPersist` 建/改卡写回 `@title`/`@content`(create 不再落空标题卡;update 经 post-hoc 回写写回 `Card.title/body`;回滚 + 一次性 undo 覆盖内容);companion live 路径(`makeOnCardCreate`/`makeOnCardUpdate`)同接。锁于 `apps/web` 的 `canvas-host-builder.test.ts`。
- **D(清空内容)**:`@title("")`/`@content("")` parse 成空串 → apply 真写空串清空(锁于 `dsl-content.test.ts`)。serialize 对空串**不发** token(空=默认态,by-design)。
- **E(纯内容/属性编辑)**:现有卡的 `@title`/`@content`/`@color`/`@size` 编辑**可省 `@pos`**(`keepExistingPos` 标志,apply 时几何沿用现有卡);`@pos` 仅在**移动**卡或**建卡**时必需。裸行(无任何字段)/ `create` 无 `@pos` 仍报 `missing @pos`。锁于 `dsl-content.test.ts` + `apply-content.test.ts`。
- DSL 模态编辑器(人读)与 `/ask` agent(AI 写)两条路径对 `@title`/`@content` 行为一致。

**边界(by-design,非局限)**:serialize 不发空 token(空是默认态,无需冗余);`keepExistingPos` 是**输入专用**——serialize 始终发绝对 `@pos`,故 round-trip 序列化格式不变(未 bump `DSL_VERSION`)。

## 预期能力测试(qwen-max-7-21)

`__tests__/qwen-max-7-21-*.test.ts` 是本包自带的**预期能力测试集**(与具体 LLM 解耦的基线 + 可选实弹):

- `qwen-max-7-21-roundtrip`:完整文字化——整张画布(几何 + 内容)无损往返。
- `qwen-max-7-21-ai-grammar`:AI 可驱动·文法侧——真实风格 LLM 输出样本零诊断可解析 + sanitize 不抛。
- `qwen-max-7-21-ai-apply`(在 `apps/web`):AI 可驱动·应用侧——AI 重排 DSL 经 `applyLayout` 真结构化画布。
- `qwen-max-7-21-live-llm`:**live 实测**(env 门控,默认跳过)——真调 LLM(DeepSeek `deepseek-chat` / `deepseek-reasoner`,或 GLM 兜底)只凭语法参考产出合法 DSL。启用:
  `CYS_DSL_LIVE_LLM=1 DEEPSEEK_API_KEY=… pnpm --filter @cys-stift/dsl test qwen-max-7-21-live-llm`。
  prompt 仅含合成画布;key 只进 auth header,不入日志/提交。

## 相关

- 论证与 v5 内容扩展计划:私有仓 `docs/research/2026-07-21-dsl-v5-content-rationale.md`、`docs/plans/2026-07-21-dsl-execution.md`。
- 提取先例:`packages/canvas-engine`(同款"解耦 + 重新打包"打法)。
