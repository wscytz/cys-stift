#!/usr/bin/env node
/**
 * cys-dsl CLI — .sift 文件的 validate / render / roundtrip(执行意向书 Step 1 第 3 件)。
 *
 * - validate   语法(parse)→ 卫生(sanitize)→ 关系式求解(solve)全链检查,报诊断;
 * - render     转 JSON Canvas 1.0(Obsidian .canvas / React Flow 等通用格式)到 stdout;
 * - roundtrip  DSL→元素→DSL 双往返,签名比对验证转义保真(serialize∘parse 不漂移)。
 *
 * 退出码:0 = 干净;1 = 有诊断/往返发散;2 = 用法或文件读取错误。
 *
 * 结构:纯函数核心(validateText / renderText / roundtripText)进测试与库;
 * 本文件**不进公开 barrel**(node:fs 不许进 web bundle)。
 * 运行:`pnpm --filter @cys-stift/dsl cli <命令> <file.sift>`(tsx,devDep)。
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { DSL_VERSION } from './dsl-grammar'
import { parseDslWithDiagnostics, type DslOp } from './dsl-parser'
import { sanitizeDslOps } from './dsl-sanitize'
import { solveRelational } from './dsl-relational-solver'
import { serializeCanvas, type CardDslContent } from './canvas-dsl'
import { toSvg } from './to-svg'
import {
  toJsonCanvas,
  JSON_CANVAS_DEFAULT_CARD_W,
  JSON_CANVAS_DEFAULT_CARD_H,
  JSON_CANVAS_DEFAULT_TEXT_W,
  JSON_CANVAS_DEFAULT_TEXT_H,
} from './to-json-canvas'
import type { CanvasElement } from './types'

const USAGE = `cys-dsl — cy's Stift 画布 DSL(v${DSL_VERSION})命令行

用法:cys-dsl <命令> <file.sift>
命令:
  validate   语法 / 卫生 / 关系式求解全链检查(诊断报告)
  render     转 JSON Canvas 1.0 到 stdout(Obsidian .canvas 等通用格式);--svg 转 SVG
  roundtrip  DSL→元素→DSL 双往返签名比对(转义保真检查)
退出码:0 = 干净(警告不阻断);1 = 有诊断 / 往返发散;2 = 用法或文件错误
`

/** CLI 结果:stdout(报告/JSON)与 stderr(警告)分流,code 即进程退出码。 */
export type CliResult = { code: 0 | 1; stdout: string; stderr: string }

/** 全链:parse(行级容错丢弃)→ sanitize → solve(关系式→绝对坐标)。 */
function pipeline(text: string) {
  const parsed = parseDslWithDiagnostics(text)
  const sanitized = sanitizeDslOps(parsed.ops)
  const solved = solveRelational(sanitized.ops)
  return { parsed, sanitized, solved }
}

/** parse 丢弃行的标准警告行(stderr 用)。 */
function parseWarnings(parsed: { errors: { line: number; text: string; message: string }[] }): string[] {
  return parsed.errors.map((e) => `parse 丢弃 行${e.line}:${e.message}(源:${e.text})`)
}

// ---------- validate ----------

export function validateText(text: string): CliResult {
  const { parsed, sanitized, solved } = pipeline(text)
  const lines: string[] = [`cys-dsl v${DSL_VERSION} · validate`]
  const errors: string[] = []
  let code: 0 | 1 = 0
  for (const w of parseWarnings(parsed)) {
    code = 1
    errors.push(`✗ ${w}`)
  }
  for (const d of sanitized.diagnostics) errors.push(`⚠ sanitize op#${d.opIndex}:${d.message}`)
  for (const d of solved.diagnostics) errors.push(`⚠ solve op#${d.opIndex}:${d.message}`)
  if (code === 0) {
    const cards = solved.ops.filter((o) => o.type === 'card').length
    const free = solved.ops.filter((o) => o.type === 'free').length
    const arrows = solved.ops.filter((o) => o.type === 'arrow').length
    const warns = sanitized.diagnostics.length + solved.diagnostics.length
    lines.push(
      warns > 0
        ? `✓ ${solved.ops.length} op(card ${cards} / free ${free} / arrow ${arrows})——语法通过;${warns} 条警告见 stderr,不阻断`
        : `✓ ${solved.ops.length} op(card ${cards} / free ${free} / arrow ${arrows})——语法、卫生检查与关系式求解均通过`,
    )
  }
  return {
    code,
    stdout: lines.join('\n') + '\n',
    stderr: errors.length > 0 ? errors.join('\n') + '\n' : '',
  }
}

// ---------- render(JSON Canvas 1.0 / SVG)----------

export function renderText(text: string, opts?: { svg?: boolean }): CliResult {
  const { parsed, sanitized, solved } = pipeline(text)
  const stderrLines = parseWarnings(parsed)
  for (const d of sanitized.diagnostics) stderrLines.push(`sanitize op#${d.opIndex}:${d.message}`)
  for (const d of solved.diagnostics) stderrLines.push(`solve op#${d.opIndex}:${d.message}`)
  if (opts?.svg === true) {
    const { svg, skipped } = toSvg(solved.ops)
    for (const s of skipped) stderrLines.push(`跳过 op#${s.opIndex} ${s.op}:${s.reason}`)
    return {
      code: parsed.errors.length > 0 ? 1 : 0,
      stdout: svg,
      stderr: stderrLines.length > 0 ? stderrLines.join('\n') + '\n' : '',
    }
  }
  const { canvas, skipped } = toJsonCanvas(solved.ops)
  for (const s of skipped) stderrLines.push(`跳过 op#${s.opIndex} ${s.op}:${s.reason}`)
  return {
    code: parsed.errors.length > 0 ? 1 : 0,
    stdout: JSON.stringify(canvas, null, 2) + '\n',
    stderr: stderrLines.length > 0 ? stderrLines.join('\n') + '\n' : '',
  }
}

// ---------- roundtrip ----------

/** toFixed(1) 是 serialize 的数值精度;签名两侧同用,防量化假发散。 */
function r1(n: number): number {
  return Number(n.toFixed(1))
}

/** 元素 id:无 id 的 free/arrow op 用 op 下标生成确定性兜底名(两侧签名同函数,保对齐)。 */
function elemId(id: string | undefined, opIndex: number): string {
  return id ?? `anon-${opIndex}`
}

/** route 兼容规则(parser/serialize 同源):无 route 但有 curve → 视为 curve。 */
function normRoute(op: Extract<DslOp, { type: 'arrow' }>): string | null {
  return op.route ?? (op.curve ? 'curve' : null)
}

/**
 * 参与 roundtrip 的 op:输入专用 op 排除(keepExistingPos 卡 / 自由箭头——
 * 它们依赖宿主画布状态,serializeCanvas 按设计永不输出,双往返中必然消失)。
 */
function roundtrippable(ops: DslOp[]): DslOp[] {
  return ops.filter((op) => {
    if (op.type === 'card' && op.keepExistingPos === true) return false
    if (op.type === 'arrow' && (op.freeArrow || !op.from || !op.to)) return false
    return true
  })
}

/**
 * 归一化签名:比较「语义内容」而非字面文本。排除输入专用字段(create / rel /
 * keepExistingPos),数值过 serialize 同款 toFixed(1) 量化,缺省几何按转换侧同一
 * 缺省值归一。首轮与二轮 ops 各算一次,逐位比对。
 */
function signature(ops: DslOp[]): string[] {
  return ops.map((op, i) => {
    if (op.type === 'card') {
      return JSON.stringify([
        'card',
        op.cardId,
        r1(op.x),
        r1(op.y),
        r1(op.w ?? JSON_CANVAS_DEFAULT_CARD_W),
        r1(op.h ?? JSON_CANVAS_DEFAULT_CARD_H),
        op.color ?? null,
        op.title ?? null,
        op.content ?? null,
        op.cardType ?? null,
        op.tags ?? null,
        op.links ?? null,
        op.code ?? null,
        op.quotes ?? null,
        op.group ?? null,
        op.href ?? null,
      ])
    }
    if (op.type === 'free') {
      // text 的 w/h 不进 DSL(serializer 不 emit @size),签名不含。
      const base: unknown[] = ['free', op.shape, elemId(op.id, i), r1(op.x), r1(op.y)]
      if (op.shape === 'text') {
        base.push(op.text ?? null, op.color ?? null, op.group ?? null, op.compute ?? null)
      } else {
        base.push(
          r1(op.w ?? 0),
          r1(op.h ?? 0),
          op.shape === 'frame' ? (op.text ?? null) : null,
          op.color ?? null,
          op.group ?? null,
        )
      }
      return JSON.stringify(base)
    }
    return JSON.stringify([
      'arrow',
      elemId(op.id, i),
      op.from,
      op.to,
      op.label ?? null,
      op.color ?? null,
      op.dash ?? null,
      op.arrowhead ?? null,
      op.wikilink ?? null,
      op.curve ?? null,
      normRoute(op),
      op.elbow ?? null,
    ])
  })
}

/** solved ops → 最小 CanvasElement[](供 serializeCanvas;与 apply 层同缺省尺寸)。 */
function opsToElements(ops: DslOp[]): CanvasElement[] {
  const elements: CanvasElement[] = []
  ops.forEach((op, i) => {
    if (op.type === 'card') {
      if (op.keepExistingPos === true) return
      elements.push({
        id: op.cardId,
        kind: 'card',
        x: op.x,
        y: op.y,
        w: op.w ?? JSON_CANVAS_DEFAULT_CARD_W,
        h: op.h ?? JSON_CANVAS_DEFAULT_CARD_H,
        rotation: 0,
        ...(op.color !== undefined ? { color: op.color } : {}),
        ...(op.group !== undefined || op.href?.length
          ? {
              meta: {
                ...(op.group !== undefined ? { group: op.group } : {}),
                ...(op.href?.length ? { href: op.href } : {}),
              },
            }
          : {}),
      })
      return
    }
    if (op.type === 'free') {
      if (op.shape === 'text') {
        elements.push({
          id: elemId(op.id, i),
          kind: 'text',
          x: op.x,
          y: op.y,
          w: op.w ?? JSON_CANVAS_DEFAULT_TEXT_W,
          h: op.h ?? JSON_CANVAS_DEFAULT_TEXT_H,
          rotation: 0,
          text: op.text ?? '',
          ...(op.color !== undefined ? { color: op.color } : {}),
          ...(op.group !== undefined || op.compute !== undefined
            ? {
                meta: {
                  ...(op.group !== undefined ? { group: op.group } : {}),
                  ...(op.compute !== undefined ? { compute: op.compute } : {}),
                },
              }
            : {}),
        })
      } else {
        elements.push({
          id: elemId(op.id, i),
          kind: op.shape,
          x: op.x,
          y: op.y,
          w: op.w ?? 0,
          h: op.h ?? 0,
          rotation: 0,
          ...(op.shape === 'frame' ? { text: op.text ?? '' } : {}),
          ...(op.color !== undefined ? { color: op.color } : {}),
          ...(op.group !== undefined ? { meta: { group: op.group } } : {}),
        })
      }
      return
    }
    // arrow:自由箭头(无端点)无法以元素形式往返,跳过(roundtrippable 已排除)。
    if (op.freeArrow || !op.from || !op.to) return
    elements.push({
      id: elemId(op.id, i),
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: op.from,
      to: op.to,
      ...(op.label !== undefined ? { text: op.label } : {}),
      ...(op.color !== undefined ? { color: op.color } : {}),
      ...(op.dash !== undefined ? { dash: op.dash } : {}),
      ...(op.arrowhead !== undefined ? { arrowhead: op.arrowhead } : {}),
      ...(op.curve !== undefined ? { curve: op.curve } : {}),
      ...(op.route !== undefined ? { route: op.route } : {}),
      ...(op.elbow !== undefined ? { elbow: op.elbow } : {}),
      ...(op.wikilink === true ? { meta: { wikilink: true } } : {}),
    })
  })
  return elements
}

/** op₁ 的结构化字段 → CardDslContent(serializeCanvas resolve 注入)。
 *  占位值:tags 色给 canonical 灰(serialize 只读 .value);links fetchedAt 用 epoch(只读 .url)。 */
function collectContent(ops: DslOp[]): Map<string, CardDslContent> {
  const map = new Map<string, CardDslContent>()
  for (const op of ops) {
    if (op.type !== 'card') continue
    const content: CardDslContent = {}
    if (op.title !== undefined) content.title = op.title
    if (op.content !== undefined) content.content = op.content
    if (op.cardType !== undefined) content.type = op.cardType
    if (op.tags?.length) content.tags = op.tags.map((value) => ({ value, color: 'var(--color-gray)' }))
    if (op.links?.length) content.links = op.links.map((url) => ({ url, fetchedAt: new Date(0) }))
    if (op.code?.length) content.codeSnippets = op.code
    if (op.quotes?.length) content.quotes = op.quotes
    if (Object.keys(content).length > 0) map.set(op.cardId, content)
  }
  return map
}

export function roundtripText(text: string): CliResult {
  const { parsed, sanitized, solved } = pipeline(text)
  const stderrLines = parseWarnings(parsed)
  for (const d of sanitized.diagnostics) stderrLines.push(`sanitize op#${d.opIndex}:${d.message}`)
  for (const d of solved.diagnostics) stderrLines.push(`solve op#${d.opIndex}:${d.message}`)

  const pass1 = roundtrippable(solved.ops)
  const contentById = collectContent(solved.ops)
  const dsl2 = serializeCanvas(opsToElements(solved.ops), (id) => contentById.get(id))
  const parsed2 = parseDslWithDiagnostics(dsl2)
  const sanitized2 = sanitizeDslOps(parsed2.ops)
  const solved2 = solveRelational(sanitized2.ops)
  const pass2 = roundtrippable(solved2.ops)

  const sig1 = signature(pass1)
  const sig2 = signature(pass2)
  const lines: string[] = []
  let code: 0 | 1 = 0
  if (sig1.length !== sig2.length) {
    code = 1
    lines.push(`roundtrip:DIVERGED(op 数 ${sig1.length} → ${sig2.length})`)
  } else {
    const diffs: number[] = []
    for (let i = 0; i < sig1.length; i++) if (sig1[i] !== sig2[i]) diffs.push(i)
    if (diffs.length === 0) {
      lines.push(`roundtrip:STABLE(${sig1.length} op 签名一致,转义保真)`)
    } else {
      code = 1
      lines.push(`roundtrip:DIVERGED(${diffs.length}/${sig1.length} op 签名不一致)`)
      for (const i of diffs.slice(0, 5)) {
        lines.push(`  op#${i} 首轮:${sig1[i]}`)
        lines.push(`  op#${i} 二轮:${sig2[i]}`)
      }
    }
  }
  const inputOnly = solved.ops.length - pass1.length
  if (inputOnly > 0) {
    lines.push(`注:${inputOnly} 个输入专用 op(keepExistingPos 卡 / 自由箭头)不参与往返——它们依赖宿主画布状态,serialize 按设计永不输出`)
  }
  return {
    code,
    stdout: lines.join('\n') + '\n',
    stderr: stderrLines.length > 0 ? stderrLines.join('\n') + '\n' : '',
  }
}

// ---------- argv 包装 ----------

export function main(argv: readonly string[]): number {
  const [cmd, file] = argv
  if (!cmd || !file || (cmd !== 'validate' && cmd !== 'render' && cmd !== 'roundtrip')) {
    process.stderr.write(USAGE)
    return 2
  }
  // flag 解析:目前仅 render 认 --svg;其余 flag 一律用法错误(不静默吞)
  const rest = argv.slice(2)
  const unknownFlag = rest.find((f) => f.startsWith('--') && f !== '--svg')
  if (unknownFlag !== undefined || (rest.includes('--svg') && cmd !== 'render')) {
    process.stderr.write(USAGE)
    return 2
  }
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    process.stderr.write(`cys-dsl:读不到文件:${file}\n`)
    return 2
  }
  const result =
    cmd === 'validate'
      ? validateText(text)
      : cmd === 'render'
        ? renderText(text, { svg: rest.includes('--svg') })
        : roundtripText(text)
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  return result.code
}

/* 直接执行时才跑 main(被 import / 测试时不触发)。
 * 用 process.exitCode 而非 process.exit:后者不等 stdout 管道 flush,>64KiB 输出
 * (大画布 render)在 `| jq` 等管道下会静默截断且仍 exit 0。exitCode 让 Node 在
 * 写队列排空后自然退出。 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
