# @cys-stift/dsl

cys-dsl — cy's Stift 画布的**双向文字表示(转义)**。整张画布能压成一段文本,文本也能重建/改画布;任何 AI 或外部工具读写一段文本就能操作画布。

## 是什么

cys-dsl **v4** 文法:6 种元素(`card`/`rect`/`frame`/`text`/`arrow`/`freedraw`)、6 Bauhaus 色、关系式放置(`right-of`/`below` + `@gap`)、箭头签名(label/color/dash/arrowhead/route/wikilink)。几何为主;`freedraw` 仅位置(点序列 R2 隐私,不外发)。

## public API

- **grammar**:`DSL_VERSION`、`DSL_KINDS`、`DSL_COLORS`、`DSL_COLOR_ALIASES`、`DSL_GRAMMAR_REFERENCE`、`DSL_MAX_TEXT_LEN`
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

## 相关

- 论证与 v5 内容扩展计划:私有仓 `docs/research/2026-07-21-dsl-v5-content-rationale.md`、`docs/plans/2026-07-21-dsl-execution.md`。
- 提取先例:`packages/canvas-engine`(同款"解耦 + 重新打包"打法)。
