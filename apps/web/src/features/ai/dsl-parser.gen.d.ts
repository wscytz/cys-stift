// Peggy 生成 parser 的类型垫片(dsl-parser.gen.js 由 `pnpm --filter web gen:dsl` 产出,无内建类型)。
// parse 的返回值结构对应 dsl.peggy 的 Line 规则;dsl-parser.ts 按 LineResult 联合类型解释。
// 重生 parser 不必改本文件(签名稳定)。
export function parse(input: string, options?: { startRule?: string }): unknown
