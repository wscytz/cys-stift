/**
 * dsl-compute — v7 `@compute` 的**安全**公式求值器(纯函数,框架无关)。
 *
 * 设计铁律(安全):
 *  - **绝不 eval / new Function**。公式经手写 tokenizer + 递归下降 parser 求值,只认一个
 *    固定的小语言(数字 / + - * / / 括号 / min,max,abs,round / `#id.x|y|w|h` 几何引用)。
 *    任何越界字符 → 求值失败(返回 undefined),不执行。
 *  - **只引用元素几何**(x/y/w/h),**不碰卡片内容**(title/body)→ 无隐私泄漏
 *    (对齐 AI 隐私:content 不外发;这里连内部求值都只读几何)。
 *  - 除零 → 0;非有限结果(NaN/Infinity)→ 0。递归深度上限,防 `((((…))))` 栈炸(DoS)。
 *
 * 语义:apply 时(snapshot 批量)求值,结果写 text 元素的 text;原式存 element.meta.compute
 * 往返对称。**live 重算**(被引用元素一动就重算)是文档化的后续增强,v7 只在每次 apply 重算。
 *
 * 语言(EBNF):
 *   expr   = term (('+'|'-') term)*
 *   term   = factor (('*'|'/') factor)*
 *   factor = '-' factor | number | ref | func '(' args ')' | '(' expr ')'
 *   ref    = '#' idChar+ '.' ('x'|'y'|'w'|'h')
 *   func   = 'min' | 'max' | 'abs' | 'round'     # min/max ≥1 参,abs/round 恰 1 参
 *   args   = expr (',' expr)*
 */

/** 求值器的几何解析器:给元素 id 返回几何,不存在 → undefined(该引用求值失败 → 整式失败)。 */
export interface ComputeGeom {
  x: number
  y: number
  w: number
  h: number
}
export type ComputeResolver = (id: string) => ComputeGeom | undefined

/** 递归深度上限(防嵌套括号栈炸;200 字公式远到不了,纯防御)。 */
const MAX_DEPTH = 64
/** 数字格式化:去浮点噪声,最多 2 位小数,去尾 0(12.00→12, 3.50→3.5)。 */
export function formatComputeNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 100) / 100
  return String(rounded)
}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'ref'; id: string; field: 'x' | 'y' | 'w' | 'h' }
  | { t: 'func'; name: 'min' | 'max' | 'abs' | 'round' }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }

const FUNC_NAMES = new Set(['min', 'max', 'abs', 'round'])
const FIELDS = new Set(['x', 'y', 'w', 'h'])
// id 字符集(与 dsl.peggy idChars 一致);`-` 在内,但 ref 必以 `#` 起头,故不与减号冲突。
const ID_CHAR = /[a-zA-Z0-9_:-]/

/** tokenize:越界字符直接 throw(求值失败)。行级无换行(公式单行)。 */
function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]!
    if (ch === ' ' || ch === '\t') {
      i += 1
      continue
    }
    if (ch === '#') {
      i += 1
      let id = ''
      while (i < n && ID_CHAR.test(src[i]!)) {
        id += src[i]
        i += 1
      }
      if (id === '') throw new Error('empty ref id')
      if (src[i] !== '.') throw new Error('ref missing .field')
      i += 1 // consume '.'
      let field = ''
      while (i < n && /[a-z]/.test(src[i]!)) {
        field += src[i]
        i += 1
      }
      if (!FIELDS.has(field)) throw new Error(`bad ref field: ${field}`)
      toks.push({ t: 'ref', id, field: field as 'x' | 'y' | 'w' | 'h' })
      continue
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = ''
      while (i < n && ((src[i]! >= '0' && src[i]! <= '9') || src[i] === '.')) {
        num += src[i]
        i += 1
      }
      const v = Number(num)
      if (!Number.isFinite(v)) throw new Error(`bad number: ${num}`)
      toks.push({ t: 'num', v })
      continue
    }
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      let name = ''
      while (i < n && /[a-zA-Z]/.test(src[i]!)) {
        name += src[i]
        i += 1
      }
      if (!FUNC_NAMES.has(name)) throw new Error(`unknown func: ${name}`)
      toks.push({ t: 'func', name: name as 'min' | 'max' | 'abs' | 'round' })
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      toks.push({ t: 'op', v: ch })
      i += 1
      continue
    }
    if (ch === '(') {
      toks.push({ t: 'lp' })
      i += 1
      continue
    }
    if (ch === ')') {
      toks.push({ t: 'rp' })
      i += 1
      continue
    }
    if (ch === ',') {
      toks.push({ t: 'comma' })
      i += 1
      continue
    }
    throw new Error(`bad char: ${ch}`)
  }
  return toks
}

/**
 * 求值 `@compute` 公式。成功 → 有限数;任何失败(语法 / 未解析引用 / 越界)→ undefined。
 * 永不抛错(内部 catch)。resolve 用来把 `#id.field` 解析成几何值。
 */
export function evalCompute(expr: string, resolve: ComputeResolver): number | undefined {
  if (typeof expr !== 'string' || expr.trim() === '') return undefined
  let toks: Tok[]
  try {
    toks = tokenize(expr)
  } catch {
    return undefined
  }
  if (toks.length === 0) return undefined

  let pos = 0
  const peek = (): Tok | undefined => toks[pos]
  const next = (): Tok | undefined => toks[pos++]

  function parseExpr(depth: number): number {
    if (depth > MAX_DEPTH) throw new Error('too deep')
    let left = parseTerm(depth + 1)
    for (;;) {
      const tk = peek()
      if (tk && tk.t === 'op' && (tk.v === '+' || tk.v === '-')) {
        next()
        const right = parseTerm(depth + 1)
        left = tk.v === '+' ? left + right : left - right
      } else {
        return left
      }
    }
  }

  function parseTerm(depth: number): number {
    if (depth > MAX_DEPTH) throw new Error('too deep')
    let left = parseFactor(depth + 1)
    for (;;) {
      const tk = peek()
      if (tk && tk.t === 'op' && (tk.v === '*' || tk.v === '/')) {
        next()
        const right = parseFactor(depth + 1)
        if (tk.v === '*') left = left * right
        else left = right === 0 ? 0 : left / right // 除零 → 0(安全,不产 Infinity)
      } else {
        return left
      }
    }
  }

  function parseFactor(depth: number): number {
    if (depth > MAX_DEPTH) throw new Error('too deep')
    const tk = next()
    if (!tk) throw new Error('unexpected end')
    // 一元负号
    if (tk.t === 'op' && tk.v === '-') return -parseFactor(depth + 1)
    if (tk.t === 'num') return tk.v
    if (tk.t === 'ref') {
      const g = resolve(tk.id)
      if (g === undefined) throw new Error(`unresolved ref: #${tk.id}`)
      const v = g[tk.field]
      if (!Number.isFinite(v)) throw new Error(`non-finite geom: #${tk.id}.${tk.field}`)
      return v
    }
    if (tk.t === 'func') {
      const lp = next()
      if (!lp || lp.t !== 'lp') throw new Error('func missing (')
      const args: number[] = []
      // 允许 min() 空?不 —— 至少 1 参。
      args.push(parseExpr(depth + 1))
      while (peek() && peek()!.t === 'comma') {
        next()
        args.push(parseExpr(depth + 1))
      }
      const rp = next()
      if (!rp || rp.t !== 'rp') throw new Error('func missing )')
      switch (tk.name) {
        case 'min':
          return Math.min(...args)
        case 'max':
          return Math.max(...args)
        case 'abs':
          if (args.length !== 1) throw new Error('abs expects 1 arg')
          return Math.abs(args[0]!)
        case 'round':
          if (args.length !== 1) throw new Error('round expects 1 arg')
          return Math.round(args[0]!)
      }
    }
    if (tk.t === 'lp') {
      const v = parseExpr(depth + 1)
      const rp = next()
      if (!rp || rp.t !== 'rp') throw new Error('missing )')
      return v
    }
    throw new Error('unexpected token')
  }

  try {
    const result = parseExpr(0)
    if (pos !== toks.length) return undefined // 尾部残余 → 语法错
    return Number.isFinite(result) ? result : 0
  } catch {
    return undefined
  }
}
