/**
 * markdown-editor-helpers — 工作台 markdown 编辑器工具栏的纯函数（无 DOM，可单测）。
 *
 * insertMarkdown(text, selStart, selEnd, action) 在文本选区处应用一个 markdown 动作，
 * 返回新文本 + 新选区（光标）。组件层用 textarea ref 的 selectionStart/End 调它，
 * 再用 useEffect 把新选区写回 textarea。
 *
 * 动作分三类（D3 工具栏）：
 *   - wrap（bold/italic/strike/code/link）：选区两侧包语法；无选区插占位符并选中占位符。
 *   - prefix（h2/ul/task/quote）：选区覆盖的每行首加前缀。
 *   - insert（codeblock/table）：在选区处插模板块。
 */
export type MdAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'h2'
  | 'ul'
  | 'task'
  | 'quote'
  | 'codeblock'
  | 'table'

export interface InsertResult {
  text: string
  selStart: number
  selEnd: number
}

/** 把 selStart/selEnd 钳到 [0, text.length] 且 start ≤ end。 */
function clamp(text: string, a: number, b: number): { s: number; e: number } {
  const s = Math.max(0, Math.min(a, text.length))
  const e = Math.max(s, Math.min(b, text.length))
  return { s, e }
}

export function insertMarkdown(
  text: string,
  selStart: number,
  selEnd: number,
  action: MdAction,
): InsertResult {
  const { s, e } = clamp(text, selStart, selEnd)
  const selected = text.slice(s, e)

  /** wrap：选区两侧包 pre/post；无选区插 placeholder 并选中它。 */
  const wrap = (pre: string, post: string, placeholder: string): InsertResult => {
    if (s === e) {
      const next = text.slice(0, s) + pre + placeholder + post + text.slice(e)
      const selS = s + pre.length
      return { text: next, selStart: selS, selEnd: selS + placeholder.length }
    }
    const next = text.slice(0, s) + pre + selected + post + text.slice(e)
    return { text: next, selStart: s + pre.length, selEnd: e + pre.length }
  }

  switch (action) {
    case 'bold':
      return wrap('**', '**', '粗体')
    case 'italic':
      return wrap('*', '*', '斜体')
    case 'strike':
      return wrap('~~', '~~', '删除线')
    case 'code':
      return wrap('`', '`', '代码')
    case 'link': {
      const url = 'url'
      const label = s === e ? '链接文字' : selected
      const inserted = `[${label}](${url})`
      const next = text.slice(0, s) + inserted + text.slice(e)
      // url 位于 s + '[' + label + '](' 之后
      const urlStart = s + 1 + label.length + 2
      return { text: next, selStart: urlStart, selEnd: urlStart + url.length }
    }
    case 'h2':
      return prefixLines(text, s, e, '## ')
    case 'ul':
      return prefixLines(text, s, e, '- ')
    case 'task':
      return prefixLines(text, s, e, '- [ ] ')
    case 'quote':
      return prefixLines(text, s, e, '> ')
    case 'codeblock': {
      const inner = s === e ? '代码块' : selected
      const inserted = '```\n' + inner + '\n```'
      const next = text.slice(0, s) + inserted + text.slice(e)
      const innerStart = s + 4 // "```\n" 长度
      return { text: next, selStart: innerStart, selEnd: innerStart + inner.length }
    }
    case 'table': {
      const tpl = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| a | b | c |'
      const next = text.slice(0, s) + tpl + text.slice(e)
      return { text: next, selStart: s, selEnd: s + tpl.length }
    }
  }
}

/**
 * prefix：给选区覆盖的每个完整行首加 prefix。
 * 选区扩展到从首行行首到末行末尾（含新加的前缀）。
 */
function prefixLines(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string,
): InsertResult {
  const lineStart = text.slice(0, selStart).lastIndexOf('\n') + 1
  let lineEnd = text.indexOf('\n', selEnd)
  if (lineEnd === -1) lineEnd = text.length
  const segment = text.slice(lineStart, lineEnd)
  const lineCount = segment.split('\n').length
  const prefixed = segment
    .split('\n')
    .map((l) => prefix + l)
    .join('\n')
  const next = text.slice(0, lineStart) + prefixed + text.slice(lineEnd)
  const shift = prefix.length * lineCount
  return { text: next, selStart: lineStart, selEnd: lineEnd + shift }
}
