# @cys-stift/dsl

cys-dsl — cy's Stift 画布的**双向文字表示(转义)**。整张画布能压成一段文本,文本也能重建/改画布;任何 AI 或外部工具读写一段文本就能操作画布。

## 是什么

cys-dsl **v5** 文法:6 种元素(`card`/`rect`/`frame`/`text`/`arrow`/`freedraw`)、6 Bauhaus 色、关系式放置(`right-of`/`below` + `@gap`)、箭头签名(label/color/dash/arrowhead/route/wikilink)、**v5 卡片内容 `@title`(短)/`@content`(长 markdown,`\n` 转义多行)**。几何 + 内容;`freedraw` 仅位置(点序列 R2 隐私,不外发)。

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
- **freedraw 仅位置**:点序列永不进 DSL(隐私 + 防 DoS)。
- **Bauhaus 6 色**:不新增色。
- **截断代理对安全**:`truncateDslText` 不劈开 emoji/增补平面字符(不产孤立代理位)。

## 已知局限(v5)

格式 / 适配层的已知边界,**不是 bug**;多数挂到后续「内容辅助 AI」项目(单开)解决。每项都有测试锁现状(red→green 锚点,接通后断言反转)。

- **DSL 无法"清空"卡片内容(D)**:serialize 对空 `title`/`content` 不产 token,parse/apply 也无"设为空"语义——内容只能**加/改**,不能经 DSL 清空。锁于 `dsl-content.test.ts`。
- **card 行必须有 `@pos`(E)**:无"纯内容编辑"——改 `@title`/`@content` 要重抄坐标,否则该行按 `missing @pos` 丢弃(内容耦合几何)。锁于 `dsl-content.test.ts`。
- **`/ask` agent 落库路径暂不消费内容(A)**:`apps/web` 的 `applyOpsAndPersist` 建卡丢 `@title/@content`(落空标题卡)、改卡未接内容回写、回滚事务不覆盖内容——agent 产出的内容 DSL 在该路径**不写回卡片**。注意格式层(`DSL_GRAMMAR_REFERENCE`)已公示 `@title/@content`,故 agent 被"教"了而此路径"不生效";接通归入内容辅助 AI 项目。锁于 `apps/web` 的 `canvas-host-builder.test.ts`。
- 以上**不影响** DSL 模态编辑器(人读)路径:该路径已接 `onCardCreate`/`onCardUpdate`,人经编辑器读写卡片内容是工作的。

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
