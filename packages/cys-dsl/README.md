# @cys-stift/dsl

cys-dsl — cy's Stift 画布的**双向文字表示(转义)**。整张画布能压成一段文本,文本也能重建/改画布;任何 AI 或外部工具读写一段文本就能操作画布。

## 是什么

cys-dsl **v9** 文法:**5 种元素**(`card`/`rect`/`frame`/`text`/`arrow`)、6 色名(legacy 枚举冻结)、**关系式放置**(`right-of`/`below #锚` + `@gap`;v9 起 `@组名` 组级相对锚——锚定组包围盒,支持 `@"含空格名"` 与中文裸名)、箭头签名(label/color/dash/arrowhead/route/wikilink)、**卡片内容 `@title`(短)/`@content`(长 markdown,`\n` 转义多行)**,以及语义 directive:**`@group("名")`**(v7,语义分组)、**`@href(#a;#b)`**(v7,显式引用)、**`@compute("公式")`**(v7,安全公式,仅 text)、**`@type/@tags/@links/@code/@quote`**(v8,卡片结构化字段)。v5 内容;v6 freedraw 出 DSL;v9 组级相对锚(锚位三形态与保留字防线见 `DSL_GRAMMAR_REFERENCE`)。

## public API

- **grammar**:`DSL_VERSION`、`DSL_KINDS`、`DSL_COLORS`、`DSL_COLOR_ALIASES`、`DSL_GRAMMAR_REFERENCE`、`DSL_RESERVED_GROUP_ANCHOR_WORDS`(v9 组锚保留字)、`DSL_MAX_TEXT_LEN`、`DSL_MAX_CONTENT_LEN`、`truncateDslText`(代理对安全截断)
- **serialize**:`serializeCanvas`、`serializeCanvasReadable`、`serializeElement`
- **parse**:`parseDsl`、`parseDslWithDiagnostics`、`parseDslStrictWithDiagnostics`(Peggy 语法驱动)
- **sanitize**:`sanitizeDslOps`(opt-in 修正层,防 LLM 产非法值不崩)
- **solve**:`solveRelational` + `ExistingGeom`/`SolveResult`(关系式 → 绝对坐标;组锚、碰撞避让、断链诊断)
- **adapter**:`toJsonCanvas`(→ JSON Canvas 1.0;integer 坐标、id 去重、跳过留痕)+ `JsonCanvasFile/Node/Edge/SkippedOp` 类型
- **svg**:`toSvg`(零依赖预览级 SVG,CLI `render --svg` 的底层)
- **types**:`CanvasElement` 等边界类型(与 canvas-engine/domain 结构兼容,`types-compat.test.ts` 钉住)

## 用法

```ts
import { serializeCanvas, parseDsl, sanitizeDslOps, solveRelational, DSL_GRAMMAR_REFERENCE } from '@cys-stift/dsl'

const text  = serializeCanvas(elements)     // 画布 → 文本
const ops   = parseDsl(text)                // 文本 → ops
const clean = sanitizeDslOps(ops, ctx)      // 修正非法值(永不抛错)
const solved = solveRelational(clean.ops)   // 关系式 → 绝对坐标
```

## CLI

`pnpm --filter @cys-stift/dsl cli` 或 `tsx src/cli.ts <命令> <file.sift>`(npm 发布后为 `npx`;后缀 `.sift` 为约定,任意文本文件可读):

- `validate` — 语法/卫生/求解全链检查;诊断走 stderr,警告不阻断(exit 0)/ 语法错 exit 1 / 用法错 exit 2。
- `render` — 默认输出 JSON Canvas 1.0(Obsidian `.canvas` 直接可开);`--svg` 输出预览级 SVG。
- `roundtrip` — DSL→元素→DSL 双往返签名比对(转义保真)。

## 依赖

**零运行时依赖**(2026-10-24 剥离定案):src/ 只 import 包内模块与 Node 内建(cli.ts 的 `node:fs`/`node:url`,不进 barrel)。原 `@cys-stift/canvas-engine`/`@cys-stift/domain` 类型依赖已改为包内 `types.ts` 边界副本 + 结构兼容测试(`types-compat.test.ts`);二者仅作为 devDep 供测试比对。框架无关,可独立于本 monorepo 复用。

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
