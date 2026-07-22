/**
 * @cys-stift/dsl — cys-dsl 文本格式包(画布的双向文字表示 / 转义)。
 *
 * 公开 API:grammar 单一源(DSL_VERSION / KINDS / COLORS / GRAMMAR_REFERENCE)+
 * serializer(serializeCanvas / serializeCanvasReadable / serializeElement)+
 * Peggy parser(parseDsl / parseDslWithDiagnostics / parseDslStrictWithDiagnostics)+
 * sanitize(sanitizeDslOps,防 LLM 产非法值不崩的 opt-in 修正层)。
 *
 * 依赖:canvas-engine(CanvasElement 类型)+ domain(CardId 类型)。纯逻辑,框架无关。
 * freedraw 不在 DSL(程序自管 R2 + 渲染);DSL v6 含 5 kind + card title/content。详细见仓库 README。
 */
export * from './dsl-grammar'
export * from './canvas-dsl'
export * from './dsl-parser'
export * from './dsl-sanitize'
