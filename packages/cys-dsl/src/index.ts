/**
 * @cys-stift/dsl — cys-dsl 文本格式包(画布的双向文字表示 / 转义)。
 *
 * 公开 API:grammar 单一源(DSL_VERSION / KINDS / COLORS / GRAMMAR_REFERENCE)+
 * serializer(serializeCanvas / serializeCanvasReadable / serializeElement)+
 * Peggy parser(parseDsl / parseDslWithDiagnostics / parseDslStrictWithDiagnostics)+
 * sanitize(sanitizeDslOps,防 LLM 产非法值不崩的 opt-in 修正层)+
 * relational solver(solveRelational,right-of/below #anchor → 绝对坐标)+
 * JSON Canvas 适配器(toJsonCanvas,cys-dsl → Obsidian .canvas 等通用格式)+
 * 边界类型(types.ts,包内自持的结构性复制,compat 测试钉住)。
 *
 * 依赖:**零运行时依赖**——边界类型包内自持(2026-10-24 引擎剥离,execution-intent 第 1 步;
 * 原依赖 canvas-engine/domain 仅为类型,已由 types.ts 结构性复制替代,devDependencies 保留
 * 供 compat 测试比对)。纯逻辑,框架无关。
 * freedraw 不在 DSL(程序自管 R2 + 渲染)。详细见仓库 README。
 * 注意:cli.ts(node:fs)不进 barrel——CLI 经 `pnpm --filter @cys-stift/dsl cli` 跑。
 */
export * from './dsl-grammar'
export * from './canvas-dsl'
export * from './dsl-parser'
export * from './dsl-sanitize'
export * from './dsl-compute'
export * from './dsl-relational-solver'
export * from './to-json-canvas'
export * from './to-svg'
export * from './types'
